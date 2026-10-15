import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Sql } from '../server/db.js'
import { inspectMigrations } from '../server/migrate.js'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.js'
import { buildBackupArchive, restoreStatements, verifyBackupArchive, planRestore, type BackupRow } from '../server/backup/format.js'
import { getNutritionDayCompleteness, saveNutritionDayCompleteness } from '../server/nutrition/day-completeness.js'
import { readMaintenanceDecisionSnapshot, isMaintenanceDecisionRevisionCurrent } from '../server/intelligence/maintenance-revision.js'
import { dueFollowUps, requireCurrentCalorieRecommendation, surfaceDraft, writeCoachRecommendationResponse } from '../server/intelligence/coach-intelligence.js'
import { randomUUID } from 'node:crypto'

/**
 * Only runs under CI's explicit PIQ_POSTGRES_URL. Uses its own isolated schema
 * and all historical migration files, never DATABASE_URL or production Neon.
 * Database and schema are disposable. Does not export a private owner record.
 */
const url = process.env.PIQ_POSTGRES_URL
const { Client } = pg
const client = new Client({
  connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none',
})
const date = '2026-10-13'
const today = '2026-10-14'
const adapter = { query: async (text: string, params?: unknown[]) =>
  (await client.query(text, params)).rows } as unknown as Sql

function serializedConfirmation(row: Record<string, unknown>): BackupRow {
  const definition = backupTable('nutrition_day_completeness')
  if (!definition) throw new Error('Confirmation table is missing from backup inventory')
  return Object.fromEntries(definition.columns.map(({ name, kind }) => {
    const value = row[name]
    if (value == null) return [name, null]
    if (typeof value === 'boolean') return [name, value]
    if (value instanceof Date) {
      const serialized = value.toISOString()
      return [name, kind === 'date' ? serialized.slice(0, 10) : serialized]
    }
    return [name, String(value)]
  })) as BackupRow
}

describe.skipIf(!url)('PIQ-1.1 full 0001–0053 migration-chain and backup on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!url) return
    await client.connect()
    await client.query('CREATE SCHEMA piq_full_chain')
    await client.query('SET search_path TO piq_full_chain, public')
    await client.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const migrations = await inspectMigrations()
    expect(migrations.at(-1)?.filename).toBe(LATEST_SCHEMA_MIGRATION)
    expect(migrations).toHaveLength(53)
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        for (const [index, statement] of migration.statements.entries()) {
          try {
            await client.query(statement)
          } catch {
            throw new Error('Full migration replay failed: ' + migration.filename + ' statement ' + (index + 1))
          }
        }
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration.filename])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    }
  }, 180_000)

  afterAll(async () => {
    if (!url) return
    try { await client.query('DROP SCHEMA IF EXISTS piq_full_chain CASCADE') }
    finally { await client.end() }
  }, 30_000)

  it('applied each migration exactly once without creating historical owner confirmations', async () => {
    const history = await client.query('SELECT filename FROM schema_migrations ORDER BY filename')
    expect(history.rowCount).toBe(53)
    expect(history.rows.at(-1)?.filename).toBe('0053_nutrition_day_completeness.sql')
    const count = await client.query('SELECT count(*)::int AS count FROM nutrition_day_completeness')
    expect(count.rows[0].count).toBe(0)
    const unreviewed = await getNutritionDayCompleteness(date, adapter, today)
    expect(unreviewed.assessment).toMatchObject({ state: 'unknown', eligibleForMaintenance: false })
  })

  it('restores the owner confirmation row after a full-format archive validates', async () => {
    const inserted = await client.query(`
      INSERT INTO nutrition_entries (log_date, timezone, food_name, serving_quantity,
        serving_unit, calories, source_kind, evidence_quality)
      VALUES ($1::date, 'America/Phoenix', 'Fictional complete-day intake',
        1, 'serving', 1850, 'manual', 'owner_entered') RETURNING id
    `, [date])
    expect(inserted.rowCount).toBe(1)
    const initial = await getNutritionDayCompleteness(date, adapter, today)
    expect(initial.version).toBe(0)
    const reported = await saveNutritionDayCompleteness({
      date, ownerReport: 'complete', expectedRevision: initial.entryRevision,
      expectedVersion: 0, zeroIntakeFast: false,
    }, adapter, today)
    expect(reported.assessment.eligibleForMaintenance).toBe(true)

    const dbRows = await client.query('SELECT * FROM nutrition_day_completeness WHERE health_date = $1::date', [date])
    const canonical = serializedConfirmation(dbRows.rows[0])
    const archive = buildBackupArchive({
      profile: 'full', createdAt: '2026-10-14T18:00:00.000Z',
      schemaMigration: LATEST_SCHEMA_MIGRATION, appVersionOrCommit: 'piq-synthetic',
      rowsByTable: { nutrition_day_completeness: [canonical] },
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.nutrition_day_completeness).toEqual([canonical])
    const planned = planRestore({
      verified, destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: { nutrition_day_completeness: 0 },
    })
    expect(planned.blocked).toBe(false)

    await client.query('DELETE FROM nutrition_day_completeness WHERE health_date = $1::date', [date])
    expect((await client.query('SELECT count(*)::int AS count FROM nutrition_day_completeness')).rows[0].count).toBe(0)
    const confirmationInsert = restoreStatements(verified.tables)
      .filter((statement) => statement.text.startsWith('INSERT INTO nutrition_day_completeness '))
    expect(confirmationInsert).toHaveLength(1)
    await client.query(confirmationInsert[0]!.text, confirmationInsert[0]!.params)
    const restored = await getNutritionDayCompleteness(date, adapter, today)
    expect(restored).toMatchObject({
      version: 1, ownerReport: 'complete',
      assessment: { state: 'confirmed_complete', eligibleForMaintenance: true },
    })

    // Restoring a report does not freeze the food log or defeat stale-revision checks.
    await client.query('UPDATE nutrition_entries SET calories = 2100 WHERE id = $1::uuid', [inserted.rows[0].id])
    const corrected = await getNutritionDayCompleteness(date, adapter, today)
    expect(corrected).toMatchObject({
      assessment: { state: 'unknown', confirmationStale: true, eligibleForMaintenance: false },
    })
  })
  it('PIQ-1.2: real SQL revision changes after a target edit and is restored by transaction rollback', async () => {
    const before = await readMaintenanceDecisionSnapshot(today, adapter)
    expect(before.status).toBe('available')
    expect(before.revision).toMatch(/^[a-f0-9]{32}$/)
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO nutrition_targets (effective_from, calories_target, protein_target)
         VALUES ($1::date, 2400, 140)`,
        ['2026-10-12'],
      )
      const inserted = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(inserted).toMatchObject({
        status: 'available', currentCalorieTarget: 2400, activeExperimentCount: 0,
      })
      expect(inserted.revision).not.toBe(before.revision)
      expect(await isMaintenanceDecisionRevisionCurrent(today, before.revision, adapter)).toBe(false)
      await client.query(
        'UPDATE nutrition_targets SET calories_target = 2200, updated_at = now() WHERE effective_from = $1::date',
        ['2026-10-12'],
      )
      const changed = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(changed.currentCalorieTarget).toBe(2200)
      expect(changed.revision).not.toBe(inserted.revision)
      expect(await isMaintenanceDecisionRevisionCurrent(today, changed.revision, adapter)).toBe(true)
    } finally {
      await client.query('ROLLBACK')
    }
    const restored = await readMaintenanceDecisionSnapshot(today, adapter)
    expect(restored.revision).toBe(before.revision)
  })

  it('PIQ-1.2: SQL filters >24 stale accepted calorie rows BEFORE limiting visible follow-ups', async () => {
    await client.query('BEGIN')
    try {
      const asOf = today
      for (let i = 0; i < 32; i += 1) {
        await client.query(
          `INSERT INTO coach_recommendations (
             id, fingerprint, recommendation_kind, domain, title, detail, action_text, detail_path,
             confidence, evidence_refs, surfaced_on, last_surfaced_on,
             response_state, response_at, follow_up_on, metadata
           ) VALUES ($1::uuid, $2, 'review_intake_adjustment', 'nutrition', 'Old cut',
             'Old advice', 'Review', '/nutrition', 'high', '[]'::jsonb,
             $3::date, $3::date, 'do_this', now(), $3::date, $4::jsonb)`,
          [randomUUID(), 'stale-' + i, '2026-09-01', JSON.stringify({ decisionRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })],
        )
      }
      for (let i = 0; i < 4; i += 1) {
        await client.query(
          `INSERT INTO coach_recommendations (
             id, fingerprint, recommendation_kind, domain, title, detail, action_text, detail_path,
             confidence, evidence_refs, surfaced_on, last_surfaced_on,
             response_state, response_at, follow_up_on, metadata
           ) VALUES ($1::uuid, $2, 'training_progression', 'training', 'Bench review',
             'Check form', 'Review', '/training', 'moderate', '[]'::jsonb,
             $3::date, $3::date, 'do_this', now(), $3::date, '{}'::jsonb)`,
          [randomUUID(), 'bench-' + i, '2026-10-01'],
        )
      }
      const due = await dueFollowUps(adapter, asOf, 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', [])
      expect(due).toHaveLength(3)
      expect(due.every((x) => x.recommendation_kind === 'training_progression')).toBe(true)
      expect(new Set(due.map((x) => x.fingerprint)).size).toBe(3)
      expect(due.every((x) => /^bench-[0-3]$/.test(x.fingerprint))).toBe(true)
      const noRevision = await dueFollowUps(adapter, asOf, null, [])
      expect(noRevision.map((x) => x.fingerprint)).toEqual(due.map((x) => x.fingerprint))
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.2: accepted saved calorie card retains original revision under a later ON CONFLICT surface', async () => {
    await client.query('BEGIN')
    try {
      const oldRevision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const newerRevision = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const fingerprint = 'coach:i9:maintenance:review-intake'
      const draft = {
        fingerprint, sourceId: 'maintenance:review-intake', kind: 'review_intake_adjustment',
        domain: 'nutrition', title: 'Review a cut', detail: 'Manual review only', actionText: 'Review',
        detailPath: '/nutrition', confidence: 'high' as const, evidenceRefs: ['maintenance:estimate'],
        priority: 100, experimentEligible: false,
      }
      const initially = await surfaceDraft(adapter, draft, today, oldRevision)
      await client.query(
        `UPDATE coach_recommendations SET response_state = 'do_this', response_at = now(),
         follow_up_on = $2::date WHERE id = $1::uuid`,
        [initially.id, today],
      )
      const resurfaced = await surfaceDraft(adapter, { ...draft, detail: 'Changed recommendation narrative' }, today, newerRevision)
      expect(resurfaced.id).toBe(initially.id)
      expect(resurfaced.metadata?.decisionRevision).toBe(oldRevision)
      expect(resurfaced.response_state).toBe('do_this')
      expect(resurfaced.response_at).not.toBeNull()
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.2: saved-id action rechecks live SQL target changes and refuses a stale or legacy ID', async () => {
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO nutrition_targets (effective_from, calories_target, protein_target)
         VALUES ($1::date, 2400, 140)`, ['2026-10-12'],
      )
      const initial = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(initial.status).toBe('available')
      if (!initial.revision) throw new Error('Expected revision')
      const draft = {
        fingerprint: 'coach:i9:maintenance:review-intake', sourceId: 'maintenance:review-intake',
        kind: 'review_intake_adjustment', domain: 'nutrition', title: 'Manual calorie review',
        detail: 'Original owner-visible advice', actionText: 'Review', detailPath: '/nutrition',
        confidence: 'high' as const, evidenceRefs: ['maintenance:estimate'],
        priority: 100, experimentEligible: false,
      }
      const saved = await surfaceDraft(adapter, draft, today, initial.revision)
      const makeControl = (revision: string) => ({
        state: 'act', nutritionQuality: { state: 'met' },
        primaryOpportunity: {
          id: 'maintenance:review-intake', kind: 'review_intake_adjustment',
          domain: 'nutrition', title: draft.title, detail: draft.detail,
          actionText: 'Review', detailPath: '/nutrition', evidenceRefs: [],
        },
        maintenance: { decisionRevision: revision, interventions: [] },
        trainingAdherence: { state: 'on_track' },
        limitations: [],
      }) as unknown as NonNullable<Parameters<typeof requireCurrentCalorieRecommendation>[2]>
      const checkRevision = (day: string, rev: string | null | undefined) =>
        isMaintenanceDecisionRevisionCurrent(day, rev, adapter)
      await expect(requireCurrentCalorieRecommendation(saved, today, makeControl(initial.revision), checkRevision)).resolves.toBeUndefined()
      await client.query(
        `UPDATE nutrition_targets SET calories_target = 2200, updated_at = now()
         WHERE effective_from = $1::date`, ['2026-10-12'],
      )
      const updated = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(updated.revision).not.toBe(initial.revision)
      await expect(writeCoachRecommendationResponse(
        adapter, saved.id, 'do_this', today,
        (persisted) => requireCurrentCalorieRecommendation(persisted, today, makeControl(initial.revision), checkRevision),
      )).rejects.toThrow('no longer current')
      await expect(requireCurrentCalorieRecommendation(saved, today, makeControl(updated.revision!), checkRevision))
        .rejects.toThrow('no longer current')
      await client.query(
        `UPDATE coach_recommendations SET metadata = '{}'::jsonb WHERE id = $1::uuid`,
        [saved.id],
      )
      await expect(writeCoachRecommendationResponse(
        adapter, saved.id, 'do_this', today,
        (persisted) => requireCurrentCalorieRecommendation(persisted, today, makeControl(updated.revision!), checkRevision),
      )).rejects.toThrow('no longer current')
      const historic = await client.query(
        'SELECT response_state, outcome_state, metadata FROM coach_recommendations WHERE id = $1::uuid', [saved.id],
      )
      expect(historic.rows).toHaveLength(1)
      expect(historic.rows[0].metadata).toEqual({})
      expect(historic.rows[0].response_state).toBeNull()
    } finally {
      await client.query('ROLLBACK')
    }
  })

})
