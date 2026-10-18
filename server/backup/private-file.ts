import { writeFile } from 'node:fs/promises'
import { verifyBackupArchive } from './format.js'

/**
 * A complete Health backup can contain sensitive medical and account-linked
 * records. Never leave an unverified or world-readable archive on disk.
 *
 * 'wx' is exclusive creation: refuse both existing filenames and symlinks.
 * 0600 is owner read/write only on Unix; the process umask may restrict it
 * further but cannot make it more permissive.
 *
 * This protects a local CLI artifact, not a substitute for encrypted storage,
 * encrypted transfer, safe retention, or a verified recovery rehearsal.
 */
export async function writeVerifiedPrivateBackup(
  filename: string,
  bytes: Uint8Array,
): Promise<ReturnType<typeof verifyBackupArchive>> {
  const verified = verifyBackupArchive(bytes)
  if (verified.errors.length !== 0) {
    throw new Error('Backup verification failed; no archive was written')
  }
  await writeFile(filename, bytes, { flag: 'wx', mode: 0o600 })
  return verified
}
