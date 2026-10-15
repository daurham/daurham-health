import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Sql } from '../server/db.js'
import { inspectMigrations } from '../server/migrate.js'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.js'
import { buildBackupArchive, restoreStatements, verifyBackupArchive, planRestore, type BackupRow } from '../server/backup/format.js'
import { getNutritionDayCompleteness, saveNutritionDayCompleteness } from '../server/nutrition/day-completeness.js'

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
const schema = 'piq_full_chain'
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
})
