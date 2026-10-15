import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import type { Sql } from '../server/db.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { loadVerifiedNutritionDays, loadVerifiedWeeklyNutritionDates } from '../server/nutrition/maintenance-eligibility.js'
import { getNutritionDayCompleteness, saveNutritionDayCompleteness, SOURCE_REVISION_SQL } from '../server/nutrition/day-completeness.js'

/**
 * REAL PostgreSQL integration. Runs ONLY with PIQ_POSTGRES_URL explicitly set
 * to an isolated ephemeral test DB. Never use DATABASE_URL or production Neon.
 *
 * Replay nutrition tables verbatim from migration 0008 and the evidence-review
 * table + evidence-quality alteration from migration 0046, then migration 0053.
 * No claims about replay of all historical migrations or production schema.
 */
const url = process.env.PIQ_POSTGRES_URL
const { Client } = pg
const db = new Client({ connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none' })
const other = new Client({ connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none' })
const date = '2026-10-13'
const today = '2026-10-14'
const rows = async (client: pg.Client, text: string, params: unknown[] = []) =>
  (await client.query(text, params)).rows
const adapter = (client: pg.Client) => ({ query: (sql: string, params?: unknown[]) => rows(client, sql, params) }) as unknown as Sql
const sql = adapter(db)
const alternate = adapter(other)
const file = (name: string) => readFileSync(name, 'utf8')

async function insertMeal(calories = 600) {
  const result = await db.query(`
    INSERT INTO nutrition_entries (log_date, timezone, food_name, serving_quantity,
      serving_unit, calories, source_kind, evidence_quality)
    VALUES ($1::date, 'America/Phoenix', 'Synthetic meal', 1,
      'serving', $2, 'manual', 'measured_reference')
    RETURNING id
  `, [date, calories])
  return String(result.rows[0].id)
}

const report = (revision: string, version: number, ownerReport = 'complete',
  zeroIntakeFast = false) => ({
  date, ownerReport, expectedRevision: revision, expectedVersion: version, zeroIntakeFast,
})

describe.skipIf(!url)('PIQ-1.1 isolated PostgreSQL migration and real confirmation SQL', () => {
  beforeAll(async () => {
    if (!url) return
    await db.connect()
    await other.connect()
    await db.query(file('migrations/0008_nutrition.sql'))
    const evidence = file('migrations/0046_evidence_semantics_change_watchdog.sql')
    const column = evidence.match(/ALTER TABLE nutrition_entries\s+ADD COLUMN evidence_quality TEXT NOT NULL DEFAULT 'legacy_unknown';/m)?.[0]
    const quality = evidence.match(/CREATE TABLE data_quality_reviews \([\s\S]*?\n\);/m)?.[0]
    if (!column || !quality) throw new Error('Source migration 0046 changed; fixture must be reviewed')
    await db.query(column)
    await db.query(quality)
    await db.query(file('migrations/0053_nutrition_day_completeness.sql'))
  }, 25_000)

  beforeEach(async () => {
    await db.query('TRUNCATE nutrition_day_completeness, data_quality_reviews, nutrition_entries')
  })
  afterAll(async () => {
    if (!url) return
    await other.end()
    await db.end()
  })

  it('migration creates no historical confirmations and an empty day is unknown', async () => {
    const result = await getNutritionDayCompleteness(date, sql, today)
    expect(result.version).toBe(0)
    expect(result.ownerReport).toBeNull()
    expect(result.assessment).toMatchObject({ state: 'unknown', eligibleForMaintenance: false })
    expect(result.entryRevision).toMatch(/^[a-f0-9]{64}$/)
    const second = await rows(db, SOURCE_REVISION_SQL, [date])
    expect(second[0].revision).toBe(result.entryRevision)
  })

  it('real food insert, confirmation and later calorie correction invalidate the stored report', async () => {
    const id = await insertMeal()
    const initial = await getNutritionDayCompleteness(date, sql, today)
    const saved = await saveNutritionDayCompleteness(report(initial.entryRevision, 0), sql, today)
    expect(saved.assessment).toMatchObject({ state: 'confirmed_complete', eligibleForMaintenance: true })
    expect(saved.version).toBe(1)
    await db.query('UPDATE nutrition_entries SET calories = 780 WHERE id = $1::uuid', [id])
    const changed = await getNutritionDayCompleteness(date, sql, today)
    expect(changed.entryRevision).not.toBe(initial.entryRevision)
    expect(changed.assessment).toMatchObject({
      confirmationStale: true, state: 'unknown', eligibleForMaintenance: false,
    })
    await expect(saveNutritionDayCompleteness(report(initial.entryRevision, 1), sql, today))
      .rejects.toMatchObject({ statusCode: 409, code: 'NUTRITION_COMPLETENESS_STALE' })
    const fresh = await saveNutritionDayCompleteness(report(changed.entryRevision, 1), sql, today)
    expect(fresh.version).toBe(2)
    expect(fresh.assessment.state).toBe('confirmed_complete')
  })

  it('an analysis exclusion changes revision and disqualifies maintenance even after reconfirmation', async () => {
    const id = await insertMeal(650)
    const first = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(first.entryRevision, 0), sql, today)
    await db.query(`
      INSERT INTO data_quality_reviews
      (id, fingerprint, issue_kind, entity_kind, entity_id, review_status)
      VALUES (gen_random_uuid(), 'piq-fixture-review', 'synthetic', 'nutrition_entry',
        $1, 'excluded_from_analysis')
    `, [id])
    const now = await getNutritionDayCompleteness(date, sql, today)
    expect(now.entryRevision).not.toBe(first.entryRevision)
    expect(now.assessment.confirmationStale).toBe(true)
    const reconfirmed = await saveNutritionDayCompleteness(report(now.entryRevision, 1), sql, today)
    expect(reconfirmed.assessment).toMatchObject({
      state: 'confirmed_complete', eligibleForMaintenance: false,
      maintenanceExclusion: 'excluded_from_analysis',
    })
  })

  it('empty completed days require explicit fasting and fasts cannot calibrate maintenance', async () => {
    const original = await getNutritionDayCompleteness(date, sql, today)
    await expect(saveNutritionDayCompleteness(report(original.entryRevision, 0), sql, today))
      .rejects.toMatchObject({ statusCode: 400 })
    const fasting = await saveNutritionDayCompleteness(report(original.entryRevision, 0, 'complete', true), sql, today)
    expect(fasting.assessment).toMatchObject({
      isExplicitZeroIntakeFast: true, state: 'confirmed_complete',
      eligibleForMaintenance: false,
    })
    await insertMeal(300)
    const changed = await getNutritionDayCompleteness(date, sql, today)
    expect(changed.assessment).toMatchObject({
      confirmationStale: true, eligibleForMaintenance: false,
    })
    await expect(saveNutritionDayCompleteness(report(changed.entryRevision, 1, 'complete', true), sql, today))
      .rejects.toMatchObject({ statusCode: 400 })
  })

  it('two concurrent writes with the same version yield one success and one 409', async () => {
    await insertMeal(1000)
    const observed = await getNutritionDayCompleteness(date, sql, today)
    const a = saveNutritionDayCompleteness(report(observed.entryRevision, 0, 'complete'), sql, today)
    const b = saveNutritionDayCompleteness(report(observed.entryRevision, 0, 'partial'), alternate, today)
    const outcomes = await Promise.allSettled([a, b])
    expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find((o) => o.status === 'rejected')
    expect(rejected).toMatchObject({
      status: 'rejected',
      reason: { statusCode: 409, code: 'NUTRITION_COMPLETENESS_STALE' },
    })
    const final = await getNutritionDayCompleteness(date, sql, today)
    expect(final.version).toBe(1)
  })

  it('a deleted food invalidates the previous confirmation', async () => {
    const id = await insertMeal(1800)
    const original = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(original.entryRevision, 0), sql, today)
    await db.query('DELETE FROM nutrition_entries WHERE id = $1::uuid', [id])
    const latest = await getNutritionDayCompleteness(date, sql, today)
    expect(latest.assessment).toMatchObject({
      confirmationStale: true, state: 'unknown', eligibleForMaintenance: false,
    })
    expect(latest.quality.entryCount).toBe(0)
  })

  function fixtureSnapshot(day: string, calories: number, ids: readonly string[]) {
    const observations: IntelligenceObservation[] = [{
      key: 'nutrition.calories', date: day, value: calories,
      unit: 'kcal', provenance: 'reference', quality: 'high_confidence',
      sourceIds: [...ids],
    }]
    return buildHealthIntelligenceSnapshot({
      range: '30d', asOf: today, start: '2026-09-15', end: today,
      today, timezone: 'America/Phoenix', observations,
    })
  }

  it('real set-based eligibility: requires owner confirmation, correct current hash and matching snapshot', async () => {
    const id = await insertMeal(1400)
    const originalSnapshot = fixtureSnapshot(date, 1400, [id])
    const eligible = () => loadVerifiedNutritionDays({
      snapshot: originalSnapshot, asOf: today, today, sqlOverride: sql,
    })
    expect((await eligible()).size).toBe(0)
    const status = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(status.entryRevision, 0), sql, today)
    expect([...await eligible()]).toEqual([date])
    await db.query('UPDATE nutrition_entries SET calories = 1650 WHERE id = $1::uuid', [id])
    // Correction breaks digest; even re-confirming cannot legitimize a STALE snapshot.
    expect((await eligible()).size).toBe(0)
    const corrected = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(corrected.entryRevision, 1), sql, today)
    expect((await eligible()).size).toBe(0)
    const freshSnapshot = fixtureSnapshot(date, 1650, [id])
    expect([...await loadVerifiedNutritionDays({
      snapshot: freshSnapshot, asOf: today, today, sqlOverride: sql,
    })]).toEqual([date])
  })

  it('real eligibility excludes analysis-excluded, AI-estimated, current and fasted days', async () => {
    const id = await insertMeal(1250)
    const first = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(first.entryRevision, 0), sql, today)
    const snapshot = fixtureSnapshot(date, 1250, [id])
    const selected = (forToday = today) => loadVerifiedNutritionDays({
      snapshot, asOf: today, today: forToday, sqlOverride: sql,
    })
    expect([...await selected()]).toEqual([date])
    expect((await selected(date)).size).toBe(0)
    await db.query(`
      INSERT INTO data_quality_reviews
      (id, fingerprint, issue_kind, entity_kind, entity_id, review_status)
      VALUES (gen_random_uuid(), 'piq-manifest-exclusion', 'synthetic',
        'nutrition_entry', $1, 'excluded_from_analysis')
    `, [id])
    expect((await selected()).size).toBe(0)
    await db.query('DELETE FROM data_quality_reviews')
    await db.query("UPDATE nutrition_entries SET evidence_quality = 'ai_estimate' WHERE id = $1::uuid", [id])
    const revised = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(revised.entryRevision, 1), sql, today)
    expect((await selected()).size).toBe(0)
  })

  it('Weekly Coach uses real verified complete-day SQL and rejects a stale food-log snapshot', async () => {
    const id = await insertMeal(1650)
    const source = (calories: number) => (
      [{ id, logDate: date, calories }] as unknown as import('../src/domain/nutrition/types.js').NutritionEntry[]
    )
    const allowed = (entries: import('../src/domain/nutrition/types.js').NutritionEntry[]) =>
      loadVerifiedWeeklyNutritionDates({ entries, asOf: today, today, sqlOverride: sql })
    expect((await allowed(source(1650))).size).toBe(0)
    const first = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(first.entryRevision, 0), sql, today)
    expect([...await allowed(source(1650))]).toEqual([date])
    // Concurrent source correction invalidates the stored revision.
    await db.query('UPDATE nutrition_entries SET calories = 1700 WHERE id = $1::uuid', [id])
    expect((await allowed(source(1650))).size).toBe(0)
    const updated = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(updated.entryRevision, 1), sql, today)
    // Even after reconfirmation, a stale in-memory Weekly Coach row is rejected.
    expect((await allowed(source(1650))).size).toBe(0)
    expect([...await allowed(source(1700))]).toEqual([date])
    expect((await loadVerifiedWeeklyNutritionDates({ entries: source(1700), asOf: today,
      today: date, sqlOverride: sql })).size).toBe(0)
  })
  it('real manifest never promotes an explicit zero-intake fast or a day lacking food', async () => {
    const empty = await getNutritionDayCompleteness(date, sql, today)
    await saveNutritionDayCompleteness(report(empty.entryRevision, 0, 'complete', true), sql, today)
    const snapshot = fixtureSnapshot(date, 0, [])
    const found = await loadVerifiedNutritionDays({ snapshot, asOf: today, today, sqlOverride: sql })
    expect(found.size).toBe(0)
  })
})
