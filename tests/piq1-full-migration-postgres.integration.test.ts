import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import {readFileSync} from 'node:fs'
import {EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL, EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION} from '../server/lab/experiment-results.js'
import type { Sql } from '../server/db.js'
import { inspectMigrations } from '../server/migrate.js'
import { assessMigrationHistory, readMigrationHistory } from '../server/migration-history.js'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.js'
import { buildBackupArchive, restoreStatements, verifyBackupArchive, planRestore, type BackupRow } from '../server/backup/format.js'
import { getNutritionDayCompleteness, saveNutritionDayCompleteness } from '../server/nutrition/day-completeness.js'
import { readMaintenanceDecisionSnapshot, isMaintenanceDecisionRevisionCurrent } from '../server/intelligence/maintenance-revision.js'
import { activeCalorieDecisionInRevision, dueFollowUps, requireCurrentCalorieRecommendation, surfaceDraft, writeCoachRecommendationResponse, writeCoachRecommendationOutcome } from '../server/intelligence/coach-intelligence.js'
import { randomUUID } from 'node:crypto'
import { experimentEvidenceFingerprint } from '../src/domain/experiment-results.js'
import { OWNER_OUTCOME_FEEDBACK_INSERT_SQL, OWNER_OUTCOME_FEEDBACK_HISTORY_SQL } from '../server/lab/outcome-feedback.js'
import { reviewFeedbackHistory } from '../src/domain/experiment-evidence-memory.js'
import { parseExperimentComparisonSnapshot } from '../src/domain/experiment-comparison-snapshot.js'
import { readPrimaryGoalIntent, savePrimaryGoalIntent } from '../server/goals/primary-intent.js'
import { getHealthProfile, putHealthProfile } from '../server/profile/service.js'
import { PERFORMED_STRENGTH_EXERCISES_SQL } from '../server/training/plan-service.js'
import { buildTrainingWeekQualification, buildTrainingRoutineCredits, type PerformedExerciseEvidence } from '../src/domain/training-qualification.js'
import { buildTrainingProgressSummary } from '../src/domain/training-progress-summary.js'
import {
  buildGuardedWorkoutEditQueries, DELETE_WORKOUT_SESSION_CAS_SQL,
  DETACH_TRANSCRIPTION_SESSION_GUARDED_SQL, DELETE_WORKOUT_SESSION_GUARDED_SQL,
  type PreparedManualSession,
} from '../server/training/service.js'

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

/** Fictional performed Training sessions in this isolated migration test DB.
 * All inserted rows are transaction-rolled-back and never reach owner data.
 */
async function insertFictionalWorkout(input: {
  workoutDate: string
  sessionType: 'ad_hoc' | 'programmed' | 'experiment'
  routineCode?: string
  exercises: Array<{ externalId: string; setType?: 'working' | 'warmup' }>
}): Promise<{ sessionId: string; exerciseRows: string[] }> {
  const sessions = await client.query(
    `INSERT INTO workout_sessions
      (workout_date, session_type, routine_code, source_kind)
     VALUES ($1::date, $2, $3, 'manual') RETURNING id::text AS id`,
    [input.workoutDate, input.sessionType, input.routineCode ?? null],
  )
  const sessionId = String(sessions.rows[0].id)
  const exerciseRows: string[] = []
  for (const [index, exercise] of input.exercises.entries()) {
    const definitions = await client.query(
      'SELECT id::text AS id, name FROM exercise_definitions WHERE external_id = $1',
      [exercise.externalId],
    )
    if (definitions.rows.length !== 1) throw new Error('Missing seeded exercise: ' + exercise.externalId)
    const row = await client.query(
      `INSERT INTO workout_session_exercises
        (workout_session_id, exercise_definition_id, position, exercise_name)
       VALUES ($1::uuid, $2::uuid, $3, $4) RETURNING id::text AS id`,
      [sessionId, definitions.rows[0].id, index + 1, definitions.rows[0].name],
    )
    const exerciseRowId = String(row.rows[0].id)
    exerciseRows.push(exerciseRowId)
    await client.query(
      `INSERT INTO workout_sets
         (workout_session_exercise_id, set_number, set_type, load_state, reps)
       VALUES ($1::uuid, 1, $2, 'bodyweight', 8)`,
      [exerciseRowId, exercise.setType ?? 'working'],
    )
  }
  return { sessionId, exerciseRows }
}

async function actualTrainingEvidence(asOf: string): Promise<PerformedExerciseEvidence[]> {
  const rows = await adapter.query(
    PERFORMED_STRENGTH_EXERCISES_SQL,
    ['2026-10-12', asOf, null],
  ) as Array<{ date: string; exercise_id: string; routine_code: string | null }>
  return rows.map((row) => ({
    date: row.date, exerciseId: row.exercise_id, routineCode: row.routine_code,
  }))
}

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

describe.skipIf(!url)('PIQ-1.1 full numbered migration chain and backup on isolated PostgreSQL', () => {
  beforeAll(async () => {
    if (!url) return
    await client.connect()
    await client.query('CREATE SCHEMA piq_full_chain')
    await client.query('SET search_path TO piq_full_chain, public')
    await client.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const migrations = await inspectMigrations()
    expect(migrations.at(-1)?.filename).toBe(LATEST_SCHEMA_MIGRATION)
    expect(migrations).toHaveLength(Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)))
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
    expect(history.rowCount).toBe(Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)))
    expect(history.rows.at(-1)?.filename).toBe(LATEST_SCHEMA_MIGRATION)
    const count = await client.query('SELECT count(*)::int AS count FROM nutrition_day_completeness')
    expect(count.rows[0].count).toBe(0)
    const unreviewed = await getNutritionDayCompleteness(date, adapter, today)
    expect(unreviewed.assessment).toMatchObject({ state: 'unknown', eligibleForMaintenance: false })
  })

  it('PIQ-7: the migrated PostgreSQL schema passes a read-only migration prefix check', async () => {
    const history = await readMigrationHistory(adapter)
    const expected = (await inspectMigrations()).map((item) => item.filename)
    expect(assessMigrationHistory(expected, history, LATEST_SCHEMA_MIGRATION))
      .toMatchObject({ status: 'current', reason: 'CURRENT', appliedCount: Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)) })
    await client.query('BEGIN')
    try {
      await client.query(
        'DELETE FROM schema_migrations WHERE filename = $1',
        ['0054_coach_plateau_active_unique.sql'],
      )
      const broken = await readMigrationHistory(adapter)
      expect(assessMigrationHistory(expected, broken, LATEST_SCHEMA_MIGRATION))
        .toMatchObject({ status: 'blocked', reason: 'OUT_OF_SEQUENCE_HISTORY' })
    } finally {
      await client.query('ROLLBACK')
    }
    expect(assessMigrationHistory(expected, await readMigrationHistory(adapter), LATEST_SCHEMA_MIGRATION))
      .toMatchObject({ status: 'current', reason: 'CURRENT' })
  })

  it('PIQ-2.3: owner-selected primary goal has immutable revisions and no inferred default', async () => {
    await client.query('BEGIN')
    try {
      const unset = await readPrimaryGoalIntent(adapter, '2026-10-15')
      expect(unset).toMatchObject({ version: 0, source: 'unset', primaryGoalId: null })
      const goalId = randomUUID()
      const source = await client.query("SELECT id FROM data_sources WHERE key = 'manual' LIMIT 1")
      expect(source.rowCount).toBe(1)
      await client.query(
        `INSERT INTO goals (id, goal_kind, status, started_on, source_id)
         VALUES ($1::uuid, 'training_frequency', 'active', '2026-10-15', $2::uuid)`,
        [goalId, source.rows[0].id],
      )
      const one = await savePrimaryGoalIntent(
        adapter, '2026-10-15', { primaryGoalId: goalId, expectedVersion: 0 },
      )
      expect(one).toMatchObject({ primaryGoalId: goalId, version: 1, source: 'owner' })
      await expect(savePrimaryGoalIntent(
        adapter, '2026-10-15', { primaryGoalId: null, expectedVersion: 0 },
      )).rejects.toMatchObject({ statusCode: 409 })
      const two = await savePrimaryGoalIntent(
        adapter, '2026-10-16', { primaryGoalId: null, expectedVersion: 1 },
      )
      expect(two).toMatchObject({ primaryGoalId: null, version: 2, source: 'owner' })
      expect((await readPrimaryGoalIntent(adapter, '2026-10-15')).primaryGoalId).toBe(goalId)
      expect((await readPrimaryGoalIntent(adapter, '2026-10-16')).primaryGoalId).toBeNull()
      expect(await readPrimaryGoalIntent(adapter, '2026-10-14')).toMatchObject({
        source: 'unset', version: 0,
      })
      const events = await client.query('SELECT version FROM primary_goal_intent_events ORDER BY version')
      expect(events.rows.map((row) => row.version)).toEqual([1, 2])
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-2.1: physiological sex is unset by default, owner-editable, and validated in PostgreSQL', async () => {
    await client.query('BEGIN')
    try {
      await client.query('INSERT INTO health_profile (singleton_id) VALUES (1)')
      const initial = await client.query('SELECT sex_for_physiology FROM health_profile WHERE singleton_id = 1')
      expect(initial.rows[0]?.sex_for_physiology).toBeNull()
      for (const value of ['male', 'female', 'other', null]) {
        await client.query('UPDATE health_profile SET sex_for_physiology = $1 WHERE singleton_id = 1', [value])
        const current = await client.query('SELECT sex_for_physiology FROM health_profile WHERE singleton_id = 1')
        expect(current.rows[0]?.sex_for_physiology).toBe(value)
      }
      await client.query('SAVEPOINT invalid_physio_sex')
      await expect(client.query(
        "UPDATE health_profile SET sex_for_physiology = 'MALE' WHERE singleton_id = 1",
      )).rejects.toMatchObject({ code: '23514' })
      await client.query('ROLLBACK TO SAVEPOINT invalid_physio_sex')
      const rows = await client.query('SELECT sex_for_physiology FROM health_profile WHERE singleton_id = 1')
      expect(rows.rows[0]?.sex_for_physiology).toBeNull()
    } finally {
      await client.query('ROLLBACK')
    }
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
             $3::date, $3::date, 'do_this', now(), $3::date, '{"ownerStarted":true}'::jsonb)`,
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


  it('PIQ-1.5: PostgreSQL response CAS preserves the first owner decision and started provenance across reads', async () => {
    await client.query('BEGIN')
    try {
      const draft = {
        fingerprint: 'coach:piq:cas:' + randomUUID(), sourceId: 'training:check:cas',
        kind: 'training_progression', domain: 'training', title: 'Review lift',
        detail: 'Check progress.', actionText: 'Review', detailPath: '/training',
        confidence: 'moderate' as const, evidenceRefs: ['training:strength'],
        priority: 80, experimentEligible: true,
      }
      const initial = await surfaceDraft(adapter, draft, today, null)
      expect(initial.response_at).toBeNull()
      await writeCoachRecommendationResponse(
        adapter, initial.id, 'do_this', today, async () => undefined, true, initial.response_at,
      )
      const first = await client.query(
        'SELECT response_state, metadata, response_at::text AS response_at FROM coach_recommendations WHERE id = $1::uuid',
        [initial.id],
      )
      expect(first.rows[0].response_state).toBe('do_this')
      expect(first.rows[0].metadata.ownerStarted).toBe(true)
      await expect(writeCoachRecommendationResponse(
        adapter, initial.id, 'not_relevant', today, async () => undefined, false, initial.response_at,
      )).rejects.toMatchObject({ statusCode: 409 })
      const after = await client.query(
        'SELECT response_state, metadata, response_at::text AS response_at FROM coach_recommendations WHERE id = $1::uuid',
        [initial.id],
      )
      expect(after.rows[0]).toEqual(first.rows[0])
      const resurfaced = await surfaceDraft(adapter, { ...draft, detail: 'Updated context' }, today, null)
      expect(resurfaced.response_at).toBe(first.rows[0].response_at)
      expect(resurfaced.metadata?.ownerStarted).toBe(true)
      await writeCoachRecommendationResponse(
        adapter, initial.id, 'not_relevant', today, async () => undefined, false, resurfaced.response_at,
      )
      const dismissed = await client.query(
        'SELECT response_state, metadata FROM coach_recommendations WHERE id = $1::uuid', [initial.id],
      )
      expect(dismissed.rows[0].response_state).toBe('not_relevant')
      expect(dismissed.rows[0].metadata.ownerStarted).toBeUndefined()
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.5: PostgreSQL outcomes refuse stale tabs, early reviews, and duplicate feedback', async () => {
    await client.query('BEGIN')
    try {
      const draft = {
        fingerprint: 'coach:piq:outcome:' + randomUUID(), sourceId: 'training:outcome',
        kind: 'training_progression', domain: 'training', title: 'Review progression',
        detail: 'Consider adjusting form.', actionText: 'Review', detailPath: '/training',
        confidence: 'moderate' as const, evidenceRefs: ['training:strength'],
        priority: 80, experimentEligible: true,
      }
      const initial = await surfaceDraft(adapter, draft, today, null)
      await writeCoachRecommendationResponse(
        adapter, initial.id, 'do_this', today, async () => undefined, true, null,
      )
      const current = await client.query(
        'SELECT response_at::text AS response_at FROM coach_recommendations WHERE id = $1::uuid',
        [initial.id],
      )
      const oldRevision = String(current.rows[0].response_at)
      await expect(writeCoachRecommendationOutcome(
        adapter, initial.id, 'helped', today, oldRevision,
      )).rejects.toMatchObject({ statusCode: 409 })
      await client.query(
        "UPDATE coach_recommendations SET response_at = response_at + interval '1 second' WHERE id = $1::uuid",
        [initial.id],
      )
      await expect(writeCoachRecommendationOutcome(
        adapter, initial.id, 'helped', '2026-10-23', oldRevision,
      )).rejects.toMatchObject({ statusCode: 409 })
      const newer = await client.query(
        'SELECT response_at::text AS response_at FROM coach_recommendations WHERE id = $1::uuid',
        [initial.id],
      )
      await writeCoachRecommendationOutcome(
        adapter, initial.id, 'no_change', '2026-10-23', String(newer.rows[0].response_at),
      )
      await expect(writeCoachRecommendationOutcome(
        adapter, initial.id, 'made_worse', '2026-10-23', String(newer.rows[0].response_at),
      )).rejects.toMatchObject({ statusCode: 409 })
      const saved = await client.query(
        'SELECT response_state, outcome_state, metadata FROM coach_recommendations WHERE id = $1::uuid',
        [initial.id],
      )
      expect(saved.rows[0].response_state).toBe('do_this')
      expect(saved.rows[0].outcome_state).toBe('no_change')
      expect(saved.rows[0].metadata.ownerStarted).toBe(true)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.5: one active plateau option blocks a second start in the same decision revision', async () => {
    await client.query('BEGIN')
    try {
      const revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      const otherRevision = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      const makeDraft = (kind: 'review_intake_adjustment' | 'review_activity_adjustment') => ({
        fingerprint: 'coach:piq:plateau:' + kind + ':' + randomUUID(),
        sourceId: 'maintenance:' + kind,
        kind, domain: 'nutrition',
        title: kind === 'review_intake_adjustment' ? 'Review intake' : 'Review activity',
        detail: 'Choose one lever.', actionText: 'Review', detailPath: '/nutrition',
        confidence: 'moderate' as const, evidenceRefs: ['maintenance:estimate'],
        priority: 80, experimentEligible: true,
      })
      const intake = await surfaceDraft(adapter, makeDraft('review_intake_adjustment'), today, revision)
      const activity = await surfaceDraft(adapter, makeDraft('review_activity_adjustment'), today, revision)
      expect(await activeCalorieDecisionInRevision(adapter, revision)).toBe(false)
      await writeCoachRecommendationResponse(adapter, activity.id, 'do_this', today, async () => undefined, true, null)
      expect(await activeCalorieDecisionInRevision(adapter, revision)).toBe(true)
      expect(await activeCalorieDecisionInRevision(adapter, otherRevision)).toBe(false)
      await expect(writeCoachRecommendationResponse(
        adapter, intake.id, 'do_this', today, async () => undefined, true, null,
      )).rejects.toMatchObject({ statusCode: 409 })
      const rejected = await client.query(
        'SELECT response_state, response_at FROM coach_recommendations WHERE id = $1::uuid',
        [intake.id],
      )
      expect(rejected.rows[0]).toEqual({ response_state: null, response_at: null })
      // The migration-chain DB enforces an outcome timestamp whenever feedback exists.
      await client.query(
        "UPDATE coach_recommendations SET outcome_state = 'helped', outcome_at = now() WHERE id = $1::uuid", [activity.id],
      )
      expect(await activeCalorieDecisionInRevision(adapter, revision)).toBe(false)
      await writeCoachRecommendationResponse(adapter, intake.id, 'do_this', today, async () => undefined, true, null)
      const accepted = await client.query(
        'SELECT response_state, metadata FROM coach_recommendations WHERE id = $1::uuid', [intake.id],
      )
      expect(accepted.rows[0].response_state).toBe('do_this')
      expect(accepted.rows[0].metadata.ownerStarted).toBe(true)
      expect(accepted.rows[0].metadata.decisionGroup).toBe('possible_plateau_response')
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.5: unique index rejects two independent concurrent plateau starts with the same revision', async () => {
    // Unlike the single-connection test, these are separate transactions with
    // separate snapshots, representing simultaneous Neon/HTTP writers.
    const revision = randomUUID().replace(/-/g, '')
    const makeDraft = (kind: 'review_intake_adjustment' | 'review_activity_adjustment') => ({
      fingerprint: 'coach:piq:strict:' + kind + ':' + randomUUID(),
      sourceId: 'maintenance:' + kind, kind,
      domain: 'nutrition', title: 'Choose plateau lever', detail: 'Select only one.',
      actionText: 'Review', detailPath: '/nutrition', confidence: 'moderate' as const,
      evidenceRefs: ['maintenance:estimate'], priority: 80, experimentEligible: true,
    })
    const intake = await surfaceDraft(adapter, makeDraft('review_intake_adjustment'), today, revision)
    const activity = await surfaceDraft(adapter, makeDraft('review_activity_adjustment'), today, revision)
    const first = new Client({ connectionString: url! })
    const second = new Client({ connectionString: url! })
    const startSql = `UPDATE coach_recommendations
      SET response_state = 'do_this', response_at = now(),
          metadata = jsonb_set(metadata, '{ownerStarted}', 'true'::jsonb, true),
          follow_up_on = DATE '2026-10-21'
      WHERE id = $1::uuid`
    try {
      await Promise.all([first.connect(), second.connect()])
      await Promise.all([
        first.query('SET search_path TO piq_full_chain, public'),
        second.query('SET search_path TO piq_full_chain, public'),
      ])
      await first.query('BEGIN')
      await second.query('BEGIN')
      await first.query(startSql, [activity.id])
      // The next UPDATE is issued while the first writer has not committed.
      // PostgreSQL's unique-index conflict check waits/rechecks even if the
      // second transaction's ordinary visibility snapshot is stale.
      const competing = second.query(startSql, [intake.id]).then(
        () => ({ ok: true, code: null, constraint: null }),
        (error: { code?: string; constraint?: string }) => ({
          ok: false, code: error.code ?? null, constraint: error.constraint ?? null,
        }),
      )
      await first.query('COMMIT')
      expect(await competing).toEqual({
        ok: false, code: '23505',
        constraint: 'coach_recommendations_one_active_plateau_revision_idx',
      })
      await second.query('ROLLBACK')
      const rows = await client.query(
        'SELECT id::text AS id, response_state FROM coach_recommendations WHERE id = ANY($1::uuid[]) ORDER BY id',
        [[intake.id, activity.id]],
      )
      expect(rows.rows.filter((row) => row.response_state === 'do_this')).toHaveLength(1)
    } finally {
      await Promise.allSettled([first.query('ROLLBACK'), second.query('ROLLBACK')])
      await Promise.allSettled([first.end(), second.end()])
      // Fictional data in an isolated disposable schema; remove it promptly,
      // including if the assertion fails.
      await client.query('DELETE FROM coach_recommendations WHERE id = ANY($1::uuid[])', [[intake.id, activity.id]])
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
        maintenance: {
          decisionRevision: revision,
          calorieAdjustmentSafety: { status: 'review_possible' },
          interventions: [{ id: 'maintenance:review-intake', kind: 'review_intake_adjustment' }],
        },
        trainingAdherence: { state: 'on_track' },
        limitations: [],
      }) as unknown as NonNullable<Parameters<typeof requireCurrentCalorieRecommendation>[2]>
      const checkRevision = (day: string, rev: string | null | undefined) =>
        isMaintenanceDecisionRevisionCurrent(day, rev, adapter)
      await expect(requireCurrentCalorieRecommendation(saved, today, makeControl(initial.revision), checkRevision)).resolves.toBeUndefined()
      await writeCoachRecommendationResponse(
        adapter, saved.id, 'do_this', today,
        (persisted) => requireCurrentCalorieRecommendation(persisted, today, makeControl(initial.revision), checkRevision),
        true, saved.response_at == null ? null : String(saved.response_at),
      )
      const accepted = await client.query(
        'SELECT response_state, follow_up_on FROM coach_recommendations WHERE id = $1::uuid', [saved.id],
      )
      expect(accepted.rows[0].response_state).toBe('do_this')
      expect(accepted.rows[0].follow_up_on).toBeTruthy()
      await client.query(
        `UPDATE nutrition_targets SET calories_target = 2200, updated_at = now()
         WHERE effective_from = $1::date`, ['2026-10-12'],
      )
      const updated = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(updated.revision).not.toBe(initial.revision)
      await expect(writeCoachRecommendationResponse(
        adapter, saved.id, 'do_this', today,
        (persisted) => requireCurrentCalorieRecommendation(persisted, today, makeControl(initial.revision), checkRevision),
        true, saved.response_at == null ? null : String(saved.response_at),
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
        true, saved.response_at == null ? null : String(saved.response_at),
      )).rejects.toThrow('no longer current')
      const historic = await client.query(
        'SELECT response_state, outcome_state, metadata FROM coach_recommendations WHERE id = $1::uuid', [saved.id],
      )
      expect(historic.rows).toHaveLength(1)
      expect(historic.rows[0].metadata).toEqual({})
      expect(historic.rows[0].response_state).toBe('do_this')
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.2: current physiological profile creation and correction invalidate numerical decision revision', async () => {
    const before = await readMaintenanceDecisionSnapshot(today, adapter)
    expect(before.status).toBe('available')
    await client.query('BEGIN')
    try {
      await client.query(
        `INSERT INTO health_profile (singleton_id, date_of_birth, height_cm)
         VALUES (1, '1995-05-19'::date, 178)
         ON CONFLICT (singleton_id) DO UPDATE SET
         date_of_birth = EXCLUDED.date_of_birth, height_cm = EXCLUDED.height_cm, updated_at = now()`,
      )
      const created = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(created.status).toBe('available')
      expect(created.revision).not.toBe(before.revision)
      expect(await isMaintenanceDecisionRevisionCurrent(today, before.revision, adapter)).toBe(false)
      await client.query(
        'UPDATE health_profile SET height_cm = 174, updated_at = now() WHERE singleton_id = 1',
      )
      const corrected = await readMaintenanceDecisionSnapshot(today, adapter)
      expect(corrected.revision).not.toBe(created.revision)
      expect(await isMaintenanceDecisionRevisionCurrent(today, created.revision, adapter)).toBe(false)
    } finally {
      await client.query('ROLLBACK')
    }
    const restored = await readMaintenanceDecisionSnapshot(today, adapter)
    expect(restored.revision).toBe(before.revision)
  })

  it('PIQ-1.3: real performed-set SQL merges ad-hoc sessions into one calendar day and keeps routine credits separate', async () => {
    await client.query('BEGIN')
    try {
      // Monday was recorded before this plan existed, so it must still count.
      await insertFictionalWorkout({
        workoutDate: '2026-10-12', sessionType: 'ad_hoc',
        exercises: [{ externalId: 'EX01' }, { externalId: 'EX02' }],
      })
      const secondLog = await insertFictionalWorkout({
        workoutDate: '2026-10-12', sessionType: 'ad_hoc',
        exercises: [{ externalId: 'EX03' }, { externalId: 'EX04', setType: 'warmup' }],
      })
      // Both a complete A and a complete B can earn routine-rotation credit on
      // Tuesday, but they only represent one additional weekly calendar day.
      await insertFictionalWorkout({
        workoutDate: '2026-10-13', sessionType: 'programmed', routineCode: 'A',
        exercises: ['EX01', 'EX02', 'EX03'].map((externalId) => ({ externalId })),
      })
      await insertFictionalWorkout({
        workoutDate: '2026-10-13', sessionType: 'programmed', routineCode: 'B',
        exercises: ['EX04', 'EX05', 'EX06'].map((externalId) => ({ externalId })),
      })
      await insertFictionalWorkout({
        workoutDate: '2026-10-16', sessionType: 'ad_hoc',
        exercises: ['EX01', 'EX02', 'EX03'].map((externalId) => ({ externalId })),
      })
      // Midweek plan creation is independent of performed calendar-day evidence.
      const planRows = await client.query(
        `INSERT INTO training_plan_versions
          (version, effective_from, weekly_frequency_target,
           sequence_start_routine_code, default_non_training_intent)
         VALUES (1, '2026-10-14', 3, 'A', 'flexible') RETURNING id`,
      )
      await client.query(
        `INSERT INTO training_plan_sequence_items (plan_version_id, position, routine_code)
         VALUES ($1::uuid, 1, 'A'), ($1::uuid, 2, 'B')`,
        [planRows.rows[0].id],
      )
      const actual = await actualTrainingEvidence('2026-10-15')
      const week = buildTrainingWeekQualification(actual, '2026-10-15')
      expect(week.completedDays).toBe(2)
      expect(week.days[0]).toMatchObject({
        date: '2026-10-12', qualifies: true, distinctExerciseCount: 3,
      })
      expect(week.days[1]).toMatchObject({
        date: '2026-10-13', qualifies: true, distinctExerciseCount: 6,
        routineExerciseCounts: { A: 3, B: 3 },
      })
      expect(week.days[4]).toMatchObject({
        date: '2026-10-16', qualifies: false, distinctExerciseCount: 0,
      })
      expect(buildTrainingRoutineCredits(actual).map((item) => item.routineCode)).toEqual(['A', 'B'])
      const summary = buildTrainingProgressSummary({
        configured: true, completedProgrammedSessions: 2,
        qualifiedTrainingDays: week.completedDays, todayQualified: false,
        weeklyFrequencyTarget: 3, todayIntent: 'flexible',
        todayRoutineName: 'Routine A', futureTrainingDates: ['2026-10-16'],
      })
      expect(summary.remainingQualifiedDays).toBe(1)
      expect(summary.completedProgrammedSessions).toBe(2)
      // Removing a performed set retroactively removes the Monday day credit,
      // without deleting either workout session row or changing routine credits.
      await client.query(
        'DELETE FROM workout_sets WHERE workout_session_exercise_id = $1::uuid',
        [secondLog.exerciseRows[0]],
      )
      const recalculated = await actualTrainingEvidence('2026-10-15')
      expect(buildTrainingWeekQualification(recalculated, '2026-10-15').completedDays).toBe(1)
      expect(buildTrainingRoutineCredits(recalculated).map((item) => item.routineCode)).toEqual(['A', 'B'])
      expect((await client.query(`SELECT count(*)::int AS count FROM workout_sessions
        WHERE workout_date BETWEEN '2026-10-12' AND '2026-10-15'`)).rows[0].count).toBe(4)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.3: actual SQL filters warmup-only, unperformed and future rows for historical as-of', async () => {
    await client.query('BEGIN')
    try {
      await insertFictionalWorkout({
        workoutDate: '2026-10-12', sessionType: 'programmed', routineCode: 'A',
        exercises: [
          { externalId: 'EX01', setType: 'warmup' },
          { externalId: 'EX02', setType: 'warmup' },
          { externalId: 'EX03', setType: 'warmup' },
        ],
      })
      const session = await insertFictionalWorkout({
        workoutDate: '2026-10-14', sessionType: 'ad_hoc',
        exercises: ['EX01', 'EX02', 'EX03'].map((externalId) => ({ externalId })),
      })
      await insertFictionalWorkout({
        workoutDate: '2026-10-16', sessionType: 'programmed', routineCode: 'B',
        exercises: ['EX04', 'EX05', 'EX06'].map((externalId) => ({ externalId })),
      })
      const monday = buildTrainingWeekQualification(await actualTrainingEvidence('2026-10-12'), '2026-10-12')
      expect(monday.completedDays).toBe(0)
      const wednesday = buildTrainingWeekQualification(await actualTrainingEvidence('2026-10-14'), '2026-10-14')
      expect(wednesday.completedDays).toBe(1)
      expect(wednesday.days[2]).toMatchObject({ date: '2026-10-14', qualifies: true })
      // Remove a working set; two remaining exercises are not a strength day.
      await client.query(
        'DELETE FROM workout_sets WHERE workout_session_exercise_id = $1::uuid',
        [session.exerciseRows[2]],
      )
      expect(buildTrainingWeekQualification(await actualTrainingEvidence('2026-10-14'), '2026-10-14')
        .completedDays).toBe(0)
      expect(buildTrainingRoutineCredits(await actualTrainingEvidence('2026-10-14'))).toEqual([])
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.4: an old DELETE revision is a no-op; a current revision removes the workout', async () => {
    await client.query('BEGIN')
    try {
      const original = await insertFictionalWorkout({
        workoutDate: '2026-10-14', sessionType: 'ad_hoc',
        exercises: [{ externalId: 'EX01' }],
      })
      const versionRows = await client.query(
        'SELECT xmin::text AS version FROM workout_sessions WHERE id = $1::uuid',
        [original.sessionId],
      )
      const validVersion = String(versionRows.rows[0].version)
      // Fixture writes share an XID, so simulate another connection's prior
      // revision with a distinct numeric token, not an intra-tx UPDATE.
      const oldVersion = validVersion === '0' ? '1' : '0'
      const run = async (token: string) => {
        const nonce = randomUUID()
        const claim = await client.query(DELETE_WORKOUT_SESSION_CAS_SQL, [original.sessionId, token, nonce])
        await client.query(DETACH_TRANSCRIPTION_SESSION_GUARDED_SQL, [original.sessionId, nonce])
        const removed = await client.query(DELETE_WORKOUT_SESSION_GUARDED_SQL, [original.sessionId, nonce])
        return [claim.rows, removed.rows]
      }
      expect(await run(oldVersion)).toEqual([[], []])
      expect((await client.query(
        'SELECT id FROM workout_sessions WHERE id = $1::uuid', [original.sessionId],
      )).rows).toHaveLength(1)
      expect((await client.query(
        'SELECT id FROM workout_session_exercises WHERE workout_session_id = $1::uuid', [original.sessionId],
      )).rows).toHaveLength(1)
      const removed = await run(validVersion)
      expect(removed[0]).toHaveLength(1)
      expect(removed[1]).toHaveLength(1)
      expect((await client.query(
        'SELECT id FROM workout_sessions WHERE id = $1::uuid', [original.sessionId],
      )).rows).toEqual([])
      expect((await client.query(
        'SELECT id FROM workout_session_exercises WHERE workout_session_id = $1::uuid', [original.sessionId],
      )).rows).toEqual([])
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-1.4: real PostgreSQL row-CAS replaces sets atomically and blocks an old token without deleting anything', async () => {
    await client.query('BEGIN')
    try {
      const original = await insertFictionalWorkout({
        workoutDate: '2026-10-14', sessionType: 'ad_hoc',
        exercises: [{ externalId: 'EX01' }],
      })
      const oldRows = await client.query(
        'SELECT xmin::text AS version FROM workout_sessions WHERE id = $1::uuid',
        [original.sessionId],
      )
      const originalVersion = String(oldRows.rows[0]?.version)
      const definition = await client.query(
        "SELECT id::text AS id, name FROM exercise_definitions WHERE external_id = 'EX02'",
      )
      expect(definition.rows).toHaveLength(1)
      const newExerciseId = randomUUID()
      const prepared = {
        sessionId: original.sessionId, workoutDate: '2026-10-13', workoutTemplateId: null,
        routineCode: null, templateVersion: null, templateName: null,
        durationMin: 42, effort: 3, painLevel: 0, limitationKind: null,
        limitationNote: null, bodyweightKg: 80, notes: 'A newly saved session',
        sourceKind: 'manual', sessionType: 'ad_hoc', sessionName: 'Updated workout',
        experimentId: null, benchmarkProtocolVersionId: null, metadata: {},
        exercises: [{
          id: newExerciseId, exerciseDefinitionId: String(definition.rows[0].id), position: 1,
          slotId: null, exerciseExternalId: 'EX02',
          exerciseName: String(definition.rows[0].name), notes: null,
          sets: [{
            setNumber: 1, setType: 'working', loadState: 'bodyweight', weightKg: null,
            reps: 12, durationSec: null, leftReps: null, rightReps: null,
            leftDurationSec: null, rightDurationSec: null, distanceM: null,
            completed: null, rir: 2, rpe: null, failureKind: null,
            leftFailureKind: null, rightFailureKind: null, notes: null,
          }],
        }],
      } as PreparedManualSession
      type QueryPart = { text: string; params: unknown[] }
      const makeQueries = (revision: string) => buildGuardedWorkoutEditQueries(
        { query: (text: string, params: unknown[]) => ({ text, params }) } as unknown as Sql,
        prepared, revision, randomUUID(),
      ) as unknown as QueryPart[]
      async function execute(parts: QueryPart[]) {
        // Mirrors the ordered statements of the Neon HTTP transaction batch,
        // inside the parent test's rollback-only transaction.
        const results: Array<Array<Record<string, unknown>>> = []
        await client.query('SAVEPOINT piq_cas_attempt')
        try {
          for (const part of parts) {
            const outcome = await client.query(part.text, part.params)
            results.push(outcome.rows)
          }
          await client.query('RELEASE SAVEPOINT piq_cas_attempt')
          return results
        } catch (error) {
          await client.query('ROLLBACK TO SAVEPOINT piq_cas_attempt')
          throw error
        }
      }
      const success = await execute(makeQueries(originalVersion))
      expect(success[0]).toHaveLength(1)
      const after = await client.query(
        `SELECT xmin::text AS version, workout_date::text AS date, notes,
                metadata ? '_piq_edit_nonce' AS nonce_present
           FROM workout_sessions WHERE id = $1::uuid`,
        [original.sessionId],
      )
      expect(after.rows[0]).toMatchObject({
        date: '2026-10-13', notes: 'A newly saved session', nonce_present: false,
      })
      expect(after.rows[0].version).not.toBe(originalVersion)
      const newExercise = await client.query(
        'SELECT id::text AS id, exercise_name FROM workout_session_exercises WHERE workout_session_id = $1::uuid',
        [original.sessionId],
      )
      expect(newExercise.rows).toEqual([{ id: newExerciseId, exercise_name: definition.rows[0].name }])
      const newSets = await client.query(
        'SELECT reps, set_type FROM workout_sets WHERE workout_session_exercise_id = $1::uuid',
        [newExerciseId],
      )
      expect(newSets.rows).toEqual([{ reps: 12, set_type: 'working' }])
      const stale = await execute(makeQueries(originalVersion))
      expect(stale[0]).toEqual([])
      expect((await client.query(
        'SELECT id::text AS id FROM workout_session_exercises WHERE workout_session_id = $1::uuid',
        [original.sessionId],
      )).rows).toEqual([{ id: newExerciseId }])
      expect((await client.query(
        'SELECT reps FROM workout_sets WHERE workout_session_exercise_id = $1::uuid', [newExerciseId],
      )).rows).toEqual([{ reps: 12 }])
      expect((await client.query(
        'SELECT xmin::text AS version FROM workout_sessions WHERE id = $1::uuid', [original.sessionId],
      )).rows[0].version).toBe(after.rows[0].version)
    } finally {
      await client.query('ROLLBACK')
    }
  })

  it('PIQ-2.5: two real PostgreSQL clients reject competing profile initialization and updates', async () => {
    // The entire schema was migrated to 0056 above. The SQL adapter is injected
    // solely for this fixture; no DATABASE_URL or real owner project is used.
    const other = new Client({
      connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none',
    })
    await client.query('DELETE FROM health_profile')
    await other.connect()
    try {
      await other.query('SET search_path TO piq_full_chain, public')
      const second = {
        query: async (statement: string, params?: unknown[]) =>
          (await other.query(statement, params)).rows,
      } as unknown as Sql

      const blank = await getHealthProfile(adapter)
      expect(blank.updatedAt).toBeNull()
      expect(blank.sexForPhysiology).toBeNull()
      const initial = await Promise.allSettled([
        putHealthProfile({ expectedUpdatedAt: null, persistentHealthContext: 'Fixture A' }, adapter),
        putHealthProfile({ expectedUpdatedAt: null, persistentHealthContext: 'Fixture B' }, second),
      ])
      expect(initial.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(initial.filter((outcome) => outcome.status === 'rejected')).toMatchObject([
        { status: 'rejected', reason: { statusCode: 409, code: 'PROFILE_STALE_WRITE' } },
      ])
      const created = await getHealthProfile(adapter)
      expect(['Fixture A', 'Fixture B']).toContain(created.persistentHealthContext)
      expect(created.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(await client.query('SELECT count(*)::int AS count FROM health_profile'))
        .toMatchObject({ rows: [{ count: 1 }] })

      const versions = await Promise.allSettled([
        putHealthProfile({
          expectedUpdatedAt: created.updatedAt,
          persistentHealthContext: 'Updated in tab A',
        }, adapter),
        putHealthProfile({
          expectedUpdatedAt: created.updatedAt,
          persistentHealthContext: 'Updated in tab B',
        }, second),
      ])
      expect(versions.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
      expect(versions.filter((outcome) => outcome.status === 'rejected')).toMatchObject([
        { status: 'rejected', reason: { statusCode: 409, code: 'PROFILE_STALE_WRITE' } },
      ])
      const winner = await getHealthProfile(adapter)
      expect(['Updated in tab A', 'Updated in tab B']).toContain(winner.persistentHealthContext)
      expect(winner.updatedAt).not.toBe(created.updatedAt)
      await expect(putHealthProfile({
        expectedUpdatedAt: created.updatedAt, trainingLimitations: 'stale attempt',
      }, second)).rejects.toMatchObject({ statusCode: 409, code: 'PROFILE_STALE_WRITE' })
      expect((await getHealthProfile(adapter)).trainingLimitations).toBeNull()

      const withFields = await putHealthProfile({
        expectedUpdatedAt: winner.updatedAt,
        sexForPhysiology: 'other', heightCm: 177.8,
        clinicalConditions: [{ name: 'Fictional fixture', status: 'unknown' }],
      }, adapter)
      expect(withFields.persistentHealthContext).toBe(winner.persistentHealthContext)
      expect(withFields.clinicalConditions).toHaveLength(1)
      const omitted = await putHealthProfile({
        expectedUpdatedAt: withFields.updatedAt,
        dietaryContext: 'For isolated regression only',
      }, second)
      expect(omitted.heightCm).toBe(177.8)
      expect(omitted.sexForPhysiology).toBe('other')
      expect(omitted.clinicalConditions).toHaveLength(1)
      expect(omitted.persistentHealthContext).toBe(winner.persistentHealthContext)

      const cleared = await putHealthProfile({
        expectedUpdatedAt: omitted.updatedAt,
        heightCm: null, sexForPhysiology: null, clinicalConditions: [],
      }, adapter)
      expect(cleared.updatedAt).not.toBe(omitted.updatedAt)
      expect(cleared.heightCm).toBeNull()
      expect(cleared.sexForPhysiology).toBeNull()
      expect(cleared.clinicalConditions).toEqual([])
      expect(cleared.dietaryContext).toBe('For isolated regression only')
      expect(cleared.persistentHealthContext).toBe(winner.persistentHealthContext)
      const veryFast = await putHealthProfile({
        expectedUpdatedAt: cleared.updatedAt, trainingLimitations: 'Retest monotonic version',
      }, second)
      expect(veryFast.updatedAt).not.toBe(cleared.updatedAt)
    } finally {
      await other.end()
      await client.query('DELETE FROM health_profile')
    }
  }, 30_000)

  it('PIQ-6.3: actual PostgreSQL preserves owner change corrections and immutable saved comparison after result invalidation', async () => {
    // Everything in this test is fictional, in a disposable CI-only schema, and rolled back.
    await client.query('BEGIN')
    try {
      const source = await client.query("SELECT id FROM data_sources WHERE key = 'manual' LIMIT 1")
      expect(source.rowCount).toBe(1)
      const sourceId = source.rows[0].id as string
      const protocolId = randomUUID()
      const versionId = randomUUID()
      const experimentId = randomUUID()
      const resultId = randomUUID()
      await client.query(
        "INSERT INTO lab_protocols (id, protocol_kind, title, source_id) VALUES ($1, 'experiment', 'Fictional PIQ snapshot schema fixture', $2)",
        [protocolId, sourceId],
      )
      await client.query(
        "INSERT INTO lab_protocol_versions (id, protocol_id, version, instructions, is_current) VALUES ($1,$2,1,'Fictional only',true)",
        [versionId, protocolId],
      )
      await client.query(
        `INSERT INTO experiments (id,title,question,origin,status,protocol_version_id,source_id,origin_kind,window_start,window_end)
         VALUES ($1,'Fictional PIQ comparison','Are snapshot rows preserved?','owner_created','completed',$2,$3,'owner_created',
           '2026-10-01'::date,'2026-10-07'::date)`,
        [experimentId,versionId,sourceId],
      )
      await client.query(
        "INSERT INTO experiment_implementations (experiment_id,effective_date,behavior_change) VALUES ($1,'2026-10-04','Fictional behavior')",
        [experimentId],
      )
      await client.query(
        `INSERT INTO experiment_implementation_revisions (id,experiment_id,revision,action,effective_date,behavior_change,reason)
         VALUES ($1,$2,1,'corrected','2026-10-05','Fictional corrected behavior','Synthetic date correction')`,
        [randomUUID(),experimentId],
      )
      await client.query(
        `INSERT INTO experiment_results (id,experiment_id,protocol_version_id,classification,status,
           window_start,planned_window_end,effective_end_date,protocol_attestation,stopped_for_safety,evidence_fingerprint,source_id)
         VALUES ($1,$2,$3,'incomplete','valid','2026-10-01','2026-10-07','2026-10-07','followed',false,'synthetic-only',$4)`,
        [resultId,experimentId,versionId,sourceId],
      )
      const snapshot = {
        snapshotVersion: 1, recordedHealthDate: '2026-10-17',
        implementation: { provenance: 'corrected', effectiveDate: '2026-10-05', revision: 1 },
        review: {
          state: 'insufficient_coverage', reason: 'insufficient_observations',
          baselineWindow: { start: '2026-09-28', end: '2026-10-04' },
          followUpWindow: { start: '2026-10-05', end: '2026-10-07' },
          metrics: [{
            requirementId: randomUUID(), outcomeKind: 'nutrition_metric', metricKey: 'protein',
            beforeDays: 3, afterDays: 1, beforeExpected: 7, afterExpected: 3,
          }],
        },
      }
      const hash = await experimentEvidenceFingerprint(snapshot)
      await client.query(
        `INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint)
         VALUES ($1,1,$2::jsonb,$3)`,
        [resultId,JSON.stringify(snapshot),hash],
      )
      const saved = await client.query(
        'SELECT snapshot,snapshot_fingerprint FROM experiment_result_comparison_snapshots WHERE experiment_result_id=$1',
        [resultId],
      )
      expect(saved.rowCount).toBe(1)
      expect(parseExperimentComparisonSnapshot(saved.rows[0].snapshot)).toEqual(snapshot)
      expect(await experimentEvidenceFingerprint(saved.rows[0].snapshot)).toBe(hash)
      expect(saved.rows[0].snapshot_fingerprint).toBe(hash)

      // Reject updates/deletes, invalid version and duplicate rows with REAL PostgreSQL constraints.
      // SAVEPOINT isolates each deliberate error without aborting the rest of the fixture.
      async function rejectsSafely(sql: string, params: unknown[], pgCode: string) {
        await client.query('SAVEPOINT synthetic_snapshot_rejection')
        try {
          await expect(client.query(sql,params)).rejects.toMatchObject({ code: pgCode })
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT synthetic_snapshot_rejection')
          await client.query('RELEASE SAVEPOINT synthetic_snapshot_rejection')
        }
      }
      await rejectsSafely(
        "UPDATE experiment_result_comparison_snapshots SET snapshot = '{}'::jsonb WHERE experiment_result_id=$1",
        [resultId], 'P0001',
      )
      await rejectsSafely(
        'DELETE FROM experiment_result_comparison_snapshots WHERE experiment_result_id=$1',
        [resultId], 'P0001',
      )
      await rejectsSafely(
        "INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint) VALUES ($1,2,'{}'::jsonb,$2)",
        [randomUUID(),'a'.repeat(64)], '23514',
      )
      await rejectsSafely(
        "INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint) VALUES ($1,1,'{}'::jsonb,$2)",
        [resultId,'a'.repeat(64)], '23505',
      )

      // 0060: An explicitly owner-confirmed follow-up is append-only. The
      // write uses a single SQL CAS against original recorded evidence and
      // owner implementation revision/date, not an optimistic UI check alone.
      const feedback1 = await client.query(OWNER_OUTCOME_FEEDBACK_INSERT_SQL, [
        resultId, randomUUID(), 0, 'recorded', 'other_changes',
        'Fictional travel during follow-up', hash, 1, '2026-10-05',
      ])
      expect(feedback1.rowCount).toBe(1)
      expect(Number(feedback1.rows[0]?.version)).toBe(1)
      const stale = await client.query(OWNER_OUTCOME_FEEDBACK_INSERT_SQL, [
        resultId, randomUUID(), 0, 'recorded', 'none_reported', null, hash, 1, '2026-10-05',
      ])
      expect(stale.rowCount).toBe(0)
      await rejectsSafely(
        "UPDATE experiment_outcome_feedback_events SET owner_note = 'changed' WHERE experiment_result_id=$1",
        [resultId], 'P0001',
      )
      await rejectsSafely(
        'DELETE FROM experiment_outcome_feedback_events WHERE experiment_result_id=$1',
        [resultId], 'P0001',
      )
      await rejectsSafely(
        `INSERT INTO experiment_outcome_feedback_events
          (id,experiment_result_id,version,action,unlogged_factors,comparison_fingerprint)
          VALUES ($1,$2,2,'withdrawn','none_reported',$3)`,
        [randomUUID(), resultId, hash], '23514',
      )
      // A newer retraction must not rewrite an older result's original recorded snapshot.
      await client.query(
        `INSERT INTO experiment_implementation_revisions (id,experiment_id,revision,action,effective_date,behavior_change,reason)
         VALUES ($1,$2,2,'retracted',NULL,NULL,'Fictional retraction after review')`,
        [randomUUID(),experimentId],
      )
      await client.query(
        "UPDATE experiment_results SET status='invalidated',invalidated_at=now(),invalidation_reason='Synthetic corrected source' WHERE id=$1",
        [resultId],
      )
      const after = await client.query(
        `SELECT r.status,s.snapshot,s.snapshot_fingerprint
         FROM experiment_results r JOIN experiment_result_comparison_snapshots s ON s.experiment_result_id=r.id
         WHERE r.id=$1`,
        [resultId],
      )
      expect(after.rows[0].status).toBe('invalidated')
      expect(parseExperimentComparisonSnapshot(after.rows[0].snapshot)).toEqual(snapshot)
      expect(after.rows[0].snapshot_fingerprint).toBe(hash)

      // A stale accepted answer cannot be revised after the intervention was
      // retracted or its source result invalidated. Explicit withdrawal is
      // still permitted to keep owner controls available on historical rows.
      const blocked = await client.query(OWNER_OUTCOME_FEEDBACK_INSERT_SQL, [
        resultId, randomUUID(), 1, 'revised', 'none_reported', null, hash, 2, null,
      ])
      expect(blocked.rowCount).toBe(0)
      const withdrawn = await client.query(OWNER_OUTCOME_FEEDBACK_INSERT_SQL, [
        resultId, randomUUID(), 1, 'withdrawn', null, null, hash, 2, null,
      ])
      expect(withdrawn.rowCount).toBe(1)
      const history = await client.query(
        'SELECT version,action,unlogged_factors,owner_note FROM experiment_outcome_feedback_events WHERE experiment_result_id=$1 ORDER BY version',
        [resultId],
      )
      expect(history.rows).toMatchObject([
        { version:1,action:'recorded',unlogged_factors:'other_changes',owner_note:'Fictional travel during follow-up' },
        { version:2,action:'withdrawn',unlogged_factors:null,owner_note:null },
      ])
      const historyRows = await client.query(OWNER_OUTCOME_FEEDBACK_HISTORY_SQL, [resultId])
      expect(historyRows.rowCount).toBe(2)
      expect(historyRows.rows[0]?.comparisonFingerprint).toBe(hash)
      const inspected = reviewFeedbackHistory({
        rows: historyRows.rows, expectedFingerprint: hash, snapshotVerified: true,
        readiness: { state:'not_ready',reason:'not_current_result' },
      })
      expect(inspected.status).toBe('complete')
      expect(inspected.events.map(item => item.version)).toEqual([2,1])
      expect(inspected.review).toBe('withdrawn')
      expect(reviewFeedbackHistory({
        rows: historyRows.rows, expectedFingerprint: 'b'.repeat(64),
        snapshotVerified: true, readiness: {state:'ready',reason:'ready'},
      })).toMatchObject({status:'unavailable',events:[],review:'unavailable'})
      expect(reviewFeedbackHistory({
        rows: historyRows.rows, expectedFingerprint: hash,
        snapshotVerified: false, readiness: {state:'ready',reason:'ready'},
      }).review).toBe('unavailable')
    } finally {
      await client.query('ROLLBACK')
    }
  }, 30_000)

  it('PIQ-6.5: real migrated PostgreSQL rejects changes between digest read and result INSERT',async()=>{
    const second=new Client({connectionString:url!})
    await second.connect()
    await second.query('SET search_path TO piq_full_chain, public')
    const experimentId=randomUUID(),protocolId=randomUUID(),versionId=randomUUID()
    const from='2026-09-20',through='2026-09-21',tz='America/Phoenix'
    const scope:[string,string,string,string,boolean,boolean,string,string,string[],string[]]=[from,through,'2026-10-18',tz,true,true,experimentId,from,[],[]]
    try{
      const src=String((await client.query("SELECT id FROM data_sources WHERE key='manual' LIMIT 1")).rows[0].id)
      await client.query("INSERT INTO lab_protocols (id,protocol_kind,title,source_id) VALUES ($1,'experiment','Fictional CAS protocol',$2)",[protocolId,src])
      await client.query("INSERT INTO lab_protocol_versions (id,protocol_id,version,instructions,is_current) VALUES ($1,$2,1,'Fictional only',true)",[versionId,protocolId])
      await client.query("INSERT INTO experiments (id,title,question,origin,status,protocol_version_id,source_id,origin_kind,window_start,window_end) VALUES ($1,'Fictional CAS','Can evidence change?','owner_created','active',$2,$3,'owner_created',$4::date,$5::date)",[experimentId,versionId,src,from,through])
      await client.query("INSERT INTO experiment_implementations (experiment_id,effective_date,behavior_change) VALUES ($1,$2::date,'Fictional implementation')",[experimentId,from])
      const food=await client.query("INSERT INTO nutrition_entries (log_date,timezone,food_name,serving_quantity,serving_unit,calories,protein,carbs,fat,source_kind,evidence_quality) VALUES ($1::date,$2,'Fictional meal',1,'serving',1800,120,180,65,'manual','owner_entered') RETURNING id",[from,tz])
      const day=await getNutritionDayCompleteness(from,adapter,'2026-10-18')
      await saveNutritionDayCompleteness({date:from,ownerReport:'complete',expectedRevision:day.entryRevision,expectedVersion:0,zeroIntakeFast:false},adapter,'2026-10-18')
      const night=await client.query("INSERT INTO sleep_nightly_summaries (sleep_date,timezone,logical_source_key,source_name,start_at,end_at,total_sleep_minutes,observation_status,analysis_eligible,stage_analysis_eligible,selection_reason,calculation_version) VALUES ($1::date,$2,'fixture-watch','Synthetic','2026-09-21T04:00:00Z','2026-09-21T11:00:00Z',420,'analysis_eligible',true,false,'source_priority','piq-test') RETURNING id",[through,tz])
      // Derive exactly the literal SQL actually used by the finalization code.
      const source=readFileSync('server/lab/experiment-results.ts','utf8')
      const start=source.indexOf('sql.query(\n      `INSERT INTO experiment_results (')
      const end=source.indexOf('`,\n      [',start)
      expect(start).toBeGreaterThan(0)
      expect(end).toBeGreaterThan(start)
      const statement=source.slice(start+"sql.query(\n      `".length,end)
        .replace('${EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION}',EXPERIMENT_FINALIZATION_SOURCE_CAS_EXPRESSION)
      expect(statement).toContain('AND change.revision IS NOT DISTINCT FROM $19::integer')
      const digest=async()=>String((await client.query(EXPERIMENT_FINALIZATION_SOURCE_DIGEST_SQL,scope)).rows[0].digest)
      const args=(id:string,hash:string,action='original',date=from,rev:number|null=null)=>[
        id,experimentId,versionId,'incomplete',from,through,through,'followed',
        false,null,null,'synthetic-fingerprint',src,null,from,through,action,date,rev,...scope,hash,
      ]
      const original=await digest()
      expect(original).toMatch(/^[0-9a-f]{32}$/)
      await second.query('UPDATE nutrition_entries SET protein=121 WHERE id=$1',[food.rows[0].id])
      const afterFood=await digest()
      expect(afterFood).not.toBe(original)
      expect((await client.query(statement,args(randomUUID(),original))).rowCount).toBe(0)
      await second.query('UPDATE sleep_nightly_summaries SET total_sleep_minutes=421 WHERE id=$1',[night.rows[0].id])
      expect(await digest()).not.toBe(afterFood)
      expect((await client.query(statement,args(randomUUID(),afterFood))).rowCount).toBe(0)
      // A fictional workout edit in the same training evidence projection must
      // change the source digest, even when outcome-day counts do not change.
      const definition=await client.query('SELECT id FROM exercise_definitions ORDER BY id LIMIT 1')
      expect(definition.rowCount).toBe(1)
      const beforeWorkout=await digest()
      const training=await client.query(
        "INSERT INTO workout_sessions (workout_date,session_type,source_kind,experiment_id) VALUES ($1::date,'experiment','manual',$2) RETURNING id",
        [from,experimentId],
      )
      const sessionExercise=await client.query(
        "INSERT INTO workout_session_exercises (workout_session_id,exercise_definition_id,position,exercise_name) VALUES ($1,$2,1,'Fictional press') RETURNING id",
        [training.rows[0].id,definition.rows[0].id],
      )
      const workoutSet=await client.query(
        "INSERT INTO workout_sets (workout_session_exercise_id,set_number,set_type,load_state,reps) VALUES ($1,1,'working','bodyweight',8) RETURNING id",
        [sessionExercise.rows[0].id],
      )
      const afterWorkout=await digest()
      expect(afterWorkout).not.toBe(beforeWorkout)
      await second.query('UPDATE workout_sets SET reps=9 WHERE id=$1',[workoutSet.rows[0].id])
      expect(await digest()).not.toBe(afterWorkout)
      expect((await client.query(statement,args(randomUUID(),afterWorkout))).rowCount).toBe(0)
      // A new benchmark with the selected definition changes the digest.
      // Rebinding scope to include the selected benchmark definition is
      // intentional: the experiment now prespecifies the benchmark.
      const benchmarkProtocol=randomUUID(),benchmarkVersion=randomUUID(),
        definitionId=randomUUID(),requirementId=randomUUID(),benchmarkResultId=randomUUID()
      await client.query(
        "INSERT INTO lab_protocols (id,protocol_kind,title,source_id) VALUES ($1,'benchmark','Fictional benchmark',$2)",
        [benchmarkProtocol,src],
      )
      await client.query(
        "INSERT INTO lab_protocol_versions (id,protocol_id,version,instructions,is_current) VALUES ($1,$2,1,'Fictional benchmark',true)",
        [benchmarkVersion,benchmarkProtocol],
      )
      await client.query(
        "INSERT INTO lab_protocol_requirements (id,protocol_version_id,role,domain,requirement_kind,selector,label,position) VALUES ($1,$2,'primary_outcome','training','training_measure','{}'::jsonb,'Fictional score',1)",
        [requirementId,benchmarkVersion],
      )
      await client.query(
        "INSERT INTO benchmark_definitions (id,protocol_id,domain,source_id) VALUES ($1,$2,'training',$3)",
        [definitionId,benchmarkProtocol,src],
      )
      scope[8]=[definitionId]
      const beforeBenchmark=await digest()
      await second.query(
        "INSERT INTO benchmark_results (id,benchmark_definition_id,protocol_version_id,result_date,experiment_id,status,protocol_confirmation_kind,evidence_fingerprint,source_id) VALUES ($1,$2,$3,$4::date,$5,'valid','linked_protocol','fictional-score',$6)",
        [benchmarkResultId,definitionId,benchmarkVersion,through,experimentId,src],
      )
      const benchmarkValue=await second.query(
        "INSERT INTO benchmark_result_values (id,benchmark_result_id,requirement_id,value,unit,value_kind) VALUES ($1,$2,$3,50,'reps','observed') RETURNING id",
        [randomUUID(),benchmarkResultId,requirementId],
      )
      expect(await digest()).not.toBe(beforeBenchmark)
      expect((await client.query(statement,args(randomUUID(),beforeBenchmark))).rowCount).toBe(0)
      const withBenchmark=await digest()
      await second.query('UPDATE benchmark_result_values SET value=51 WHERE id=$1',[benchmarkValue.rows[0].id])
      expect(await digest()).not.toBe(withBenchmark)
      expect((await client.query(statement,args(randomUUID(),withBenchmark))).rowCount).toBe(0)

      // Activity: exact canonical daily summary totals are snapshotted at
      // INSERT time, not inferred from a prior cached coaching snapshot.
      const activity=await client.query(
        "INSERT INTO activity_daily_summaries (summary_date,timezone,steps_count,calculation_version,source_id) VALUES ($1::date,$2,2000,'synthetic',$3) RETURNING id",
        [from,tz,src],
      )
      const beforeActivity=await digest()
      await second.query('UPDATE activity_daily_summaries SET steps_count=2001 WHERE id=$1',[activity.rows[0].id])
      expect(await digest()).not.toBe(beforeActivity)
      expect((await client.query(statement,args(randomUUID(),beforeActivity))).rowCount).toBe(0)
      // Context notes never enter the projection; only dated owner-reported tags.
      const context=await client.query(
        "INSERT INTO daily_context (id,context_date,source_id) VALUES ($1,$2::date,$3) RETURNING id",
        [randomUUID(),from,src],
      )
      const beforeContext=await digest()
      await second.query("INSERT INTO daily_context_tags (context_id,tag_key) VALUES ($1,'travel')",[context.rows[0].id])
      expect(await digest()).not.toBe(beforeContext)
      expect((await client.query(statement,args(randomUUID(),beforeContext))).rowCount).toBe(0)
      // Body: only the requirement-selected metric-key projection participates.
      // It is broader than the final displayed date range, deliberately
      // conservative until the canonical JS and SQL local-date rules unify.
      scope[9]=['weight']
      const beforeBody=await digest()
      const measurement=await client.query(
        "INSERT INTO body_measurement_sessions (measured_at,timezone,source_id) VALUES ('2026-09-20T13:00:00Z',$1,$2) RETURNING id",
        [tz,src],
      )
      const body=await client.query(
        "INSERT INTO body_metrics (measurement_session_id,metric_key,value,unit,value_kind) VALUES ($1,'weight',187,'lb','manual') RETURNING id",
        [measurement.rows[0].id],
      )
      expect(await digest()).not.toBe(beforeBody)
      expect((await client.query(statement,args(randomUUID(),beforeBody))).rowCount).toBe(0)
      const afterBody=await digest()
      await second.query('UPDATE body_metrics SET value=186.5 WHERE id=$1',[body.rows[0].id])
      expect(await digest()).not.toBe(afterBody)
      expect((await client.query(statement,args(randomUUID(),afterBody))).rowCount).toBe(0)
      // A failed parent insert cannot persist its dependent immutable snapshot.
      await client.query('BEGIN')
      try{
        const missing=randomUUID()
        expect((await client.query(statement,args(missing,original))).rowCount).toBe(0)
        await expect(client.query("INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint) VALUES ($1,1,'{}'::jsonb,$2)",[missing,'a'.repeat(64)])).rejects.toMatchObject({code:'23503'})
      }finally{await client.query('ROLLBACK')}
      const current=await digest()
      await second.query("UPDATE experiments SET status='completed' WHERE id=$1",[experimentId])
      expect((await client.query(statement,args(randomUUID(),current))).rowCount).toBe(0)
      await second.query("UPDATE experiments SET status='active' WHERE id=$1",[experimentId])
      await second.query("INSERT INTO experiment_implementation_revisions (id,experiment_id,revision,action,effective_date,behavior_change,reason) VALUES ($1,$2,1,'corrected',$3::date,'Fictional correction','Fictional revision test')",[randomUUID(),experimentId,through])
      expect((await client.query(statement,args(randomUUID(),current))).rowCount).toBe(0)
      expect((await client.query(statement,args(randomUUID(),current,'corrected',through,1))).rowCount).toBe(1)
      expect((await client.query('SELECT count(*)::int AS total FROM experiment_results WHERE experiment_id=$1',[experimentId])).rows[0].total).toBe(1)
    }finally{await second.end()}
  },40_000)

})
