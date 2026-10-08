import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.js'

describe('I10 backup contract', () => {
  it('advances the schema head and keeps structured clinical profile context portable', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0050_training_plan_repeat_blocks.sql')
    const profile = backupTable('health_profile')
    expect(profile).toMatchObject({ backupClass: 'canonical', portable: true })
    expect(profile?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'clinical_conditions',
      'clinical_allergies',
      'clinical_medications',
    ]))
  })
})
