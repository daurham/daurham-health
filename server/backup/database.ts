import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Sql } from '../db.js'
import { formatDatabaseError, getSql } from '../db.js'
import {
  BACKUP_TABLES,
  LATEST_SCHEMA_MIGRATION,
  PORTABLE_EXPORT_BYTE_LIMIT,
  type BackupTable,
} from './inventory.js'
import {
  buildBackupArchive,
  planRestore,
  restoreStatements,
  verifyBackupArchive,
  type BackupProfile,
  type BackupRow,
  type RestorePlan,
  type SqlStatement,
} from './format.js'

const appVersion = readPackageVersion()

/** Resolve the repository's migration manifest without importing the migration
 * CLI into the runtime API graph. Match the same file naming and numeric sort
 * used by server/migrate.ts; a missing bundle path fails closed.
 */
/** Vercel's bundled api/index.js is not at the original source file path.
 * The function includes migrations/*.sql and resolves it from its cwd.
 * Missing bundled migrations fail closed rather than trusting DB metadata.
 */
export async function runtimeMigrationFiles():Promise<string[]> {
  const dir=path.join(process.cwd(),'migrations')
  try {
    return (await readdir(dir))
      .filter(name=>/^\d{4}_.+\.sql$/.test(name))
      .sort((a,b)=>a.localeCompare(b,'en',{numeric:true}))
  } catch {
    throw new Error('Migration manifest unavailable in runtime bundle')
  }
}

function readPackageVersion(): string {
  try {
    const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../package.json')
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as { version?: string }
    return typeof parsed.version === 'string' ? parsed.version : 'unknown'
  } catch {
    return 'unknown'
  }
}

function selectSql(definition: BackupTable): string {
  const fields = definition.columns.map((column) => {
    if (column.kind === 'bool') {
      return `'${column.name}', ${column.name}`
    }
    if (column.kind === 'bytea') {
      return `'${column.name}', CASE WHEN ${column.name} IS NULL THEN NULL ELSE encode(${column.name}, 'base64') END`
    }
    return `'${column.name}', CASE WHEN ${column.name} IS NULL THEN NULL ELSE ${column.name}::text END`
  })
  const order = definition.primaryKey.join(', ')
  return `SELECT json_build_object(${fields.join(', ')})::text AS payload FROM ${definition.name} ORDER BY ${order}`
}

function rowsFromPayload(result: unknown): BackupRow[] {
  const records = Array.isArray(result) ? result : []
  return records.map((record) => {
    const payload = (record as { payload?: unknown }).payload
    const parsed = typeof payload === 'string' ? (JSON.parse(payload) as BackupRow) : (payload as BackupRow)
    return parsed
  })
}

export async function readSchemaMigration(sql: Sql): Promise<string> {
  const rows = (await sql.query(
    'SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1',
  )) as Array<{ filename?: string }>
  return rows[0]?.filename ?? ''
}

/** A latest filename and count alone do not attest the schema. This exact
 * sequence check runs against migration rows from the SAME RepeatableRead
 * transaction snapshot used to read backup tables (no table-wide locks).
 * Never package a misleading full/portable backup from drifted history.
 */
export function assertBackupMigrationHistory(
  applied: readonly string[], expected: readonly string[],
): void {
  if(expected.length !== Number(LATEST_SCHEMA_MIGRATION.slice(0,4)) ||
     expected.at(-1) !== LATEST_SCHEMA_MIGRATION ||
     expected.some((name,i)=>!/^\d{4}_[a-z0-9_]+\.sql$/.test(name) ||
       Number(name.slice(0,4))!==i+1) ||
     applied.length !== expected.length ||
     applied.some((name,i)=>name!==expected[i])) {
    throw new Error('Backup refused: exact database migration history does not match this release')
  }
}

export async function readBackupTables(sql: Sql): Promise<{ schemaMigration: string; rowsByTable: Record<string, BackupRow[]> }> {
  const expectedMigrations = await runtimeMigrationFiles()
  const results = await sql.transaction(
    (txn) => [
      txn.query('SELECT filename FROM schema_migrations ORDER BY filename'),
      ...BACKUP_TABLES.map((definition) => txn.query(selectSql(definition))),
    ],
    { isolationLevel: 'RepeatableRead', readOnly: true },
  )
  const migrationRows = results[0] as Array<{ filename?: string }>
  assertBackupMigrationHistory(migrationRows.map(row=>row.filename??''),expectedMigrations)
  const schemaMigration = migrationRows.at(-1)?.filename ?? ''
  const rowsByTable: Record<string, BackupRow[]> = {}
  BACKUP_TABLES.forEach((definition, index) => {
    rowsByTable[definition.name] = rowsFromPayload(results[index + 1])
  })
  return { schemaMigration, rowsByTable }
}

export async function readDestinationCounts(sql: Sql): Promise<Record<string, number>> {
  const results = await sql.transaction((txn) =>
    BACKUP_TABLES.map((definition) => txn.query(`SELECT COUNT(*)::int AS count FROM ${definition.name}`)),
  )
  const counts: Record<string, number> = {}
  BACKUP_TABLES.forEach((definition, index) => {
    const rows = results[index] as Array<{ count?: number }>
    counts[definition.name] = Number(rows[0]?.count ?? 0)
  })
  return counts
}

export async function createBackupArchive(
  sql: Sql,
  profile: BackupProfile,
  createdAt = new Date().toISOString(),
  calendarTimezone?: string,
): Promise<Uint8Array> {
  const snapshot = await readBackupTables(sql)
  if (snapshot.schemaMigration !== LATEST_SCHEMA_MIGRATION) {
    throw new Error(`Database schema is ${snapshot.schemaMigration || 'unknown'}. Backup requires ${LATEST_SCHEMA_MIGRATION}.`)
  }
  return buildBackupArchive({
    profile,
    createdAt,
    schemaMigration: snapshot.schemaMigration,
    appVersionOrCommit: appVersion,
    calendarTimezone,
    rowsByTable: snapshot.rowsByTable,
  })
}

type BackupDatabaseSnapshot = Awaited<ReturnType<typeof readBackupTables>>

/** A full-to-portable fallback must never re-read canonical owner data.
 * Both ZIP formats are projections of one migration-checked repeatable-read
 * snapshot and share a single creation timestamp.
 *
 * The limit is injectable for a bounded synthetic fallback test without
 * allocating megabytes of pretend clinical records.
 */
export function ownerExportFromSnapshot(
  snapshot: BackupDatabaseSnapshot,
  calendarTimezone?: string,
  createdAt = new Date().toISOString(),
  fullLimitBytes = PORTABLE_EXPORT_BYTE_LIMIT,
): { bytes: Uint8Array; profile: BackupProfile } {
  if (snapshot.schemaMigration !== LATEST_SCHEMA_MIGRATION) {
    throw new Error('Backup requires ' + LATEST_SCHEMA_MIGRATION + ' schema')
  }
  const archive = (profile: BackupProfile) => buildBackupArchive({
    profile,
    createdAt,
    schemaMigration: snapshot.schemaMigration,
    appVersionOrCommit: appVersion,
    calendarTimezone,
    rowsByTable: snapshot.rowsByTable,
  })
  const full = archive('full')
  if (full.byteLength <= fullLimitBytes) {
    return { bytes: full, profile: 'full' }
  }
  return { bytes: archive('portable'), profile: 'portable' }
}

export async function createOwnerExport(
  sql: Sql,
  calendarTimezone?: string,
): Promise<{ bytes: Uint8Array; profile: BackupProfile }> {
  const snapshot = await readBackupTables(sql)
  return ownerExportFromSnapshot(snapshot, calendarTimezone)
}

export async function inspectRestore(sql: Sql, bytes: Uint8Array): Promise<{ verified: ReturnType<typeof verifyBackupArchive>; plan: RestorePlan }> {
  const verified = verifyBackupArchive(bytes)
  const [destinationSchema, destinationCounts] = verified.errors.length
    ? [await readSchemaMigration(sql), {}]
    : await Promise.all([readSchemaMigration(sql), readDestinationCounts(sql)])
  return {
    verified,
    plan: planRestore({ verified, destinationSchema, destinationCounts }),
  }
}

/** Serialize the destination's emptiness/schema checks with actual restore
 * INSERTs. The earlier preview is only advisory: a concurrent writer can
 * populate tables after inspectRestore but before the transaction starts.
 *
 * ACCESS EXCLUSIVE is intentional and limited to a separately authorized
 * restore onto an EMPTY database. Fail rather than merge two data histories.
 */
export function restoreDestinationGuardStatements(expectedMigrations: readonly string[]): SqlStatement[] {
  // A matching latest migration and row count do NOT prove a complete
  // unmodified prefix. Compare every filename against the actual repository.
  if (expectedMigrations.length !== Number(LATEST_SCHEMA_MIGRATION.slice(0, 4)) ||
      expectedMigrations.at(-1) !== LATEST_SCHEMA_MIGRATION ||
      expectedMigrations.some((name, i) =>
        !/^\d{4}_[a-z0-9_]+\.sql$/.test(name) ||
        Number(name.slice(0, 4)) !== i + 1)) {
    throw new Error('Restore repository migration manifest is invalid')
  }
  const tables = BACKUP_TABLES.map((definition) => definition.name)
  if (tables.some((name) => !/^[a-z_][a-z0-9_]*$/.test(name))) {
    throw new Error('Restore inventory has an unsafe SQL identifier')
  }
  const nonSeeded = BACKUP_TABLES.filter((definition) => !definition.seeded)
  const hasRows = nonSeeded.map((definition) =>
    `EXISTS (SELECT 1 FROM ${definition.name} LIMIT 1)`,
  ).join(' OR\n      ')
  // Canonical exact SQL array, with each filename validated as a restricted
  // identifier first. Generated SQL never interpolates caller credentials.
  const expectedHistory = 'ARRAY[' +
    expectedMigrations.map((name) => "'" + name + "'").join(', ') +
    ']::text[]'
  return [
    { text: "SET LOCAL lock_timeout = '5s'", params: [] },
    { text: `LOCK TABLE schema_migrations, ${tables.join(', ')} IN ACCESS EXCLUSIVE MODE`, params: [] },
    { text: `DO $piq_restore_guard$
BEGIN
  IF COALESCE(
       (SELECT array_agg(filename ORDER BY filename) FROM schema_migrations),
       ARRAY[]::text[]
     ) <> ${expectedHistory} THEN
    RAISE EXCEPTION 'PIQ_RESTORE_SCHEMA_CHANGED';
  END IF;
  IF ${hasRows} THEN
    RAISE EXCEPTION 'PIQ_RESTORE_DESTINATION_NOT_EMPTY';
  END IF;
END $piq_restore_guard$`, params: [] },
  ]
}

export async function applyRestore(sql: Sql, bytes: Uint8Array): Promise<RestorePlan> {
  const inspected = await inspectRestore(sql, bytes)
  if (inspected.plan.blocked || inspected.verified.errors.length > 0) {
    // The CLI must never print "Restore committed" on a blocked plan.
    throw new Error('Restore refused: ' +
      [...new Set([...inspected.plan.conflicts, ...inspected.verified.errors])].join('; '))
  }
  const expectedMigrations = await runtimeMigrationFiles()
  const statements = [...restoreDestinationGuardStatements(expectedMigrations),
    ...restoreStatements(inspected.verified.tables)]
  await sql.transaction(
    (txn) => statements.map((statement) => txn.query(statement.text, statement.params)),
    { isolationLevel: 'ReadCommitted' },
  )
  return inspected.plan
}

export function restoreFailureMessage(error: unknown): string {
  return formatDatabaseError(error)
}

export async function openBackupSql(): Promise<Sql> {
  return getSql()
}
