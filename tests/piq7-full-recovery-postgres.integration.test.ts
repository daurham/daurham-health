import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Sql } from '../server/db.js'
import { inspectMigrations } from '../server/migrate.js'
import { createBackupArchive, applyRestore, inspectRestore, readDestinationCounts } from '../server/backup/database.js'
import { verifyBackupArchive } from '../server/backup/format.js'
import { AUTH_TABLES_EXCLUDED, BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { assertPiqPostgresFixtureSession, assertPiqPostgresFixtureTarget } from '../server/piq-postgres-fixture.js'

/* Two independently migrated schemas, exclusively in disposable localhost
 * piq_fixture. Never connect to production, persistent Neon QA or owner data.
 * Exercise the real Health backup/export and restore transaction logic.
 */
const url = process.env.PIQ_POSTGRES_URL
if (url !== undefined) assertPiqPostgresFixtureTarget(url)
const source = new pg.Client({ connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none' })
const target = new pg.Client({ connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none' })
type TxOptions = { isolationLevel?: string; readOnly?: boolean }

function sqlAdapter(client: pg.Client, failAt?: (text: string) => boolean): Sql {
  return {
    query: async (text: string, params?: unknown[]) => (await client.query(text, params ?? [])).rows,
    transaction: async (
      callback: (txn: { query: (text: string, params?: unknown[]) => number }) => number[],
      options?: TxOptions,
    ) => {
      const tasks: Array<{ text: string; params: unknown[] }> = []
      const list = callback({ query: (text, params = []) => {
        tasks.push({ text, params })
        return tasks.length - 1
      } })
      expect(list).toEqual(tasks.map((_, i) => i))
      await client.query(options?.isolationLevel === 'RepeatableRead'
        ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY'
        : 'BEGIN ISOLATION LEVEL READ COMMITTED')
      try {
        const result: unknown[] = []
        for (const item of tasks) {
          if (failAt?.(item.text)) await client.query('SELECT 1 / 0')
          result.push((await client.query(item.text, item.params)).rows)
        }
        await client.query('COMMIT')
        return result
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      }
    },
  } as unknown as Sql
}

async function migrateFixture(client: pg.Client, schema: string) {
  await assertPiqPostgresFixtureSession(client)
  await client.query('CREATE SCHEMA ' + schema)
  await client.query('SET search_path TO ' + schema + ', public')
  await client.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  const migrations = await inspectMigrations()
  expect(migrations).toHaveLength(60)
  expect(migrations.at(-1)?.filename).toBe(LATEST_SCHEMA_MIGRATION)
  for (const migration of migrations) {
    await client.query('BEGIN')
    try {
      for (const statement of migration.statements) await client.query(statement)
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration.filename])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw new Error('Recovery fixture migration failed: ' + migration.filename, { cause: error })
    }
  }
}

const ids = {
  protocol: randomUUID(), version: randomUUID(), experiment: randomUUID(),
  result: randomUUID(), nutrition: randomUUID(),
}
const ownerContext = 'Fictional full Health backup and recovery regression'
let archive: Uint8Array

describe.skipIf(!url)('PIQ-7 full source-to-destination PostgreSQL disaster recovery', () => {
  beforeAll(async () => {
    if (!url) return
    await source.connect()
    await target.connect()
    await migrateFixture(source, 'piq7_recovery_source')
    await migrateFixture(target, 'piq7_recovery_target')
    const manual = (await source.query("SELECT id FROM data_sources WHERE key='manual' LIMIT 1")).rows[0]?.id
    if (!manual) throw new Error('Missing migration-seeded source')
    await source.query('INSERT INTO health_profile (singleton_id,persistent_health_context) VALUES (1,$1)', [ownerContext])
    await source.query(
      "INSERT INTO nutrition_entries (id,log_date,timezone,food_name,serving_quantity,serving_unit,calories,protein,source_kind,evidence_quality) VALUES ($1,'2026-10-01','America/Phoenix','Fictional nutrition log',1,'serving',450,35,'manual','measured_reference')",
      [ids.nutrition],
    )
    await source.query(
      "INSERT INTO lab_protocols (id,protocol_kind,title,source_id) VALUES ($1,'experiment','Fictional recovery protocol',$2)",
      [ids.protocol, manual],
    )
    await source.query(
      "INSERT INTO lab_protocol_versions (id,protocol_id,version,instructions,is_current) VALUES ($1,$2,1,'Fictional recovery instructions',true)",
      [ids.version, ids.protocol],
    )
    await source.query(
      "INSERT INTO experiments (id,title,question,origin,status,origin_kind,protocol_version_id,source_id,window_start,window_end) VALUES ($1,'Fictional recovery experiment','Does a fictional result survive a restore?','owner_created','completed','owner_created',$2,$3,'2026-10-01','2026-10-07')",
      [ids.experiment, ids.version, manual],
    )
    await source.query(
      "INSERT INTO experiment_implementations (experiment_id,effective_date,behavior_change) VALUES ($1,'2026-10-01','Fictional implementation')",
      [ids.experiment],
    )
    await source.query(
      "INSERT INTO experiment_results (id,experiment_id,protocol_version_id,classification,status,window_start,planned_window_end,effective_end_date,protocol_attestation,stopped_for_safety,evidence_fingerprint,source_id) VALUES ($1,$2,$3,'inconclusive','valid','2026-10-01','2026-10-07','2026-10-07','followed',false,'fictional-evidence',$4)",
      [ids.result, ids.experiment, ids.version, manual],
    )
    await source.query(
      "INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint) VALUES ($1,1,'{}'::jsonb,$2)",
      [ids.result, 'a'.repeat(64)],
    )
    await source.query(
      "INSERT INTO experiment_outcome_feedback_events (id,experiment_result_id,version,action,unlogged_factors,comparison_fingerprint) VALUES ($1,$2,1,'recorded','none_reported',$3)",
      [randomUUID(), ids.result, 'a'.repeat(64)],
    )
    archive = await createBackupArchive(sqlAdapter(source), 'full', '2026-10-18T22:00:00.000Z', 'America/Phoenix')
  }, 180_000)

  afterAll(async () => {
    if (!url) return
    try {
      await source.query('ROLLBACK')
      await target.query('ROLLBACK')
      await source.query('DROP SCHEMA IF EXISTS piq7_recovery_source CASCADE')
      await target.query('DROP SCHEMA IF EXISTS piq7_recovery_target CASCADE')
    } finally {
      await Promise.allSettled([source.end(), target.end()])
    }
  }, 30_000)

  it('verifies every backed-up table and excludes Auth/session tables', () => {
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.manifest.profile).toBe('full')
    expect(verified.manifest.calendarTimezone).toBe('America/Phoenix')
    expect(verified.manifest.schemaMigration).toBe(LATEST_SCHEMA_MIGRATION)
    expect(Object.keys(verified.tables).sort()).toEqual(BACKUP_TABLES.map(table => table.name).sort())
    for (const name of AUTH_TABLES_EXCLUDED) expect(verified.manifest.tables).not.toHaveProperty(name)
    expect(verified.tables.health_profile?.[0]).toMatchObject({ persistent_health_context: ownerContext })
    expect(verified.tables.nutrition_entries?.some(row => row.id === ids.nutrition)).toBe(true)
    expect(verified.tables.experiment_results?.some(row => row.id === ids.result)).toBe(true)
    expect(verified.tables.experiment_outcome_feedback_events).toHaveLength(1)
    expect((verified.tables.data_sources ?? []).length).toBeGreaterThan(0)
    expect((verified.tables.exercise_definitions ?? []).length).toBeGreaterThan(0)
  })

  it('requires an empty migrated destination, rolls back injected failure, then restores exact contents', async () => {
    const before = await readDestinationCounts(sqlAdapter(target))
    const prepared = await inspectRestore(sqlAdapter(target), archive)
    expect(prepared.verified.errors).toEqual([])
    expect(prepared.plan.blocked).toBe(false)
    expect(prepared.plan.rows.experiment_results).toBe(1)
    await expect(applyRestore(
      sqlAdapter(target, text => text.startsWith('INSERT INTO nutrition_entries ')), archive,
    )).rejects.toMatchObject({ code: '22012' })
    expect(await readDestinationCounts(sqlAdapter(target))).toEqual(before)
    expect((await target.query('SELECT count(*)::int AS n FROM health_profile')).rows[0].n).toBe(0)
    expect((await target.query('SELECT count(*)::int AS n FROM experiment_results')).rows[0].n).toBe(0)

    const applied = await applyRestore(sqlAdapter(target), archive)
    expect(applied.blocked).toBe(false)
    const replay = await createBackupArchive(
      sqlAdapter(target), 'full', '2026-10-18T22:00:00.000Z', 'America/Phoenix',
    )
    const expected = verifyBackupArchive(archive)
    const actual = verifyBackupArchive(replay)
    expect(actual.errors).toEqual([])
    expect(actual.tables).toEqual(expected.tables)
    expect(await readDestinationCounts(sqlAdapter(target))).toEqual(
      Object.fromEntries(BACKUP_TABLES.map(table => [table.name, expected.tables[table.name]?.length ?? 0])),
    )
  })

  it('refuses a second restore to an occupied destination and leaves owner data unchanged', async () => {
    const counts = await readDestinationCounts(sqlAdapter(target))
    expect((await inspectRestore(sqlAdapter(target), archive)).plan.blocked).toBe(true)
    await expect(applyRestore(sqlAdapter(target), archive)).rejects.toThrow('Restore refused')
    expect(await readDestinationCounts(sqlAdapter(target))).toEqual(counts)
    expect((await target.query('SELECT persistent_health_context FROM health_profile WHERE singleton_id=1')).rows[0])
      .toMatchObject({ persistent_health_context: ownerContext })
  })
})
