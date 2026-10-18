import { access, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildBackupArchive, verifyBackupArchive } from '../server/backup/format.js'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { writeVerifiedPrivateBackup } from '../server/backup/private-file.js'

const syntheticBackup = (createdAt = '2026-10-18T00:00:00.000Z') => buildBackupArchive({
  profile: 'full',
  createdAt,
  schemaMigration: LATEST_SCHEMA_MIGRATION,
  appVersionOrCommit: 'piq7-private-file-fixture',
  rowsByTable: {},
})

describe('PIQ-7 private, atomically published backup CLI artifact', () => {
  let folder: string
  beforeEach(async () => {
    folder = await mkdtemp(path.join(tmpdir(), 'piq7-backup-'))
  })
  afterEach(async () => {
    if (folder) await rm(folder, { recursive: true, force: true })
  })

  it('publishes only verified complete bytes with restrictive permissions and no temporary file', async () => {
    const filename = path.join(folder, 'private.health-backup.zip')
    const bytes = syntheticBackup()
    const verified = await writeVerifiedPrivateBackup(filename, bytes)
    expect(verified.errors).toEqual([])
    expect(await readFile(filename)).toEqual(Buffer.from(bytes))
    expect(verifyBackupArchive(new Uint8Array(await readFile(filename))).errors).toEqual([])
    const fileStat = await stat(filename)
    expect(fileStat.mode & 0o077).toBe(0)
    expect(fileStat.isFile()).toBe(true)
    expect(await readdir(folder)).toEqual(['private.health-backup.zip'])
  })

  it('rejects an invalid archive without creating a final or temporary file', async () => {
    const filename = path.join(folder, 'invalid.health-backup.zip')
    await expect(writeVerifiedPrivateBackup(filename, new Uint8Array([1, 2, 3])))
      .rejects.toThrow()
    await expect(access(filename)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(await readdir(folder)).toEqual([])
  })

  it('never overwrites an existing archive and removes the private temporary copy', async () => {
    const filename = path.join(folder, 'existing.health-backup.zip')
    const sentinel = 'original backup remains untouched'
    await writeFile(filename, sentinel)
    await expect(writeVerifiedPrivateBackup(filename, syntheticBackup()))
      .rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(filename, 'utf8')).toBe(sentinel)
    expect(await readdir(folder)).toEqual(['existing.health-backup.zip'])
  })

  it('refuses a symlink destination and removes the private temporary copy', async () => {
    const destination = path.join(folder, 'owner-data.txt')
    const link = path.join(folder, 'linked.health-backup.zip')
    const sentinel = 'do not replace owner data'
    await writeFile(destination, sentinel)
    await symlink(destination, link)
    await expect(writeVerifiedPrivateBackup(link, syntheticBackup()))
      .rejects.toMatchObject({ code: 'EEXIST' })
    expect(await readFile(destination, 'utf8')).toBe(sentinel)
    expect((await readdir(folder)).sort()).toEqual(['linked.health-backup.zip', 'owner-data.txt'])
  })

  it('publishes exactly one complete backup when two writers race on the same name', async () => {
    const filename = path.join(folder, 'same-name.health-backup.zip')
    const first = syntheticBackup('2026-10-18T00:00:00.000Z')
    const second = syntheticBackup('2026-10-18T00:00:01.000Z')
    const result = await Promise.allSettled([
      writeVerifiedPrivateBackup(filename, first),
      writeVerifiedPrivateBackup(filename, second),
    ])
    expect(result.filter(item => item.status === 'fulfilled')).toHaveLength(1)
    const rejected = result.find(item => item.status === 'rejected')
    expect(rejected).toMatchObject({ status: 'rejected', reason: { code: 'EEXIST' } })
    const disk = await readFile(filename)
    expect([Buffer.from(first).equals(disk), Buffer.from(second).equals(disk)])
      .toContain(true)
    expect(verifyBackupArchive(new Uint8Array(disk)).errors).toEqual([])
    expect((await stat(filename)).mode & 0o077).toBe(0)
    expect(await readdir(folder)).toEqual(['same-name.health-backup.zip'])
  })
})
