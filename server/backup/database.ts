import { readFileSync } from 'node:fs'
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
} from './format.js'

const appVersion = readPackageVersion()

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

export async function readBackupTables(sql: Sql): Promise<{ schemaMigration: string; rowsByTable: Record<string, BackupRow[]> }> {
  const results = await sql.transaction(
    (txn) => [
      txn.query('SELECT filename FROM schema_migrations ORDER BY filename DESC LIMIT 1'),
      ...BACKUP_TABLES.map((definition) => txn.query(selectSql(definition))),
    ],
    { isolationLevel: 'RepeatableRead', readOnly: true },
  )
  const migrationRows = results[0] as Array<{ filename?: string }>
  const schemaMigration = migrationRows[0]?.filename ?? ''
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

export async function createBackupArchive(sql: Sql, profile: BackupProfile, createdAt = new Date().toISOString()): Promise<Uint8Array> {
  const snapshot = await readBackupTables(sql)
  if (snapshot.schemaMigration !== LATEST_SCHEMA_MIGRATION) {
    throw new Error(`Database schema is ${snapshot.schemaMigration || 'unknown'}. Backup requires ${LATEST_SCHEMA_MIGRATION}.`)
  }
  return buildBackupArchive({
    profile,
    createdAt,
    schemaMigration: snapshot.schemaMigration,
    appVersionOrCommit: appVersion,
    rowsByTable: snapshot.rowsByTable,
  })
}

export async function createOwnerExport(sql: Sql): Promise<{ bytes: Uint8Array; profile: BackupProfile }> {
  const full = await createBackupArchive(sql, 'full')
  if (full.byteLength <= PORTABLE_EXPORT_BYTE_LIMIT) {
    return { bytes: full, profile: 'full' }
  }
  const portable = await createBackupArchive(sql, 'portable')
  return { bytes: portable, profile: 'portable' }
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

export async function applyRestore(sql: Sql, bytes: Uint8Array): Promise<RestorePlan> {
  const inspected = await inspectRestore(sql, bytes)
  if (inspected.plan.blocked || inspected.verified.errors.length > 0) {
    return inspected.plan
  }
  const statements = restoreStatements(inspected.verified.tables)
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
