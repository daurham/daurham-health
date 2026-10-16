import type { Sql } from './db.js'

/** Schema metadata only. Never retrieve owner rows, DB URLs, credentials or
 * release secrets. SELECT-only so the operator can use read-only credentials.
 */
export type MigrationHistorySnapshot = {
  historyTableExists: boolean
  existingOtherTableCount: number
  appliedMigrations: string[]
}

export type MigrationReadiness = {
  status: 'current' | 'pending' | 'blocked'
  reason: 'CURRENT' | 'PENDING' | 'FRESH_SCHEMA' | 'REPOSITORY_MISMATCH' |
    'UNTRACKED_SCHEMA' | 'UNEXPECTED_HISTORY' | 'OUT_OF_SEQUENCE_HISTORY'
  appliedCount: number
  totalExpected: number
  pendingMigrations: string[]
  unexpectedMigrations: string[]
}

export async function readMigrationHistory(sql: Sql): Promise<MigrationHistorySnapshot> {
  const rows = await sql.query(
    "SELECT to_regclass('schema_migrations') IS NOT NULL AS history_exists, " +
    "(SELECT count(*)::int FROM pg_catalog.pg_tables " +
    "WHERE schemaname = current_schema() AND tablename <> 'schema_migrations') AS other_table_count",
  ) as Array<{ history_exists: boolean; other_table_count: number | string }>
  if (rows.length !== 1) throw new Error('Migration catalog was not readable')
  const row = rows[0]!
  if (!row.history_exists) {
    return { historyTableExists: false, existingOtherTableCount: Number(row.other_table_count), appliedMigrations: [] }
  }
  const applied = await sql.query(
    'SELECT filename FROM schema_migrations ORDER BY filename',
  ) as Array<{ filename: string }>
  return {
    historyTableExists: true,
    existingOtherTableCount: Number(row.other_table_count),
    appliedMigrations: applied.map((item) => item.filename),
  }
}

/** The only supported upgrade path is an exact initial prefix of repository
 * migrations; never silently skip a missing earlier migration, trust an
 * unknown filename or bootstrap an occupied schema with lost history.
 */
export function assessMigrationHistory(
  expected: readonly string[],
  snapshot: MigrationHistorySnapshot,
  declaredBackupHead: string,
): MigrationReadiness {
  const base = {
    appliedCount: snapshot.appliedMigrations.length,
    totalExpected: expected.length,
  }
  const result = (
    status: MigrationReadiness['status'],
    reason: MigrationReadiness['reason'],
    pendingMigrations: string[] = [],
    unexpectedMigrations: string[] = [],
  ): MigrationReadiness => ({ status, reason, ...base, pendingMigrations, unexpectedMigrations })
  const structurallyValid = expected.length > 0 &&
    expected.at(-1) === declaredBackupHead &&
    expected.every((name, index) => {
      const match = /^(\d{4})_.+\.sql$/.exec(name)
      return match != null && Number(match[1]) === index + 1
    })
  if (!structurallyValid) return result('blocked', 'REPOSITORY_MISMATCH')

  if (!snapshot.historyTableExists) {
    if (snapshot.existingOtherTableCount !== 0 || snapshot.appliedMigrations.length !== 0) {
      return result('blocked', 'UNTRACKED_SCHEMA')
    }
    return result('pending', 'FRESH_SCHEMA', [...expected])
  }
  if (snapshot.appliedMigrations.length === 0 && snapshot.existingOtherTableCount > 0) {
    return result('blocked', 'UNTRACKED_SCHEMA')
  }
  const allowed = new Set(expected)
  const unexpected = snapshot.appliedMigrations.filter((name) => !allowed.has(name))
  if (unexpected.length > 0) return result('blocked', 'UNEXPECTED_HISTORY', [], unexpected)
  const isPrefix = snapshot.appliedMigrations.every((name, index) => name === expected[index])
  if (!isPrefix) return result('blocked', 'OUT_OF_SEQUENCE_HISTORY')
  const pending = expected.slice(snapshot.appliedMigrations.length)
  if (pending.length > 0) return result('pending', 'PENDING', pending)
  return result('current', 'CURRENT')
}
