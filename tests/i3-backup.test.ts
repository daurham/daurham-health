import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.ts'

describe('I3 XP participation backup', () => {
  it('moves the schema head to I3', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0045_xp_participation_themes.sql')
  })

  it('keeps the append-only XP ledger in portable canonical backup', () => {
    expect(backupTable('xp_ledger')).toMatchObject({
      backupClass: 'canonical',
      portable: true,
      seeded: false,
    })
    expect(backupTable('xp_ledger')?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'entry_kind',
      'amount_xp',
      'source_kind',
      'source_id',
      'idempotency_key',
      'rule_version',
      'occurred_at',
      'metadata',
    ]))
  })
})
