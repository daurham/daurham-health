import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('qualified training day evidence SQL', () => {
  const source = readFileSync('server/training/plan-service.ts', 'utf8')

  it('checks performed working sets rather than template slots', () => {
    expect(source).toContain("sets.set_type <> 'warmup'")
    expect(source).toContain('EXISTS (')
    expect(source).toContain('sets.workout_session_exercise_id = session_exercises.id')
  })
  it('excludes distance/skill activities from the strength training threshold', () => {
    expect(source).toContain('JOIN exercise_definitions definitions')
    expect(source).toContain("definitions.measurement_kind NOT IN ('distance', 'distance_duration')")
    expect(source).toContain("definitions.performance_type NOT IN ('distance', 'skill')")
  })
})
