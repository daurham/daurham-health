import { readFile, writeFile } from 'node:fs/promises'
import process from 'node:process'
import { applyRestore, createBackupArchive, inspectRestore, openBackupSql, restoreFailureMessage } from './database.js'
import { verifyBackupArchive } from './format.js'
import { BACKUP_TABLES } from './inventory.js'

function line(text = ''): void {
  process.stdout.write(`${text}\n`)
}

function fail(text: string): never {
  process.stderr.write(`${text}\n`)
  process.exit(1)
}

function pathArg(): string {
  const file = process.argv[3]
  if (!file || file.startsWith('--')) {
    fail('Provide a backup path.')
  }
  return file
}

async function create(): Promise<void> {
  const file = pathArg()
  const sql = await openBackupSql()
  const bytes = await createBackupArchive(sql, 'full')
  await writeFile(file, bytes)
  const verified = verifyBackupArchive(bytes)
  if (verified.errors.length > 0) {
    fail(verified.errors.join('\n'))
  }
  const counts = BACKUP_TABLES.map((definition) => ({
    name: definition.name,
    rows: verified.tables[definition.name]?.length ?? 0,
  })).sort((left, right) => right.rows - left.rows)
  const total = counts.reduce((sum, item) => sum + item.rows, 0)
  line(`Wrote ${file}`)
  line(`Bytes ${bytes.byteLength}`)
  line(`Tables ${counts.length}`)
  line(`Rows ${total}`)
  line('Largest tables:')
  for (const item of counts.slice(0, 5)) {
    line(`- ${item.name} ${item.rows}`)
  }
  line('Verification passed')
}

async function verify(): Promise<void> {
  const file = pathArg()
  const bytes = new Uint8Array(await readFile(file))
  const verified = verifyBackupArchive(bytes)
  if (verified.errors.length > 0) {
    fail(verified.errors.join('\n'))
  }
  const total = Object.values(verified.manifest.tables).reduce((sum, item) => sum + item.rows, 0)
  line(`Verified ${file}`)
  line(`Profile ${verified.manifest.profile}`)
  line(`Schema ${verified.manifest.schemaMigration}`)
  line(`Tables ${Object.keys(verified.manifest.tables).length}`)
  line(`Rows ${total}`)
}

async function restore(): Promise<void> {
  const file = pathArg()
  const apply = process.argv.includes('--apply')
  const confirmed = process.env.HEALTH_BACKUP_RESTORE === 'yes'
  const bytes = new Uint8Array(await readFile(file))
  const sql = await openBackupSql()
  const inspected = await inspectRestore(sql, bytes)
  const plan = inspected.plan
  line(`Backup schema ${plan.schemaMigration || 'unknown'}`)
  line(`Destination schema ${plan.destinationSchema || 'unknown'}`)
  line(`Format version ${inspected.verified.manifest.formatVersion}`)
  for (const [name, count] of Object.entries(plan.rows)) {
    if (count > 0) {
      line(`- ${name} ${count}`)
    }
  }
  for (const note of plan.notes) {
    line(note)
  }
  if (plan.blocked) {
    fail(plan.conflicts.join('\n'))
  }
  if (!apply) {
    line('Dry run only. No rows were written.')
    line('To restore an empty database: HEALTH_BACKUP_RESTORE=yes npm run backup:restore -- <file> --apply')
    return
  }
  if (!confirmed) {
    fail('Refusing to write. Set HEALTH_BACKUP_RESTORE=yes and pass --apply.')
  }
  try {
    await applyRestore(sql, bytes)
  } catch (error) {
    fail(restoreFailureMessage(error))
  }
  line('Restore committed.')
}

const command = process.argv[2]
try {
  if (command === 'create') {
    await create()
  } else if (command === 'verify') {
    await verify()
  } else if (command === 'restore') {
    await restore()
  } else {
    fail('Use create, verify, or restore.')
  }
} catch (error) {
  fail(error instanceof Error ? error.message : 'Backup command failed')
}
