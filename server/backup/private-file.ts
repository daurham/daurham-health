import { randomUUID } from 'node:crypto'
import { link, open, unlink } from 'node:fs/promises'
import path from 'node:path'
import { verifyBackupArchive } from './format.js'

/**
 * A full Health backup can contain sensitive medical and account-linked data.
 * Never publish a partial, unverified, world-readable or overwritten archive.
 *
 * Verify before opening any file. Write to a same-directory, unguessable
 * owner-only temporary file (0600), then flush its contents before publishing.
 * A same-directory hard link publishes the finished bytes without replacing
 * an existing name; rename() would silently overwrite on common filesystems.
 * The temporary name is cleaned up on success and ordinary errors.
 *
 * A crash during writing may leave a PRIVATE *.partial file, not a misleading
 * final backup. This is atomic name publication, NOT a promise of crash-durable
 * directory metadata or encryption. If hard links are unavailable, fail closed.
 */
export async function writeVerifiedPrivateBackup(
  filename: string,
  bytes: Uint8Array,
): Promise<ReturnType<typeof verifyBackupArchive>> {
  const verified = verifyBackupArchive(bytes)
  if (verified.errors.length !== 0) {
    throw new Error('Backup verification failed; no archive was written')
  }

  const temporary = path.join(
    path.dirname(filename),
    '.' + path.basename(filename) + '.' + randomUUID() + '.partial',
  )
  let created = false
  try {
    const handle = await open(temporary, 'wx', 0o600)
    created = true
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    // link() returns EEXIST for an existing file or symlink: never clobber.
    await link(temporary, filename)
  } finally {
    if (created) await unlink(temporary)
  }
  return verified
}
