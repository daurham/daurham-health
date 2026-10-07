import { describe, expect, it } from 'vitest'
import { tablesForProfile } from '../server/backup/inventory.ts'

describe('I2 Daily Signals backup', () => {
  it('moves the schema head to I2', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0044_daily_signals.sql')
  })

  it('includes Daily Signals as canonical portable state', () => {
    const tables = new Map(tablesForProfile('portable').map((table) => [table.name, table]))
    for (const name of ['hydration_events', 'bowel_events', 'bowel_day_states', 'daily_wellness']) {
      expect(tables.get(name)).toMatchObject({
        backupClass: 'canonical',
        portable: true,
        seeded: false,
      })
    }
  })
})
