import { describe, expect, it } from 'vitest'
import { LATEST_SCHEMA_MIGRATION, backupTable } from '../server/backup/inventory.ts'

describe('I4 evidence semantics backup', () => {
  it('keeps evidence semantics compatible with the current schema head', () => {
    expect(LATEST_SCHEMA_MIGRATION).toBe('0048_coach_intelligence_recommendations.sql')
  })

  it('backs up durable evidence semantics and owner review state', () => {
    expect(backupTable('exercise_definitions')?.columns.map((column) => column.name)).toContain('side_tracking_mode')
    expect(backupTable('workout_sets')?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'rir', 'rpe', 'failure_kind', 'left_failure_kind', 'right_failure_kind',
    ]))
    expect(backupTable('workout_sessions')?.columns.map((column) => column.name)).toEqual(expect.arrayContaining([
      'limitation_kind', 'limitation_note',
    ]))
    expect(backupTable('nutrition_entries')?.columns.map((column) => column.name)).toContain('evidence_quality')
    expect(backupTable('body_measurement_sessions')?.columns.map((column) => column.name)).toContain('comparability')
    expect(backupTable('health_profile')?.columns.map((column) => column.name)).toContain('body_measurement_protocol')
    expect(backupTable('change_candidates')).toMatchObject({ backupClass: 'canonical', portable: true })
    expect(backupTable('data_quality_reviews')).toMatchObject({ backupClass: 'canonical', portable: true })
  })
})
