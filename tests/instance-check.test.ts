import { describe, expect, it } from 'vitest'
import { inspectInstanceBootstrap } from '../server/instance-check.ts'

const migrations = [
  '0001_health_foundation.sql',
  '0041_exercise_library_calisthenics.sql',
  '0042_instance_seed_scope.sql',
]

describe('instance bootstrap diagnostics', () => {
  it('accepts a clean fresh instance', () => {
    const diagnostics = inspectInstanceBootstrap({
      expectedMigrations: migrations,
      appliedMigrations: migrations,
      activeLegacyRoutineCodes: [],
      legacyReferenceCount: 0,
      beginnerCalisthenicsActive: true,
      activeExerciseCount: 26,
      activeOwnerRoutineCount: 0,
    })

    expect(diagnostics.some((item) => item.level === 'error')).toBe(false)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        key: 'LEGACY_ROUTINES',
        level: 'ok',
      }),
    )
  })

  it('accepts an established owner instance that still uses A/B/C', () => {
    const diagnostics = inspectInstanceBootstrap({
      expectedMigrations: migrations,
      appliedMigrations: migrations,
      activeLegacyRoutineCodes: ['A', 'B', 'C'],
      legacyReferenceCount: 42,
      beginnerCalisthenicsActive: true,
      activeExerciseCount: 26,
      activeOwnerRoutineCount: 2,
    })

    expect(diagnostics.some((item) => item.level === 'error')).toBe(false)
    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        key: 'LEGACY_ROUTINES',
        level: 'ok',
      }),
    )
  })

  it('fails a fresh instance that still exposes legacy owner routines', () => {
    const diagnostics = inspectInstanceBootstrap({
      expectedMigrations: migrations,
      appliedMigrations: migrations,
      activeLegacyRoutineCodes: ['A', 'B', 'C'],
      legacyReferenceCount: 0,
      beginnerCalisthenicsActive: true,
      activeExerciseCount: 26,
      activeOwnerRoutineCount: 0,
    })

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        key: 'LEGACY_ROUTINES',
        level: 'error',
      }),
    )
  })

  it('fails when schema migrations are pending', () => {
    const diagnostics = inspectInstanceBootstrap({
      expectedMigrations: migrations,
      appliedMigrations: migrations.slice(0, 2),
      activeLegacyRoutineCodes: [],
      legacyReferenceCount: 0,
      beginnerCalisthenicsActive: true,
      activeExerciseCount: 26,
      activeOwnerRoutineCount: 0,
    })

    expect(diagnostics).toContainEqual(
      expect.objectContaining({
        key: 'SCHEMA',
        level: 'error',
      }),
    )
  })
})
