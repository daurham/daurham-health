import { access, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildBackupArchive, verifyBackupArchive } from '../server/backup/format.js'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { writeVerifiedPrivateBackup } from '../server/backup/private-file.js'

const syntheticBackup = () => buildBackupArchive({
  profile: 'full',
  createdAt: '2026-10-18T00:00:00.000Z',
  schemaMigration: LATEST_SCHEMA_MIGRATION,
  appVersionOrCommit: 'piq7-private-file-fixture',
  rowsByTable: {},
})

describe('PIQ-7 private backup CLI artifact', () => {
  let folder: string
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'piq7-backup-'))
  })
  afterEach(async () => {
    if (folder) await rm(folder, { recursive: true, force: true })
  })

  it('verifies before writing and restricts newly created archive permissions', async () => {
    const filename = path.join(folder, 'private.health-backup.zip')
    const bytes = syntheticBackup()
    const verified = await writeVerifiedPrivateBackup(filename, bytes)
    expect(verified.errors).toEqual([])
    expect(verifyBackupArchive(new Uint8Array(await readFile(filename))).errors).toEqual([])
    const fileStat = await stat(filename)
    // Group/other access is forbidden, independently of process umask.
    expect(fileStat.mode & 0o077).toBe(0)
    expect(fileStat.isFile()).toBe(true)
  })

  it('does not write an invalid archive at all', async () => {
    const filename = path.join(folder, 'invalid.health-backup.zip')
    await expect(writeVerifiedPrivateBackup(filename, new Uint8Array([1, 2, 3])))
      .rejects.toThrow()
    await expect(access(filename)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses an existing file without truncating or replacing its contents', async () => {
    const filename = path.join(folder, 'existing.health-backup.zip')
    const sentinel = 'original backup remains untouched'
    await writeFile(filename, sentinel)
    await expect(writeVerifiedPrivateBackup(filename, syntheticBackup()))
      .rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(filename, 'utf8')).toBe(sentinel)
  })

  it('refuses a preexisting symbolic link rather than following it', async () => {
    const destination = path.join(folder, 'owner-data.txt')
    const link = path.join(folder, 'linked.health-backup.zip')
    const sentinel = 'do not replace owner data'
    await writeFile(destination, sentinel)
    await symlink(destination, link)
    await expect(writeVerifiedPrivateBackup(link, syntheticBackup()))
      .rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(destination, 'utf8')).toBe(sentinel)
  })
})
