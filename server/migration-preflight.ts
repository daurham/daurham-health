import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { getSql } from './db.js'
import { loadLocalEnv } from './env.js'
import { listMigrationFiles } from './migrate.js'
import { LATEST_SCHEMA_MIGRATION } from './backup/inventory.js'
import { assessMigrationHistory, readMigrationHistory } from './migration-history.js'

/** Read-only release preflight. No DDL, migrations, data exports or owner rows.
 * Exit 0 = current, 2 = pending safe-prefix migrations, 1 = blocked/unreadable.
 * A pending status is NOT approval to apply anything.
 */
export async function runMigrationPreflight(): Promise<void> {
  await loadLocalEnv()
  const expected = await listMigrationFiles()
  const sql = await getSql()
  const snapshot = await readMigrationHistory(sql)
  const assessment = assessMigrationHistory(expected, snapshot, LATEST_SCHEMA_MIGRATION)
  console.log('PIQ migration preflight — READ ONLY; no changes made')
  console.log('Expected migration head: ' + LATEST_SCHEMA_MIGRATION)
  console.log('Recorded migrations: ' + assessment.appliedCount + ' / ' + assessment.totalExpected)
  console.log('Status: ' + assessment.status.toUpperCase() + ' (' + assessment.reason + ')')
  if (assessment.pendingMigrations.length > 0) {
    console.log('Pending filenames: ' + assessment.pendingMigrations.join(', '))
  }
  if (assessment.unexpectedMigrations.length > 0) {
    console.log('Unknown history filenames: ' + assessment.unexpectedMigrations.join(', '))
  }
  if (assessment.status !== 'current') {
    console.log('No migrations applied. Review a backup, target environment and authorization before any upgrade.')
    process.exitCode = assessment.status === 'pending' ? 2 : 1
  }
}

const isMain = Boolean(process.argv[1]) &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isMain) {
  void runMigrationPreflight().catch(() => {
    // Avoid printing driver errors: they may contain connection strings or PII.
    console.error('Read-only schema inspection failed. Check target connection and catalog read permissions. No changes made.')
    process.exitCode = 1
  })
}
