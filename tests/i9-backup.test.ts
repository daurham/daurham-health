import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_MIGRATION, backupTable, tablesForProfile } from '../server/backup/inventory.js'

describe('I9 Coach intelligence backup', () => {
  it('advances the schema head and keeps owner recommendation memory portable', () => {
    expect(Number(LATEST_SCHEMA_MIGRATION.slice(0, 4))).toBeGreaterThanOrEqual(56)
    expect(backupTable('coach_recommendations')).toMatchObject({
      backupClass: 'canonical',
      portable: true,
      seeded: false,
    })
    expect(backupTable('coach_recommendations')?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'fingerprint',
      'response_state',
      'suppress_until',
      'follow_up_on',
      'outcome_state',
      'metadata',
    ]))
    expect(tablesForProfile('portable').map((table) => table.name)).toContain('coach_recommendations')
  })
})
