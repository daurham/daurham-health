import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('migrations/0049_passive_recovery_clinical_context.sql', 'utf8')

describe('I10 migration contract', () => {
  it('adds JSON arrays to the singleton Health Profile', () => {
    expect(sql).toContain('ADD COLUMN clinical_conditions JSONB')
    expect(sql).toContain('ADD COLUMN clinical_allergies JSONB')
    expect(sql).toContain('ADD COLUMN clinical_medications JSONB')
    expect(sql).toContain("jsonb_typeof(clinical_conditions) = 'array'")
    expect(sql).toContain("jsonb_typeof(clinical_allergies) = 'array'")
    expect(sql).toContain("jsonb_typeof(clinical_medications) = 'array'")
  })

  it('does not alter or enable sleep vital metric ingestion', () => {
    expect(sql).not.toMatch(/sleep_vital_samples|hrv_sdnn|respiratory_rate|oxygen_saturation|sleeping_wrist_temperature/)
  })
})
