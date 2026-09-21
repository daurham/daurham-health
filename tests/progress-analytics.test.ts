import { describe, expect, it } from 'vitest'
import { epleyEstimated1RmKg, estimatedStrengthForSet, sessionStrengthPoint, strengthRepsForSet, volumeRepsForSet } from '../src/domain/progress/exercise-performance.ts'
import { expandsFrontier, expandsTimedFrontier, performanceFrontier, timedPerformanceFrontier } from '../src/domain/progress/frontier.ts'
import { performanceBestsForExercise } from '../src/domain/progress/prs.ts'
import { estimatedStrengthTrend, progressionPattern } from '../src/domain/progress/exercise-trend.ts'
import { periodExternalVolume, setExternalVolumeKg } from '../src/domain/progress/volume.ts'
import { bodyWeightTrend, compareSparseBodyMetric } from '../src/domain/progress/body-trend.ts'
import { relativeStrength } from '../src/domain/progress/relative-strength.ts'
import { trailingPeriod } from '../src/domain/progress/periods.ts'
import { trainingConsistency } from '../src/domain/progress/consistency.ts'
import { compareCounts } from '../src/domain/progress/comparison.ts'
import { buildProgressOverview } from '../src/domain/progress/overview.ts'
import { findingsFromExerciseTrend } from '../src/domain/progress/findings.ts'
import type {
  AnalyzableWorkingSet,
  BodyObservation,
  CanonicalSetRecord,
  ProgressExerciseDefinition,
} from '../src/domain/progress/types.ts'

const EXERCISE_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const TIMED_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const UNILATERAL_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function loadedRepExercise(): ProgressExerciseDefinition {
  return {
    id: EXERCISE_ID,
    name: 'Box Squat',
    externalId: 'EX01',
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  }
}

function timedExercise(): ProgressExerciseDefinition {
  return {
    id: TIMED_ID,
    name: 'Farmer Carry',
    externalId: 'EX07',
    performanceType: 'timed',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'duration',
    unilateral: false,
  }
}

function setRecord(
  partial: Partial<CanonicalSetRecord> & Pick<CanonicalSetRecord, 'setId' | 'sessionId' | 'sessionDate'>,
): CanonicalSetRecord {
  return {
    sessionExerciseId: `${partial.sessionId}-ex`,
    exerciseId: EXERCISE_ID,
    sessionCreatedAt: `${partial.sessionDate}T12:00:00.000Z`,
    sessionExercisePosition: 1,
    setNumber: 1,
    setType: 'working',
    loadState: 'external',
    weightKg: 100,
    reps: 10,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    ...partial,
  }
}

function analyzable(record: CanonicalSetRecord): AnalyzableWorkingSet {
  if (record.weightKg == null || record.reps == null) {
    throw new Error('expected analyzable set')
  }
  return { ...record, weightKg: record.weightKg, reps: record.reps }
}

function bodyWeight(id: string, date: string, kg: number, measuredAt = `${date}T08:00:00.000Z`): BodyObservation {
  return {
    measurementId: id,
    measurementSessionId: `sess-${id}`,
    key: 'weight',
    value: kg,
    unit: 'kg',
    valueKind: 'measured',
    measuredAt,
    timezone: 'America/Los_Angeles',
    calendarDate: date,
  }
}

describe('e1RM', () => {
  it('uses Epley load * (1 + reps / 30) and keeps the source set', () => {
    const set = setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-09-01', weightKg: 100, reps: 10 })
    expect(epleyEstimated1RmKg(100, 10)).toBeCloseTo(133.333333, 6)
    const estimate = estimatedStrengthForSet(set, loadedRepExercise())
    expect(estimate?.formula).toBe('epley')
    expect(estimate?.confidence).toBe('high')
    expect(estimate?.value).toBeCloseTo(133.333333, 6)
    expect(estimate?.sourceSet.setId).toBe('s1')
  })

  it('excludes >15 reps from estimated-strength trends and PRs', () => {
    const highReps = setRecord({ setId: 's2', sessionId: 'w1', sessionDate: '2026-09-01', weightKg: 50, reps: 20 })
    expect(estimatedStrengthForSet(highReps, loadedRepExercise())).toBeNull()
  })

  it('selects the best high-confidence session strength set', () => {
    const sets = [
      setRecord({ setId: 'a', sessionId: 'w1', sessionDate: '2026-09-01', setNumber: 1, weightKg: 100, reps: 10 }),
      setRecord({ setId: 'b', sessionId: 'w1', sessionDate: '2026-09-01', setNumber: 2, weightKg: 140, reps: 5 }),
      setRecord({ setId: 'c', sessionId: 'w1', sessionDate: '2026-09-01', setNumber: 3, weightKg: 60, reps: 14 }),
    ]
    const point = sessionStrengthPoint(sets, loadedRepExercise())
    expect(point?.sourceSet.setId).toBe('b')
    expect(point?.estimated1RmKg).toBeCloseTo(epleyEstimated1RmKg(140, 5), 8)
  })

  it('does not use a 13–15 rep estimate as the session strength point', () => {
    const sets = [setRecord({ setId: 'only', sessionId: 'w1', sessionDate: '2026-09-01', weightKg: 80, reps: 14 })]
    expect(sessionStrengthPoint(sets, loadedRepExercise())).toBeNull()
    expect(estimatedStrengthForSet(sets[0]!, loadedRepExercise())?.confidence).toBe('low')
  })
})

describe('performance frontier', () => {
  it('rejects dominated sets and expands on higher reps or load', () => {
    const history = [
      analyzable(setRecord({ setId: 'a', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 100, reps: 15 })),
      analyzable(setRecord({ setId: 'b', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 110, reps: 12 })),
      analyzable(setRecord({ setId: 'c', sessionId: 'w3', sessionDate: '2026-01-15', weightKg: 120, reps: 10 })),
      analyzable(setRecord({ setId: 'd', sessionId: 'w4', sessionDate: '2026-01-22', weightKg: 130, reps: 6 })),
    ]
    expect(expandsFrontier(analyzable(setRecord({ setId: 'x', sessionId: 'w5', sessionDate: '2026-02-01', weightKg: 120, reps: 8 })), history)).toBe(
      false,
    )
    expect(expandsFrontier(analyzable(setRecord({ setId: 'y', sessionId: 'w6', sessionDate: '2026-02-08', weightKg: 120, reps: 12 })), history)).toBe(
      true,
    )
    expect(expandsFrontier(analyzable(setRecord({ setId: 'z', sessionId: 'w7', sessionDate: '2026-02-15', weightKg: 135, reps: 5 })), history)).toBe(
      true,
    )
    const frontier = performanceFrontier([
      ...history,
      analyzable(setRecord({ setId: 'y', sessionId: 'w6', sessionDate: '2026-02-08', weightKg: 120, reps: 12 })),
      analyzable(setRecord({ setId: 'z', sessionId: 'w7', sessionDate: '2026-02-15', weightKg: 135, reps: 5 })),
    ])
    expect(frontier.map((set) => `${set.weightKg}x${set.reps}`)).toEqual(['100x15', '120x12', '130x6', '135x5'])
  })
})

describe('performance bests', () => {
  it('records load, rep-at-load, e1RM, frontier, and session-volume PRs', () => {
    const sets = [
      setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 100, reps: 8 }),
      setRecord({ setId: 's2', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 100, reps: 10 }),
      setRecord({ setId: 's3', sessionId: 'w3', sessionDate: '2026-01-15', weightKg: 120, reps: 6 }),
    ]
    const events = performanceBestsForExercise(sets, loadedRepExercise())
    expect(events).toHaveLength(2)
    expect(events[0]?.sourceSessionId).toBe('w2')
    expect(events[0]?.achievements).toEqual(
      expect.arrayContaining(['rep_at_load', 'frontier', 'estimated_strength', 'session_volume']),
    )
    expect(events[1]?.sourceSessionId).toBe('w3')
    expect(events[1]?.achievements).toEqual(expect.arrayContaining(['load', 'frontier', 'estimated_strength']))
  })

  it('does not award a PR against superior historical performance', () => {
    const sets = [
      setRecord({ setId: 'best', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 130, reps: 10 }),
      setRecord({ setId: 'worse', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 130, reps: 8 }),
    ]
    const events = performanceBestsForExercise(sets, loadedRepExercise())
    expect(events.some((event) => event.sourceSetId === 'worse')).toBe(false)
  })
})

describe('exercise trends', () => {
  it('returns insufficient_data with fewer than 6 appearances', () => {
    const points = Array.from({ length: 5 }, (_, index) => ({
      sessionId: `w${index}`,
      sessionExerciseId: `e${index}`,
      exerciseId: EXERCISE_ID,
      date: `2026-0${index + 1}-01`,
      estimated1RmKg: 100 + index,
      sourceSet: analyzable(
        setRecord({ setId: `s${index}`, sessionId: `w${index}`, sessionDate: `2026-0${index + 1}-01` }),
      ),
    }))
    const trend = estimatedStrengthTrend(points)
    expect(trend.status).toBe('insufficient_data')
    if (trend.status === 'insufficient_data') {
      expect(trend.required).toBe(6)
      expect(trend.observations).toBe(5)
    }
  })

  it('compares recent 3 vs previous 3 medians with 2% thresholds', () => {
    const values = [100, 100, 100, 110, 110, 110]
    const points = values.map((value, index) => ({
      sessionId: `w${index}`,
      sessionExerciseId: `e${index}`,
      exerciseId: EXERCISE_ID,
      date: `2026-01-${String(index + 1).padStart(2, '0')}`,
      estimated1RmKg: value,
      sourceSet: analyzable(
        setRecord({
          setId: `s${index}`,
          sessionId: `w${index}`,
          sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
        }),
      ),
    }))
    const improving = estimatedStrengthTrend(points)
    expect(improving.status).toBe('available')
    if (improving.status === 'available') {
      expect(improving.value.basis).toBe('recent_3_vs_previous_3')
      expect(improving.value.previousMedian).toBe(100)
      expect(improving.value.recentMedian).toBe(110)
      expect(improving.value.direction).toBe('improving')
    }

    const stable = estimatedStrengthTrend(points.map((point) => ({ ...point, estimated1RmKg: 100 })))
    expect(stable.status === 'available' && stable.value.direction).toBe('stable')

    const decreasing = estimatedStrengthTrend(
      [110, 110, 110, 100, 100, 100].map((value, index) => ({ ...points[index]!, estimated1RmKg: value })),
    )
    expect(decreasing.status === 'available' && decreasing.value.direction).toBe('decreasing')
  })

  it('classifies conservative progression patterns', () => {
    const ten = [setRecord({ setId: 'a', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 115, reps: 8 })]
    const twelve = [setRecord({ setId: 'b', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 115, reps: 12 })]
    expect(progressionPattern([ten, twelve], loadedRepExercise())).toBe('rep_progression')
    const heavier = [setRecord({ setId: 'c', sessionId: 'w3', sessionDate: '2026-01-15', weightKg: 135, reps: 10 })]
    const base = [setRecord({ setId: 'd', sessionId: 'w4', sessionDate: '2026-01-01', weightKg: 115, reps: 10 })]
    expect(progressionPattern([base, heavier], loadedRepExercise())).toBe('load_progression')
  })
})

describe('volume', () => {
  it('sums valid external load * reps and ignores unknown and bodyweight work', () => {
    const exercise = loadedRepExercise()
    const valid = setRecord({ setId: 'v', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 100, reps: 5 })
    const unknown = setRecord({
      setId: 'u',
      sessionId: 'w1',
      sessionDate: '2026-01-01',
      loadState: 'unknown',
      weightKg: null,
      reps: 10,
    })
    const bodyweight = setRecord({
      setId: 'bw',
      sessionId: 'w1',
      sessionDate: '2026-01-01',
      loadState: 'bodyweight',
      weightKg: null,
      reps: 12,
    })
    expect(setExternalVolumeKg(valid, exercise)).toBe(500)
    expect(setExternalVolumeKg(unknown, exercise)).toBeNull()
    expect(setExternalVolumeKg(bodyweight, exercise)).toBeNull()
    expect(periodExternalVolume([valid, unknown, bodyweight], exercise)).toEqual({ kg: 500, observations: 1 })
    expect(periodExternalVolume([valid], timedExercise()).observations).toBe(0)
  })
})

describe('body weight Theil-Sen', () => {
  it('computes a known slope, resists an outlier, and requires 5 points over 14 days', () => {
    const linear = [
      bodyWeight('1', '2026-01-01', 80),
      bodyWeight('2', '2026-01-08', 80.2),
      bodyWeight('3', '2026-01-15', 80.4),
      bodyWeight('4', '2026-01-22', 80.6),
      bodyWeight('5', '2026-01-29', 80.8),
    ]
    const trend = bodyWeightTrend(linear)
    expect(trend.status).toBe('available')
    if (trend.status === 'available') {
      expect(trend.value.slopePerWeek).toBeCloseTo(0.2, 6)
      expect(trend.value.measurementCount).toBe(5)
      expect(trend.value.spanDays).toBe(28)
    }

    const withOutlier = [
      ...linear.slice(0, 2),
      bodyWeight('x', '2026-01-10', 95),
      ...linear.slice(2),
    ]
    const robust = bodyWeightTrend(withOutlier)
    expect(robust.status).toBe('available')
    if (robust.status === 'available') {
      expect(Math.abs(robust.status === 'available' ? robust.value.slopePerWeek - 0.2 : 99)).toBeLessThan(0.15)
    }

    expect(bodyWeightTrend(linear.slice(0, 4)).status).toBe('insufficient_data')
    expect(
      bodyWeightTrend([
        bodyWeight('a', '2026-01-01', 80),
        bodyWeight('b', '2026-01-02', 80.1),
        bodyWeight('c', '2026-01-03', 80.2),
        bodyWeight('d', '2026-01-04', 80.3),
        bodyWeight('e', '2026-01-05', 80.4),
      ]).status,
    ).toBe('insufficient_data')
  })

  it('does not interpolate sparse metrics', () => {
    const series = [
      { ...bodyWeight('1', '2026-01-01', 30), key: 'body_fat_percentage', unit: 'percent' },
      { ...bodyWeight('2', '2026-03-01', 28), key: 'body_fat_percentage', unit: 'percent' },
    ]
    const comparison = compareSparseBodyMetric(series, 'body_fat_percentage', '2026-02-01', '2026-03-01')
    expect(comparison.status).toBe('available')
    if (comparison.status === 'available') {
      expect(comparison.value.change).toBe(-2)
      expect(comparison.value.current?.value).toBe(28)
    }
  })
})

describe('relative strength', () => {
  it('uses the nearest weight within ±3 days and prefers the earlier tie', () => {
    const point = sessionStrengthPoint(
      [setRecord({ setId: 's', sessionId: 'w', sessionDate: '2026-01-10', weightKg: 100, reps: 10 })],
      loadedRepExercise(),
    )
    const earlier = bodyWeight('early', '2026-01-07', 80)
    const later = bodyWeight('late', '2026-01-13', 90)
    const result = relativeStrength(point, [later, earlier])
    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.value.bodyMeasurement.measurementId).toBe('early')
      expect(result.value.ratio).toBeCloseTo(epleyEstimated1RmKg(100, 10) / 80, 8)
    }
    expect(relativeStrength(point, [bodyWeight('far', '2026-01-01', 80)]).status).toBe('not_applicable')
  })
})

describe('periods and consistency', () => {
  it('builds equal-length non-overlapping trailing windows', () => {
    const period = trailingPeriod('30d', '2026-10-21')
    expect(period).toMatchObject({
      start: '2026-09-22',
      end: '2026-10-21',
      comparisonStart: '2026-08-23',
      comparisonEnd: '2026-09-21',
      dayCount: 30,
    })
    expect(period.comparisonEnd! < period.start).toBe(true)
    const all = trailingPeriod('all', '2026-10-21', '2026-01-01')
    expect(all.comparisonStart).toBeNull()
    expect(all.start).toBe('2026-01-01')
  })

  it('reports workout count, workouts/week, median gap, and longest gap', () => {
    const consistency = trainingConsistency(
      [
        { sessionId: 'a', sessionDate: '2026-09-01', createdAt: '2026-09-01T00:00:00.000Z' },
        { sessionId: 'b', sessionDate: '2026-09-04', createdAt: '2026-09-04T00:00:00.000Z' },
        { sessionId: 'c', sessionDate: '2026-09-08', createdAt: '2026-09-08T00:00:00.000Z' },
      ],
      '2026-09-01',
      '2026-09-15',
    )
    expect(consistency.status).toBe('available')
    if (consistency.status === 'available') {
      expect(consistency.value.workoutCount).toBe(3)
      expect(consistency.value.workoutsPerWeek).toBeCloseTo((3 * 7) / 15, 8)
      expect(consistency.value.medianGapDays).toBe(3.5)
      expect(consistency.value.longestGapDays).toBe(4)
    }
  })

  it('does not treat missing previous values as zero', () => {
    const comparison = compareCounts(4, null)
    expect(comparison.status).toBe('not_applicable')
    expect(compareCounts(4, 0).status).toBe('available')
    if (compareCounts(4, 0).status === 'available') {
      expect(compareCounts(4, 0).status === 'available' && compareCounts(4, 0).value.percentChange).toBeNull()
    }
  })
})

describe('findings and overview', () => {
  it('does not create findings from insufficient data and tags domains', () => {
    const shortTrend = estimatedStrengthTrend([])
    expect(findingsFromExerciseTrend(EXERCISE_ID, shortTrend, [])).toEqual([])
    const overview = buildProgressOverview({
      asOf: '2026-02-01',
      range: '30d',
      exercises: [loadedRepExercise(), timedExercise()],
      workouts: [{ sessionId: 'w1', sessionDate: '2026-01-20', createdAt: '2026-01-20T00:00:00.000Z' }],
      sets: [
        setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-01-20', weightKg: 100, reps: 8 }),
        setRecord({
          setId: 't1',
          sessionId: 'w1',
          sessionDate: '2026-01-20',
          exerciseId: TIMED_ID,
          durationSec: 40,
          reps: null,
          weightKg: 32,
        }),
      ],
      bodyObservations: [bodyWeight('bw1', '2026-01-20', 82)],
    })
    expect(overview.findings.every((finding) => finding.domain === 'training' || finding.domain === 'body')).toBe(true)
    expect(overview.findings.some((finding) => finding.kind === 'exercise_improved')).toBe(false)
    expect(overview.exercises.find((item) => item.exerciseId === TIMED_ID)?.estimatedStrength.status).toBe(
      'not_applicable',
    )
    expect(overview.exercises.find((item) => item.exerciseId === TIMED_ID)?.trend.status).toBe('not_applicable')
    expect(overview.findings.some((finding) => finding.kind === 'performance_best')).toBe(false)
    expect(overview.training.workouts.status === 'available' && overview.training.workouts.value.count).toBe(1)
    expect(overview.training.sessions).toHaveLength(1)
    expect(overview.body.weight.observations).toHaveLength(1)
    expect(overview.body.weight.requirements.minimumMeasurements).toBe(5)
    expect(overview.exercises[0]?.performedPoints.length).toBeGreaterThan(0)
    expect(overview.exercises[0]?.appearanceCount).toBeGreaterThan(0)
    expect(overview.body.weight.trend.status).toBe('insufficient_data')
  })
})

function perSideExercise(): ProgressExerciseDefinition {
  return {
    id: UNILATERAL_ID,
    name: 'One-Arm Dumbbell Row',
    externalId: 'EX16',
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'per_side',
    measurementKind: 'reps_per_side',
    unilateral: true,
  }
}

describe('baseline vs PR events', () => {
  it('establishes historical bests on first appearance without minting a PR finding', () => {
    const sets = [
      setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-01-01', setNumber: 1, weightKg: 125, reps: 10 }),
      setRecord({ setId: 's2', sessionId: 'w1', sessionDate: '2026-01-01', setNumber: 2, weightKg: 135, reps: 8 }),
    ]
    expect(performanceBestsForExercise(sets, loadedRepExercise())).toEqual([])
    const overview = buildProgressOverview({
      asOf: '2026-01-01',
      range: 'all',
      exercises: [loadedRepExercise()],
      workouts: [{ sessionId: 'w1', sessionDate: '2026-01-01', createdAt: '2026-01-01T12:00:00.000Z' }],
      sets,
      bodyObservations: [],
    })
    const exercise = overview.exercises[0]!
    expect(exercise.latestPerformance?.loadKg).toBe(135)
    expect(exercise.frontier.map((point) => `${point.loadKg}x${point.reps}`)).toEqual(['125x10', '135x8'])
    expect(exercise.recentPrs).toEqual([])
    expect(overview.findings.some((finding) => finding.kind === 'performance_best')).toBe(false)
  })

  it('aggregates same-session sets and mints one PR event only after a later improvement', () => {
    const sets = [
      setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-01-01', setNumber: 1, weightKg: 125, reps: 10 }),
      setRecord({ setId: 's2', sessionId: 'w1', sessionDate: '2026-01-01', setNumber: 2, weightKg: 135, reps: 8 }),
      setRecord({ setId: 's3', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 135, reps: 10 }),
    ]
    const events = performanceBestsForExercise(sets, loadedRepExercise())
    expect(events).toHaveLength(1)
    expect(events[0]?.sourceSessionId).toBe('w2')
    expect(events[0]?.achievements).toEqual(
      expect.arrayContaining(['rep_at_load', 'frontier', 'estimated_strength']),
    )
    expect(events[0]?.evidence.some((item) => item.setId === 's3')).toBe(true)
  })
})

describe('unilateral loaded-rep analytics', () => {
  it('keeps standard bilateral reps unchanged', () => {
    const set = setRecord({ setId: 's1', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 100, reps: 10 })
    expect(strengthRepsForSet(set, loadedRepExercise())).toBe(10)
    expect(volumeRepsForSet(set, loadedRepExercise())).toBe(10)
  })

  it('normalizes equal sides with min for strength and sum for volume', () => {
    const set = setRecord({
      setId: 's1',
      sessionId: 'w1',
      sessionDate: '2026-01-01',
      exerciseId: UNILATERAL_ID,
      weightKg: 30,
      reps: null,
      leftReps: 10,
      rightReps: 10,
    })
    expect(strengthRepsForSet(set, perSideExercise())).toBe(10)
    expect(volumeRepsForSet(set, perSideExercise())).toBe(20)
    expect(epleyEstimated1RmKg(30, 10)).toBeCloseTo(estimatedStrengthForSet(set, perSideExercise())!.value, 8)
    expect(setExternalVolumeKg(set, perSideExercise())).toBe(600)
  })

  it('uses the weaker side for e1RM and does not sum sides', () => {
    const set = setRecord({
      setId: 's1',
      sessionId: 'w1',
      sessionDate: '2026-01-01',
      exerciseId: UNILATERAL_ID,
      weightKg: 30,
      reps: null,
      leftReps: 10,
      rightReps: 8,
    })
    expect(strengthRepsForSet(set, perSideExercise())).toBe(8)
    expect(volumeRepsForSet(set, perSideExercise())).toBe(18)
    const estimate = estimatedStrengthForSet(set, perSideExercise())
    expect(estimate?.value).toBeCloseTo(epleyEstimated1RmKg(30, 8), 8)
    expect(estimate?.value).not.toBeCloseTo(epleyEstimated1RmKg(30, 18), 8)
  })

  it('leaves one-sided incomplete data unavailable and does not invent the missing side', () => {
    const set = setRecord({
      setId: 's1',
      sessionId: 'w1',
      sessionDate: '2026-01-01',
      exerciseId: UNILATERAL_ID,
      weightKg: 30,
      reps: null,
      leftReps: 10,
      rightReps: null,
    })
    expect(strengthRepsForSet(set, perSideExercise())).toBeNull()
    expect(estimatedStrengthForSet(set, perSideExercise())).toBeNull()
    expect(volumeRepsForSet(set, perSideExercise())).toBe(10)
  })

  it('keeps original left/right values in PR evidence after a later improvement', () => {
    const sets = [
      setRecord({
        setId: 's1',
        sessionId: 'w1',
        sessionDate: '2026-01-01',
        exerciseId: UNILATERAL_ID,
        weightKg: 30,
        reps: null,
        leftReps: 8,
        rightReps: 8,
      }),
      setRecord({
        setId: 's2',
        sessionId: 'w2',
        sessionDate: '2026-01-08',
        exerciseId: UNILATERAL_ID,
        weightKg: 30,
        reps: null,
        leftReps: 10,
        rightReps: 9,
      }),
    ]
    const events = performanceBestsForExercise(sets, perSideExercise())
    expect(events).toHaveLength(1)
    expect(events[0]?.achievements).toEqual(
      expect.arrayContaining(['rep_at_load', 'frontier', 'estimated_strength']),
    )
    expect(events[0]?.performed).toMatchObject({ loadKg: 30, reps: 9, leftReps: 10, rightReps: 9 })
    expect(events[0]?.evidence[0]).toMatchObject({
      setId: 's2',
      leftReps: 10,
      rightReps: 9,
      reps: null,
      strengthReps: 9,
    })
  })

  it('lets known unilateral exercises participate in frontier, e1RM, and trend when valid', () => {
    const appearances = Array.from({ length: 6 }, (_, index) => [
      setRecord({
        setId: `s${index}`,
        sessionId: `w${index}`,
        sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
        exerciseId: UNILATERAL_ID,
        weightKg: 30,
        reps: null,
        leftReps: index < 3 ? 8 : 10,
        rightReps: index < 3 ? 8 : 10,
      }),
    ])
    const overview = buildProgressOverview({
      asOf: '2026-01-06',
      range: 'all',
      exercises: [perSideExercise()],
      workouts: appearances.map((_, index) => ({
        sessionId: `w${index}`,
        sessionDate: `2026-01-${String(index + 1).padStart(2, '0')}`,
        createdAt: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
      })),
      sets: appearances.flat(),
      bodyObservations: [],
    })
    const exercise = overview.exercises[0]!
    expect(exercise.estimatedStrength.status).toBe('available')
    expect(exercise.trend.status).toBe('available')
    if (exercise.trend.status === 'available') {
      expect(exercise.trend.value.direction).toBe('improving')
    }
    expect(exercise.frontier.some((point) => point.reps === 10)).toBe(true)
    expect(exercise.recentPrs.length).toBeGreaterThan(0)
  })
})

describe('timed load/duration analytics', () => {
  function timedSet(
    partial: Partial<CanonicalSetRecord> & Pick<CanonicalSetRecord, 'setId' | 'sessionId' | 'sessionDate'>,
  ): CanonicalSetRecord {
    return setRecord({
      exerciseId: TIMED_ID,
      reps: null,
      durationSec: 60,
      weightKg: 20,
      ...partial,
    })
  }

  it('rejects dominated load/duration points and expands on duration or load', () => {
    const history = [
      timedSet({ setId: 'a', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 18.14, durationSec: 60 }),
      timedSet({ setId: 'b', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 22.68, durationSec: 45 }),
      timedSet({ setId: 'c', sessionId: 'w3', sessionDate: '2026-01-15', weightKg: 27.22, durationSec: 30 }),
    ]
    expect(
      expandsTimedFrontier(
        timedSet({ setId: 'x', sessionId: 'w4', sessionDate: '2026-01-22', weightKg: 18.14, durationSec: 45 }),
        history,
      ),
    ).toBe(false)
    expect(
      expandsTimedFrontier(
        timedSet({ setId: 'y', sessionId: 'w5', sessionDate: '2026-01-29', weightKg: 22.68, durationSec: 60 }),
        history,
      ),
    ).toBe(true)
    expect(
      expandsTimedFrontier(
        timedSet({ setId: 'z', sessionId: 'w6', sessionDate: '2026-02-05', weightKg: 31.75, durationSec: 20 }),
        history,
      ),
    ).toBe(true)
    const frontier = timedPerformanceFrontier([
      ...history,
      timedSet({ setId: 'y', sessionId: 'w5', sessionDate: '2026-01-29', weightKg: 22.68, durationSec: 60 }),
      timedSet({ setId: 'z', sessionId: 'w6', sessionDate: '2026-02-05', weightKg: 31.75, durationSec: 20 }),
    ])
    expect(frontier.map((set) => `${set.weightKg}x${set.durationSec}`)).toEqual([
      '22.68x60',
      '27.22x30',
      '31.75x20',
    ])
  })

  it('treats the first timed performance as baseline, not a PR', () => {
    const sets = [timedSet({ setId: 't1', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 20, durationSec: 45 })]
    expect(performanceBestsForExercise(sets, timedExercise())).toEqual([])
  })

  it('creates load, duration-at-load, and frontier achievements after baseline', () => {
    const sets = [
      timedSet({ setId: 't1', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 20, durationSec: 45 }),
      timedSet({ setId: 't2', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 20, durationSec: 60 }),
      timedSet({ setId: 't3', sessionId: 'w3', sessionDate: '2026-01-15', weightKg: 24, durationSec: 30 }),
    ]
    const events = performanceBestsForExercise(sets, timedExercise())
    expect(events).toHaveLength(2)
    expect(events[0]?.achievements).toEqual(expect.arrayContaining(['duration_at_load', 'frontier']))
    expect(events[0]?.achievements).not.toContain('estimated_strength')
    expect(events[1]?.achievements).toEqual(expect.arrayContaining(['load', 'frontier']))
  })

  it('never assigns e1RM or a load*seconds score to timed exercises', () => {
    const overview = buildProgressOverview({
      asOf: '2026-01-15',
      range: 'all',
      exercises: [timedExercise()],
      workouts: [
        { sessionId: 'w1', sessionDate: '2026-01-01', createdAt: '2026-01-01T12:00:00.000Z' },
        { sessionId: 'w2', sessionDate: '2026-01-08', createdAt: '2026-01-08T12:00:00.000Z' },
      ],
      sets: [
        timedSet({ setId: 't1', sessionId: 'w1', sessionDate: '2026-01-01', weightKg: 20, durationSec: 45 }),
        timedSet({ setId: 't2', sessionId: 'w2', sessionDate: '2026-01-08', weightKg: 24, durationSec: 40 }),
      ],
      bodyObservations: [],
    })
    const exercise = overview.exercises[0]!
    expect(exercise.estimatedStrength.status).toBe('not_applicable')
    expect(exercise.trend.status).toBe('not_applicable')
    expect(exercise.volume.status).toBe('not_applicable')
    expect(exercise.relativeStrength.status).toBe('not_applicable')
    expect(exercise.latestPerformance).toMatchObject({ loadKg: 24, durationSec: 40, estimated1RmKg: null })
    expect(exercise.frontier.some((point) => point.durationSec === 45)).toBe(true)
    expect(JSON.stringify(exercise)).not.toMatch(/load\s*\*\s*seconds|pseudo-strength|score/i)
    expect(exercise.recentPrs.every((event) => !event.achievements.includes('estimated_strength'))).toBe(true)
  })
})

