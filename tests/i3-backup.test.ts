import { describe, expect, it } from 'vitest'
import { backupTable } from '../server/backup/inventory.ts'

describe('I3 XP participation backup', () => {
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
