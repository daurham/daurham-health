import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import type { Sql } from '../server/db.js'
import { inspectMigrations } from '../server/migrate.js'
import { assessMigrationHistory, readMigrationHistory } from '../server/migration-history.js'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { assertPiqPostgresFixtureSession, assertPiqPostgresFixtureTarget } from '../server/piq-postgres-fixture.js'

/**
 * Incremental QA upgrade rehearsal with fictional records only. This suite
 * runs solely against the dedicated local disposable piq_fixture database;
 * never against Neon, DATABASE_URL or a real Health owner.
 */
const url = process.env.PIQ_POSTGRES_URL
if (url !== undefined) assertPiqPostgresFixtureTarget(url)
const client = new pg.Client({
  connectionString: url ?? 'postgres://unconfigured:unconfigured@127.0.0.1:1/none',
})
const adapter = { query: async (text: string, params?: unknown[]) =>
  (await client.query(text, params)).rows } as unknown as Sql
const firstDate = '2026-10-01'
const endDate = '2026-10-07'
const profileText = 'Fictional preupgrade health context for isolated QA regression'
const protocolId = randomUUID()
const versionId = randomUUID()
const experimentId = randomUUID()
const resultId = randomUUID()

describe.skipIf(!url)('PIQ-7 staged QA 0056-to-0060 PostgreSQL upgrade', () => {
  beforeAll(async () => {
    if (!url) return
    await client.connect()
    await assertPiqPostgresFixtureSession(client)
    await client.query('CREATE SCHEMA piq_incremental_upgrade')
    await client.query('SET search_path TO piq_incremental_upgrade, public')
    await client.query('CREATE TABLE schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const migrations = await inspectMigrations()
    expect(migrations).toHaveLength(60)
    expect(migrations.at(-1)?.filename).toBe(LATEST_SCHEMA_MIGRATION)
    expect(migrations[55]?.filename).toBe('0056_primary_goal_intent_events.sql')
    for (const migration of migrations.slice(0, 56)) {
      await client.query('BEGIN')
      try {
        for (const statement of migration.statements) await client.query(statement)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration.filename])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error('Existing-prefix migration failed: ' + migration.filename, { cause: error })
      }
    }
    const source = (await client.query("SELECT id FROM data_sources WHERE key='manual' LIMIT 1")).rows[0]?.id
    if (!source) throw new Error('Missing migration-seeded manual source')
    await client.query('INSERT INTO health_profile (singleton_id,persistent_health_context) VALUES (1,$1)', [profileText])
    await client.query(
      "INSERT INTO lab_protocols (id,protocol_kind,title,source_id) VALUES ($1,'experiment','Fictional historical protocol',$2)",
      [protocolId, source],
    )
    await client.query(
      "INSERT INTO lab_protocol_versions (id,protocol_id,version,instructions,is_current) VALUES ($1,$2,1,'Fictional instructions',true)",
      [versionId, protocolId],
    )
    await client.query(
      "INSERT INTO experiments (id,title,question,origin,status,origin_kind,protocol_version_id,window_start,window_end,source_id) VALUES ($1,'Fictional historical experiment','Was a synthetic observation recorded?','owner_created','completed','owner_created',$2,$3::date,$4::date,$5)",
      [experimentId, versionId, firstDate, endDate, source],
    )
    await client.query(
      "INSERT INTO experiment_results (id,experiment_id,protocol_version_id,classification,status,window_start,planned_window_end,effective_end_date,protocol_attestation,stopped_for_safety,evidence_fingerprint,source_id) VALUES ($1,$2,$3,'inconclusive','valid',$4::date,$5::date,$5::date,'followed',false,'fictional-evidence-fingerprint',$6)",
      [resultId, experimentId, versionId, firstDate, endDate, source],
    )
  }, 180_000)

  afterAll(async () => {
    if (!url) return
    try {
      await client.query('ROLLBACK')
      await client.query('DROP SCHEMA IF EXISTS piq_incremental_upgrade CASCADE')
    } finally {
      await client.end()
    }
  }, 30_000)

  it('identifies exactly four pending migrations and retains existing records', async () => {
    const migrations = await inspectMigrations()
    const state = assessMigrationHistory(
      migrations.map(item => item.filename), await readMigrationHistory(adapter), LATEST_SCHEMA_MIGRATION,
    )
    expect(state).toMatchObject({ status: 'pending', reason: 'PENDING', appliedCount: 56, totalExpected: 60 })
    expect(state.pendingMigrations).toEqual(migrations.slice(56).map(item => item.filename))
    for (const table of [
      'experiment_implementations', 'experiment_implementation_revisions',
      'experiment_result_comparison_snapshots', 'experiment_outcome_feedback_events',
    ]) {
      expect((await client.query('SELECT to_regclass($1) AS relation_name', [table])).rows[0].relation_name)
        .toBeNull()
    }
    expect((await client.query('SELECT persistent_health_context FROM health_profile WHERE singleton_id=1')).rows[0])
      .toMatchObject({ persistent_health_context: profileText })
    expect((await client.query('SELECT status FROM experiment_results WHERE id=$1', [resultId])).rows[0])
      .toMatchObject({ status: 'valid' })
  })

  it('rolls back a failed 0057 DDL+history transaction without leaving a half-upgraded schema', async () => {
    const migration = (await inspectMigrations())[56]!
    expect(migration.filename).toBe('0057_experiment_implementations.sql')
    await client.query('BEGIN')
    try {
      for (const statement of migration.statements) await client.query(statement)
      await expect(client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
        '0056_primary_goal_intent_events.sql',
      ])).rejects.toMatchObject({ code: '23505' })
    } finally {
      await client.query('ROLLBACK')
    }
    expect((await client.query("SELECT to_regclass('experiment_implementations') AS name")).rows[0].name)
      .toBeNull()
    expect((await client.query('SELECT COUNT(*)::int AS n FROM schema_migrations')).rows[0].n).toBe(56)
    expect((await client.query('SELECT COUNT(*)::int AS n FROM experiment_results WHERE id=$1', [resultId])).rows[0].n)
      .toBe(1)
  })

  it('transactionally applies 0057–0060, preserves history and never invents owner confirmations', async () => {
    const migrations = (await inspectMigrations()).slice(56)
    expect(migrations.map(item => item.filename)).toEqual([
      '0057_experiment_implementations.sql',
      '0058_experiment_implementation_revisions.sql',
      '0059_experiment_comparison_snapshots.sql',
      '0060_experiment_outcome_feedback_events.sql',
    ])
    for (const migration of migrations) {
      await client.query('BEGIN')
      try {
        for (const statement of migration.statements) await client.query(statement)
        await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [migration.filename])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw new Error('Incremental upgrade failed: ' + migration.filename, { cause: error })
      }
    }
    expect(assessMigrationHistory(
      (await inspectMigrations()).map(item => item.filename),
      await readMigrationHistory(adapter), LATEST_SCHEMA_MIGRATION,
    )).toMatchObject({ status: 'current', reason: 'CURRENT', appliedCount: 60, totalExpected: 60 })
    expect((await client.query('SELECT persistent_health_context FROM health_profile WHERE singleton_id=1')).rows[0])
      .toMatchObject({ persistent_health_context: profileText })
    expect((await client.query('SELECT status FROM experiment_results WHERE id=$1', [resultId])).rows[0])
      .toMatchObject({ status: 'valid' })
    for (const table of [
      'experiment_implementations', 'experiment_implementation_revisions',
      'experiment_result_comparison_snapshots', 'experiment_outcome_feedback_events',
    ]) {
      expect((await client.query('SELECT COUNT(*)::int AS n FROM ' + table)).rows[0].n).toBe(0)
    }
  })

  it('enforces new append-only Lab history constraints on fictional rows', async () => {
    await client.query('BEGIN')
    try {
      await client.query(
        "INSERT INTO experiment_implementations (experiment_id,effective_date,behavior_change) VALUES ($1,$2::date,'Fictional implementation')",
        [experimentId, firstDate],
      )
      await client.query(
        "INSERT INTO experiment_implementation_revisions (id,experiment_id,revision,action,effective_date,behavior_change,reason) VALUES ($1,$2,1,'corrected',$3::date,'Fictional correction','Fictional owner correction')",
        [randomUUID(), experimentId, endDate],
      )
      await client.query(
        "INSERT INTO experiment_result_comparison_snapshots (experiment_result_id,snapshot_version,snapshot,snapshot_fingerprint) VALUES ($1,1,'{}'::jsonb,$2)",
        [resultId, 'a'.repeat(64)],
      )
      await client.query(
        "INSERT INTO experiment_outcome_feedback_events (id,experiment_result_id,version,action,unlogged_factors,comparison_fingerprint) VALUES ($1,$2,1,'recorded','none_reported',$3)",
        [randomUUID(), resultId, 'a'.repeat(64)],
      )
      expect((await client.query('SELECT COUNT(*)::int AS n FROM experiment_outcome_feedback_events')).rows[0].n)
        .toBe(1)
      await client.query('SAVEPOINT immutable_snapshot')
      await expect(client.query(
        "UPDATE experiment_result_comparison_snapshots SET snapshot='{}'::jsonb WHERE experiment_result_id=$1",
        [resultId],
      )).rejects.toMatchObject({ code: 'P0001' })
      await client.query('ROLLBACK TO SAVEPOINT immutable_snapshot')
      await client.query('SAVEPOINT immutable_feedback')
      await expect(client.query(
        'DELETE FROM experiment_outcome_feedback_events WHERE experiment_result_id=$1',
        [resultId],
      )).rejects.toMatchObject({ code: 'P0001' })
      await client.query('ROLLBACK TO SAVEPOINT immutable_feedback')
    } finally {
      await client.query('ROLLBACK')
    }
    expect((await client.query('SELECT COUNT(*)::int AS n FROM experiment_outcome_feedback_events')).rows[0].n)
      .toBe(0)
  })
})
