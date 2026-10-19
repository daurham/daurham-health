import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { createOwnerExport, ownerExportFromSnapshot } from '../server/backup/database.js'
import { verifyBackupArchive } from '../server/backup/format.js'
import { LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.js'
import { listMigrationFiles } from '../server/migrate.js'

const syntheticProfile = {
  singleton_id: '1',
  persistent_health_context: 'fictional QA profile; never from owner records',
  created_at: '2026-10-18T00:00:00.000Z',
}

describe('PIQ-7 owner export uses a single canonical database snapshot', () => {
  it('uses one read-only repeatable-read transaction and never fetches tables twice', async () => {
    const expected = await listMigrationFiles()
    const query = vi.fn(async (statement: string) => {
      if (statement === 'SELECT filename FROM schema_migrations ORDER BY filename') {
        return expected.map(filename => ({ filename }))
      }
      if (statement.includes(' FROM health_profile ORDER BY ')) {
        return [{ payload: JSON.stringify(syntheticProfile) }]
      }
      return []
    })
    const transaction = vi.fn(async (
      build: (txn: { query: typeof query }) => Promise<unknown>[],
      options: unknown,
    ) => {
      expect(options).toEqual({ isolationLevel: 'RepeatableRead', readOnly: true })
      return Promise.all(build({ query }))
    })
    const sql = { transaction } as unknown as Sql
    const result = await createOwnerExport(sql, 'America/Phoenix')
    expect(result.profile).toBe('full')
    expect(transaction).toHaveBeenCalledTimes(1)
    expect(query.mock.calls.filter(([statement]) => statement.includes(' FROM health_profile ORDER BY ')))
      .toHaveLength(1)
    const verified = verifyBackupArchive(result.bytes)
    expect(verified.errors).toEqual([])
    expect(verified.manifest.calendarTimezone).toBe('America/Phoenix')
    expect(verified.tables.health_profile?.[0]).toMatchObject(syntheticProfile)
  })

  it('projects full and portable archives from identical source values and timestamp', () => {
    const snapshot = {
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      rowsByTable: {
        health_profile: [syntheticProfile],
        ai_usage: [{ id: '11111111-1111-4111-8111-111111111111' }],
      },
    }
    const createdAt = '2026-10-18T05:10:00.000Z'
    const full = ownerExportFromSnapshot(snapshot, 'America/Phoenix', createdAt, Number.MAX_SAFE_INTEGER)
    const portable = ownerExportFromSnapshot(snapshot, 'America/Phoenix', createdAt, 0)
    const fullVerified = verifyBackupArchive(full.bytes)
    const portableVerified = verifyBackupArchive(portable.bytes)
    expect(full.profile).toBe('full')
    expect(portable.profile).toBe('portable')
    expect(fullVerified.errors).toEqual([])
    expect(portableVerified.errors).toEqual([])
    for (const verified of [fullVerified, portableVerified]) {
      expect(verified.manifest.createdAt).toBe(createdAt)
      expect(verified.manifest.calendarTimezone).toBe('America/Phoenix')
      expect(verified.manifest.schemaMigration).toBe(LATEST_SCHEMA_MIGRATION)
      expect(verified.tables.health_profile?.[0]).toMatchObject(syntheticProfile)
    }
    expect(fullVerified.manifest.tables).toHaveProperty('ai_usage')
    expect(portableVerified.manifest.tables).not.toHaveProperty('ai_usage')
  })

  it('refuses an invalid schema on both export paths', () => {
    const changed = { schemaMigration: '0059_older.sql', rowsByTable: {} }
    expect(() => ownerExportFromSnapshot(changed, undefined, undefined, 0))
      .toThrow('Backup requires')
    expect(() => ownerExportFromSnapshot(changed, undefined, undefined, Number.MAX_SAFE_INTEGER))
      .toThrow('Backup requires')
  })
})
