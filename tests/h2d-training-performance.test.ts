import { describe, expect, it } from 'vitest'
import {
  manualWorkoutSetInputSchema,
  measurementFamilyMatches,
  measurementFamilyOf,
  ownerExerciseAnalyticsDefaults,
  toCanonicalSetInsert,
} from '../src/domain/training.ts'
import { milesToMeters } from '../src/domain/units.ts'
import {
  bestTrainingPerformance,
  trainingPerformanceObservations,
  type TrainingPerformanceExercise,
} from '../src/domain/progress/training-performance.ts'
import { stretchTarget } from '../src/domain/coach-stretch.ts'
import type { CanonicalSetRecord } from '../src/domain/progress/types.ts'

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function set(overrides: Partial<CanonicalSetRecord> = {}): CanonicalSetRecord {
  return {
    setId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    sessionId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    sessionExerciseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    exerciseId: EXERCISE,
    sessionDate: '2026-09-29',
    sessionCreatedAt: '2026-09-29T18:00:00.000Z',
    sessionExercisePosition: 1,
    setNumber: 1,
    setType: 'working',
    loadState: 'bodyweight',
    weightKg: null,
    reps: null,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    distanceM: null,
    completed: null,
    ...overrides,
  }
}

function exercise(overrides: Partial<TrainingPerformanceExercise> = {}): TrainingPerformanceExercise {
  return {
    id: EXERCISE,
    name: 'Running',
    externalId: 'EX18',
    performanceType: 'distance',
    analyticsLoadType: 'none',
    analyticsRepMode: 'standard',
    measurementKind: 'distance_duration',
    unilateral: false,
    loadType: 'none',
    ...overrides,
  }
}

describe('H2D canonical Training measurements', () => {
  it('requires an explicit unit with distance and converts mi/km to canonical meters', () => {
    const base = {
      setNumber: 1, setType: 'working' as const, loadState: 'bodyweight' as const, weightLb: null,
      reps: null, durationSec: 600, leftReps: null, rightReps: null,
      leftDurationSec: null, rightDurationSec: null, completed: null, notes: null,
    }
    expect(manualWorkoutSetInputSchema.safeParse({ ...base, distance: 1, distanceUnit: null }).success).toBe(false)
    expect(manualWorkoutSetInputSchema.safeParse({ ...base, distance: null, distanceUnit: 'mi' }).success).toBe(false)
    const miles = manualWorkoutSetInputSchema.parse({ ...base, distance: 2, distanceUnit: 'mi' })
    const km = manualWorkoutSetInputSchema.parse({ ...base, distance: 5, distanceUnit: 'km' })
    expect(toCanonicalSetInsert(miles).distanceM).toBeCloseTo(milesToMeters(2), 8)
    expect(toCanonicalSetInsert(km).distanceM).toBeCloseTo(5000, 8)
    expect(measurementFamilyOf(toCanonicalSetInsert(miles))).toBe('distance_duration')
    expect(measurementFamilyMatches('distance_duration', 'duration')).toBe(true)
    expect(measurementFamilyMatches('distance_duration', 'distance_duration')).toBe(true)
    expect(measurementFamilyMatches('distance_duration', 'distance')).toBe(false)
  })

  it('keeps skill completion explicit and gives new owner exercises deterministic analytics', () => {
    expect(ownerExerciseAnalyticsDefaults('distance_duration', false)).toMatchObject({ performanceType: 'distance', analyticsLoadType: 'none' })
    expect(ownerExerciseAnalyticsDefaults('completion', false)).toMatchObject({ performanceType: 'skill', analyticsLoadType: 'none' })
    const achieved = measurementFamilyOf({ reps: null, durationSec: null, leftReps: null, rightReps: null, leftDurationSec: null, rightDurationSec: null, completed: true })
    const attempted = measurementFamilyOf({ reps: null, durationSec: null, leftReps: null, rightReps: null, leftDurationSec: null, rightDurationSec: null, completed: false })
    expect(achieved).toBe('completion')
    expect(attempted).toBe('completion')
  })

  it('derives distance and pace from one continuous canonical set', () => {
    const records = [set({ distanceM: milesToMeters(2), durationSec: 1200 })]
    const observations = trainingPerformanceObservations(records, [exercise()])
    expect(observations.find(item => item.kind === 'distance')?.value).toBeCloseTo(2, 8)
    expect(observations.find(item => item.kind === 'pace')?.value).toBeCloseTo(600, 8)
    expect(bestTrainingPerformance(observations, { exerciseId: EXERCISE, kind: 'pace', minDistanceM: milesToMeters(2) })?.sourceSet.setId)
      .toBe(records[0]?.setId)
    expect(bestTrainingPerformance(observations, { exerciseId: EXERCISE, kind: 'pace', minDistanceM: milesToMeters(2.1) })).toBeNull()
  })

  it('uses the lower side for reps/duration bests and only true for skill achievement', () => {
    const repsExercise = exercise({ name: 'Push-up each side', externalId: null, performanceType: 'other', measurementKind: 'reps_per_side', analyticsRepMode: 'per_side', loadType: 'bodyweight', unilateral: true })
    const reps = trainingPerformanceObservations([set({ leftReps: 12, rightReps: 10 })], [repsExercise])
    expect(reps.find(item => item.kind === 'reps')?.value).toBe(10)

    const skillExercise = exercise({ name: 'Handstand', externalId: null, performanceType: 'skill', measurementKind: 'completion' })
    const skillSets = [
      set({ setId: '11111111-1111-4111-8111-111111111111', completed: false }),
      set({ setId: '22222222-2222-4222-8222-222222222222', completed: true, setNumber: 2 }),
    ]
    const skill = trainingPerformanceObservations(skillSets, [skillExercise])
    expect(bestTrainingPerformance(skill, { exerciseId: EXERCISE, kind: 'skill' })?.completed).toBe(true)
  })
})

describe('H2D Stretch target math', () => {
  it('rounds distance upward and pace toward a harder target', () => {
    expect(stretchTarget('distance', 2)).toBe(2.1)
    expect(stretchTarget('pace', 611)).toBe(598)
    expect(stretchTarget('pace', 1)).toBeNull()
  })

  it('keeps existing strength/reps/duration target rules intact', () => {
    expect(stretchTarget('strength_e1rm', 120)).toBe(122.5)
    expect(stretchTarget('reps', 42)).toBe(45)
    expect(stretchTarget('duration', 95)).toBe(100)
  })
})
