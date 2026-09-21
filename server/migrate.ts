import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { formatDatabaseError, getSql } from './db.ts'
import { splitSqlStatements } from './sql.ts'

const MIGRATION_FILENAME = /^\d{4}_.+\.sql$/
const HISTORY_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
`

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migrationsDir = path.join(rootDir, 'migrations')

async function readEnvFile(filePath: string): Promise<void> {
  try {
    const text = await readFile(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (line.length === 0 || line.startsWith('#')) {
        continue
      }
      const separator = line.indexOf('=')
      if (separator <= 0) {
        continue
      }
      const key = line.slice(0, separator).trim()
      if (process.env[key] !== undefined) {
        continue
      }
      let value = line.slice(separator + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch (error) {
    const code = typeof error === 'object' && error && 'code' in error ? error.code : undefined
    if (code !== 'ENOENT') {
      throw error
    }
  }
}

async function loadLocalEnv(): Promise<void> {
  await readEnvFile(path.join(rootDir, '.env'))
  await readEnvFile(path.join(rootDir, '.env.local'))
}

export async function listMigrationFiles(): Promise<string[]> {
  const entries = await readdir(migrationsDir)
  return entries
    .filter((filename) => MIGRATION_FILENAME.test(filename))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
}

export async function inspectMigrations(): Promise<
  Array<{ filename: string; statements: string[] }>
> {
  const filenames = await listMigrationFiles()
  const migrations = []

  for (const filename of filenames) {
    const sqlText = await readFile(path.join(migrationsDir, filename), 'utf8')
    const statements = splitSqlStatements(sqlText)
    if (statements.length === 0) {
      throw new Error(`Migration ${filename} contains no SQL statements`)
    }
    migrations.push({ filename, statements })
  }

  return migrations
}

async function applyMigrations(): Promise<void> {
  await loadLocalEnv()
  const sql = getSql()
  const migrations = await inspectMigrations()

  await sql.query(HISTORY_TABLE_SQL)

  const appliedRows = (await sql.query(
    'SELECT filename FROM schema_migrations',
  )) as Array<{ filename: string }>
  const applied = new Set(appliedRows.map((row) => row.filename))

  let appliedCount = 0

  for (const migration of migrations) {
    if (applied.has(migration.filename)) {
      continue
    }

    try {
      await sql.transaction([
        ...migration.statements.map((statement) => sql.query(statement)),
        sql.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [
          migration.filename,
        ]),
      ])
    } catch (error) {
      throw new Error(
        `Migration ${migration.filename} failed: ${formatDatabaseError(error)}`,
      )
    }

    console.log(`Applied ${migration.filename}`)
    appliedCount += 1
  }

  if (appliedCount === 0) {
    console.log('No pending migrations.')
  }
}

async function printDryRun(): Promise<void> {
  const migrations = await inspectMigrations()
  console.log('Migration check (no database connection)')
  for (const migration of migrations) {
    console.log(`- ${migration.filename} (${migration.statements.length} statements)`)
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run')

  try {
    if (dryRun) {
      await printDryRun()
      return
    }
    await applyMigrations()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Migration failed'
    console.error(message)
    process.exitCode = 1
  }
}

const isMain =
  Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  void main()
}
