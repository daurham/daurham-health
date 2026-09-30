import { describe, expect, it } from 'vitest'
import {
  buildBackupArchive,
  restoreStatements,
  verifyBackupArchive,
  type BackupRow,
} from '../server/backup/format.ts'
import {
  LATEST_SCHEMA_MIGRATION,
  backupTable,
  tablesForProfile,
} from '../server/backup/inventory.ts'

const ITEM = '11111111-1111-4111-8111-111111111111'
const PURCHASE = '22222222-2222-4222-8222-222222222222'
const LEDGER_AWARD = '33333333-3333-4333-8333-333333333333'
const LEDGER_PURCHASE = '44444444-4444-4444-8444-444444444444'
const COACH_TASK = '55555555-5555-4555-8555-555555555555'
const INSTANT = '2026-09-30T02:00:00.000Z'

const rowsByTable: Record<string, BackupRow[]> = {
  reward_items: [{
    id: ITEM,
    name: 'Takeout night',
    cost_xp: '50',
    note: 'Friday',
    is_active: false,
    created_at: INSTANT,
    updated_at: INSTANT,
  }],
  reward_purchases: [{
    id: PURCHASE,
    reward_item_id: ITEM,
    reward_name: 'Takeout night',
    cost_xp: '50',
    submission_id: '66666666-6666-4666-8666-666666666666',
    purchased_at: INSTANT,
    created_at: INSTANT,
  }],
  xp_ledger: [
    {
      id: LEDGER_AWARD,
      entry_kind: 'award',
      amount_xp: '75',
      source_kind: 'coach_task',
      source_id: COACH_TASK,
      idempotency_key: `award:coach:${COACH_TASK}`,
      rule_version: 'xp-rule-v1',
      occurred_at: INSTANT,
      metadata: JSON.stringify({ title: 'Weekly focus', rewardBand: 'weekly' }),
      created_at: INSTANT,
    },
    {
      id: LEDGER_PURCHASE,
      entry_kind: 'purchase',
      amount_xp: '50',
      source_kind: 'reward_purchase',
      source_id: PURCHASE,
      idempotency_key: `purchase:${PURCHASE}`,
      rule_version: null,
      occurred_at: INSTANT,
      metadata: JSON.stringify({ rewardName: 'Takeout night', costXp: 50 }),
      created_at: INSTANT,
    },
  ],
}

describe('Reward wallet backup inventory', () => {
  it('advances schema head and keeps wallet owner data portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0040_goal_training_units_fix.sql')
    for (const name of ['reward_items', 'reward_purchases', 'xp_ledger']) {
      expect(backupTable(name)).toMatchObject({ backupClass: 'canonical', portable: true, seeded: false })
      expect(tablesForProfile('portable').map((table) => table.name)).toContain(name)
    }
    expect(backupTable('reward_purchases')?.references).toContainEqual({
      column: 'reward_item_id',
      table: 'reward_items',
    })
    expect(backupTable('xp_ledger')?.references).toEqual([])
  })

  it.each(['full', 'portable'] as const)('round-trips exact wallet history through a %s archive', (profile) => {
    const archive = buildBackupArchive({
      profile,
      createdAt: INSTANT,
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: 'h3-test',
      rowsByTable,
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    expect(verified.tables.reward_items).toEqual(rowsByTable.reward_items)
    expect(verified.tables.reward_purchases).toEqual(rowsByTable.reward_purchases)
    expect(verified.tables.xp_ledger).toEqual(rowsByTable.xp_ledger)
  })

  it('restores the catalog before purchase snapshots and keeps ledger inserts append-only', () => {
    const archive = buildBackupArchive({
      profile: 'full',
      createdAt: INSTANT,
      schemaMigration: LATEST_SCHEMA_MIGRATION,
      appVersionOrCommit: 'h3-test',
      rowsByTable,
    })
    const verified = verifyBackupArchive(archive)
    expect(verified.errors).toEqual([])
    const sql = restoreStatements(verified.tables)
    const joined = sql.map((statement) => statement.text).join('\n')
    expect(joined.indexOf('INSERT INTO reward_items')).toBeLessThan(joined.indexOf('INSERT INTO reward_purchases'))
    expect(joined).toContain('INSERT INTO xp_ledger')
    expect(sql.flatMap((statement) => statement.params)).toContain('xp-rule-v1')
  })
})
