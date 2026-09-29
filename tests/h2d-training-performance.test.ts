import { describe, expect, it } from 'vitest'
import {
  measurementFamilyOf,
  measurementKindAcceptsFamily,
  ownerExerciseAnalyticsDefaults,
  toCanonicalSetInsert,
  workoutSetSchema,
} from '../src/domain/training.ts'
import {
  bestTrainingPerformance,
  trainingPerformanceObservations,
} from '../src/domain/progress/training-performance.ts'
import { stretchObservations } from '../src/domain/progress/stretch-performance.ts'
import { stretchTarget } from '../src/domain/coach-stretch.ts'
import { distanceToMeters, formatPaceSecondsPerMile, metersToMiles, secondsPerMile } from '../src/domain/units.ts'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from '../src/domain/progress/types.ts'
import type { StretchExerciseDefinition, StretchSetRecord } from '../src/domain/progress/stretch-performance.ts'

const BASE = {
  setId: 'set-1',
  sessionId: 'session-1',
  sessionExerciseId: 'appearance-1',
  exerciseId: 'run',
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
} satisfies CanonicalSetRecord

function exercise(overrides: Partial<ProgressExerciseDefinition> = {}): ProgressExerciseDefinition {
  return {
    id: 'run',
    name: 'Running',
    externalId: 'EX18',
    performanceType: 'distance',
    analyticsLoadType: 'none',
    analyticsRepMode: 'standard',
    measurementKind: 'distance_duration',
    unilateral: false,
    ...overrides,
  }
}

describe('H2D Training measurement contract', () => {
  it('recognizes new measurement families without mixing unrelated facts', () => {
    expect(measurementFamilyOf({ ...BASE, distanceM: 1609.344 })).toBe('distance')
    expect(measurementFamilyOf({ ...BASE, distanceM: 1609.344, durationSec: 600 })).toBe('distance_duration')
    expect(measurementFamilyOf({ ...BASE, completed: true })).toBe('completion')
    expect(measurementFamilyOf({ ...BASE, reps: 10, distanceM: 100 })).toBe('mixed')
    expect(measurementKindAcceptsFamily('distance_duration', 'duration')).toBe(true)
    expect(measurementKindAcceptsFamily('distance_duration', 'distance_duration')).toBe(true)
    expect(measurementKindAcceptsFamily('distance', 'duration')).toBe(false)
  })

  it('converts friendly distance input to canonical meters', () => {
    const prepared = toCanonicalSetInsert({
      setNumber: 1, setType: 'working', loadState: 'bodyweight', weightLb: null,
      reps: null, durationSec: 600, leftReps: null, rightReps: null,
      leftDurationSec: null, rightDurationSec: null,
      distance: 2, distanceUnit: 'mi', completed: null, notes: null,
    })
    expect(prepared.distanceM).toBeCloseTo(3218.688)
    expect(metersToMiles(prepared.distanceM!)).toBeCloseTo(2)
    expect(distanceToMeters(5, 'km')).toBe(5000)
  })

  it('keeps distance positive and skill binary', () => {
    const valid = workoutSetSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      setNumber: 1, setType: 'working', loadState: 'bodyweight', weightKg: null,
      reps: null, durationSec: 600, leftReps: null, rightReps: null,
      leftDurationSec: null, rightDurationSec: null, distanceM: 1609.344, completed: null, notes: null,
    })
    expect(valid.success).toBe(true)
    const invalid = workoutSetSchema.safeParse({
      id: '11111111-1111-4111-8111-111111111111',
      setNumber: 1, setType: 'working', loadState: 'bodyweight', weightKg: null,
      reps: null, durationSec: null, leftReps: null, rightReps: null,
      leftDurationSec: null, rightDurationSec: null, distanceM: 0, completed: null, notes: null,
    })
    expect(invalid.success).toBe(false)
    expect(ownerExerciseAnalyticsDefaults('distance_duration', false).performanceType).toBe('distance')
    expect(ownerExerciseAnalyticsDefaults('completion', false).performanceType).toBe('skill')
  })
})

describe('H2D performance authority', () => {
  it('derives distance and pace from one continuous canonical set', () => {
    const set = { ...BASE, distanceM: 3218.688, durationSec: 1200 }
    const observations = trainingPerformanceObservations([set], exercise())
    expect(observations.map((item) => item.kind)).toEqual(['duration', 'distance', 'pace'])
    const distance = bestTrainingPerformance(observations, 'distance')
    const pace = bestTrainingPerformance(observations, 'pace', { minDistanceM: distanceToMeters(2, 'mi') })
    expect(distance?.value).toBeCloseTo(3218.688)
    expect(pace?.value).toBeCloseTo(600)
    expect(formatPaceSecondsPerMile(pace!.value)).toBe('10:00/mi')
  })

  it('excludes pace attempts below the Goal minimum distance', () => {
    const shortFast = { ...BASE, setId: 'short', distanceM: distanceToMeters(1, 'mi'), durationSec: 480 }
    const long = { ...BASE, setId: 'long', sessionId: 's2', sessionExerciseId: 'a2', distanceM: distanceToMeters(2, 'mi'), durationSec: 1200 }
    const obs = trainingPerformanceObservations([shortFast, long], exercise())
    expect(bestTrainingPerformance(obs, 'pace')?.value).toBeCloseTo(480)
    expect(bestTrainingPerformance(obs, 'pace', { minDistanceM: distanceToMeters(2, 'mi') })?.value).toBeCloseTo(600)
  })

  it('records false skill attempts but only true completion is a best', () => {
    const skill = exercise({ id: 'skill', name: 'Handstand', externalId: null, performanceType: 'skill', measurementKind: 'completion' })
    const failed = { ...BASE, setId: 'failed', exerciseId: 'skill', completed: false }
    const passed = { ...BASE, setId: 'passed', sessionId: 's2', sessionExerciseId: 'a2', exerciseId: 'skill', completed: true }
    const obs = trainingPerformanceObservations([failed, passed], skill)
    expect(obs.map((item) => item.value).sort()).toEqual([0, 1])
    expect(bestTrainingPerformance(obs, 'skill')?.sourceSet.setId).toBe('passed')
  })

  it('keeps per-side reps and duration conservative', () => {
    const repsExercise = exercise({ id: 'push', name: 'Push', externalId: null, performanceType: 'bodyweight_reps', measurementKind: 'reps_per_side', analyticsRepMode: 'per_side', unilateral: true })
    const reps = { ...BASE, exerciseId: 'push', leftReps: 12, rightReps: 10 }
    expect(bestTrainingPerformance(trainingPerformanceObservations([reps], repsExercise), 'reps')?.value).toBe(10)
    const timedExercise = exercise({ id: 'hold', name: 'Hold', externalId: null, performanceType: 'timed', measurementKind: 'duration_per_side', analyticsRepMode: 'per_side', unilateral: true })
    const timed = { ...BASE, exerciseId: 'hold', leftDurationSec: 40, rightDurationSec: 35 }
    expect(bestTrainingPerformance(trainingPerformanceObservations([timed], timedExercise), 'duration')?.value).toBe(35)
  })
})

describe('H2D Stretch distance and pace', () => {
  function stretchSet(id: string, miles: number, seconds: number, date: string): StretchSetRecord {
    return { ...BASE, setId: id, sessionId: `s-${id}`, sessionExerciseId: `a-${id}`, sessionDate: date,
      sessionCreatedAt: `${date}T18:00:00.000Z`, distanceM: distanceToMeters(miles, 'mi'), durationSec: seconds, sessionType: 'ad_hoc' }
  }
  const stretchExercise: StretchExerciseDefinition = { ...exercise(), loadType: 'none' }

  it('emits distance and pace from distance-duration Training but never a skill strategy', () => {
    const obs = stretchObservations([stretchSet('one', 2, 1200, '2026-09-20')], [stretchExercise])
    expect(obs.map((item) => item.strategy)).toEqual(['distance', 'pace'])
    const skillExercise: StretchExerciseDefinition = { ...exercise({ id: 'skill', performanceType: 'skill', measurementKind: 'completion' }), loadType: 'none' }
    const skillSet: StretchSetRecord = { ...BASE, exerciseId: 'skill', completed: true, sessionType: 'ad_hoc' }
    expect(stretchObservations([skillSet], [skillExercise])).toEqual([])
  })

  it('uses bounded distance rounding and a genuinely faster pace target', () => {
    expect(stretchTarget('distance', 2)).toBe(2.1)
    expect(stretchTarget('pace', 600)).toBe(588)
    expect(stretchTarget('pace', 1)).toBeNull()
    expect(secondsPerMile(distanceToMeters(2, 'mi'), 1200)).toBeCloseTo(600)
  })
})
