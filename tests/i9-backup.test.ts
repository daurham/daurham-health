import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_MIGRATION, backupTable, tablesForProfile } from '../server/backup/inventory.js'

describe('I9 Coach intelligence backup', () => {
  it('advances the schema head and keeps owner recommendation memory portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0048_coach_intelligence_recommendations.sql')
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
