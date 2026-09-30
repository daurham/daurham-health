import { describe, expect, it } from 'vitest'
import { goalEvidence, validateGoalCreate, type GoalTarget, type GoalValidationContext } from '../src/domain/goals.ts'
import { projectGoal } from '../src/domain/goal-projection.ts'
import { milesToMeters } from '../src/domain/units.ts'

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function context(overrides: Partial<NonNullable<GoalValidationContext['exercise']>> = {}): GoalValidationContext {
  return {
    today: '2026-09-29',
    exercise: {
      id: EXERCISE, name: 'Running', active: true,
      measurementKind: 'distance_duration', loadType: 'none',
      performanceType: 'distance', analyticsLoadType: 'none',
      ...overrides,
    },
    supplement: null,
    benchmark: null,
  }
}

function createBody(goalKind: string, targetMode: string, targetMin: number | null, targetMax: number | null, extra: Record<string, unknown> = {}) {
  return {
    goalKind, startedOn: '2026-09-01', exerciseDefinitionId: EXERCISE,
    bodyMetricKey: null, benchmarkDefinitionId: null, benchmarkProtocolVersionId: null,
    benchmarkRequirementId: null, supplementId: null,
    targetMode, targetMin, targetMax, targetDate: null, evaluationWindowDays: null, notes: null,
    ...extra,
  }
}

describe('H2D Training Goals', () => {
  it('validates distance, pace, duration, reps, and skill against compatible exercise semantics', () => {
    const distance = validateGoalCreate(createBody('training_distance', 'at_least', 2, null), context())
    expect(distance).toMatchObject({ goalKind: 'training_distance', targetUnit: 'mi', targetMin: 2 })

    const pace = validateGoalCreate(
      createBody('training_pace', 'at_most', null, 600, { trainingMinDistanceM: milesToMeters(2) }),
      context(),
    )
    expect(pace).toMatchObject({ goalKind: 'training_pace', targetUnit: 'sec/mi', targetMax: 600, trainingMinDistanceM: milesToMeters(2) })

    const duration = validateGoalCreate(createBody('training_duration', 'at_least', 1200, null), context())
    expect(duration).toMatchObject({ targetUnit: 'sec' })

    const reps = validateGoalCreate(
      createBody('training_reps', 'at_least', 50, null),
      context({ name: 'Push-up', measurementKind: 'reps', loadType: 'bodyweight', performanceType: 'bodyweight_reps', analyticsLoadType: 'bodyweight' }),
    )
    expect(reps).toMatchObject({ targetUnit: 'reps', targetMin: 50 })

    const skill = validateGoalCreate(
      createBody('training_skill', 'at_least', 1, null),
      context({ name: 'Handstand', measurementKind: 'completion', performanceType: 'skill' }),
    )
    expect(skill).toMatchObject({ targetUnit: 'completion', targetMin: 1 })
  })

  it('rejects incompatible Goal/exercise combinations and pace without stable minimum distance', () => {
    expect(validateGoalCreate(createBody('training_reps', 'at_least', 10, null), context())).toHaveProperty('error')
    expect(validateGoalCreate(createBody('training_pace', 'at_most', null, 600), context())).toHaveProperty('error')
    expect(validateGoalCreate(
      createBody('training_reps', 'at_least', 10, null),
      context({ measurementKind: 'reps', loadType: 'barbell', performanceType: 'loaded_reps', analyticsLoadType: 'external' }),
    )).toHaveProperty('error')
    expect(validateGoalCreate(
      createBody('training_skill', 'at_least', 1, null),
      context({ measurementKind: 'duration', performanceType: 'other' }),
    )).toHaveProperty('error')
  })

  it('uses canonical Training source evidence without storing a derived pace fact', () => {
    const target: GoalTarget = {
      targetMode: 'at_most', targetMin: null, targetMax: 600, targetUnit: 'sec/mi',
      targetDate: null, evaluationWindowDays: null, notes: null,
    }
    const evidence = goalEvidence({
      goalKind: 'training_pace', target, asOf: '2026-09-29',
      body: null, strength: null, benchmark: null,
      training: {
        value: 590, unit: 'sec/mi', observedOn: '2026-09-29',
        sessionId: 'session', setId: 'set', exerciseId: EXERCISE,
        reps: null, durationSec: 1180, distanceM: milesToMeters(2), completed: null,
      },
      sessionDates: [], activityRows: [], proteinDays: [], sleepNights: [], adherence: null,
    })
    expect(evidence.current).toBe(590)
    expect(evidence.trainingSource).toMatchObject({
      sessionId: 'session', setId: 'set', durationSec: 1180, distanceM: milesToMeters(2), derivedValue: 590,
    })
  })

  it('does not invent projections for new Training Goal kinds', () => {
    const target: GoalTarget = {
      targetMode: 'at_least', targetMin: 3, targetMax: null, targetUnit: 'mi',
      targetDate: '2026-12-01', evaluationWindowDays: null, notes: null,
    }
    expect(projectGoal({
      goalId: 'goal', goalVersionId: 'version', status: 'active', goalKind: 'training_distance',
      target, asOf: '2026-09-29', current: { value: 2, observedOn: '2026-09-29' }, series: [],
    }).state).toBe('not_applicable')
  })
})
