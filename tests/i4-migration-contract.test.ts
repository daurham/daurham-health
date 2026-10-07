import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const sql = readFileSync('migrations/0046_evidence_semantics_change_watchdog.sql', 'utf8')

describe('I4 migration contract', () => {
  it('adds additive evidence columns and explicit review tables', () => {
    expect(sql).toContain('ADD COLUMN side_tracking_mode')
    expect(sql).toContain('ADD COLUMN rir')
    expect(sql).toContain('ADD COLUMN rpe')
    expect(sql).toContain('ADD COLUMN evidence_quality')
    expect(sql).toContain('ADD COLUMN comparability')
    expect(sql).toContain('ADD COLUMN body_measurement_protocol')
    expect(sql).toContain('CREATE TABLE change_candidates')
    expect(sql).toContain('CREATE TABLE data_quality_reviews')
  })

  it('keeps RIR/RPE exclusive and review decisions separate from source records', () => {
    expect(sql).toContain('workout_sets_effort_scale_exclusive')
    expect(sql).toContain("review_status IN ('confirmed_valid','excluded_from_analysis')")
    expect(sql).toContain('set_nutrition_entry_evidence_quality')
    expect(sql).toContain('$quality$ LANGUAGE plpgsql')
  })
})
