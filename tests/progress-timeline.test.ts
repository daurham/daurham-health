import { describe, expect, it } from 'vitest'
import { buildProgressOverview } from '../src/domain/progress/overview.ts'
import {
  buildProgressTimeline,
  groupedTimelineDays,
  timelineEventsForFocus,
  timelineSeriesForFocus,
} from '../src/domain/progress/timeline.ts'
import type {
  BodyObservation,
  CanonicalSetRecord,
  ProgressCanonicalInput,
  ProgressExerciseDefinition,
  ProgressRange,
} from '../src/domain/progress/index.ts'

const CABLE_ID = '11111111-1111-4111-8111-111111111111'
const FARMER_ID = '22222222-2222-4222-8222-222222222222'
const SQUAT_ID = '44444444-4444-4444-8444-444444444444'

function cable(): ProgressExerciseDefinition {
  return {
    id: CABLE_ID,
    name: 'Cable Row',
    externalId: 'EX05',
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  }
}

function farmer(): ProgressExerciseDefinition {
  return {
    id: FARMER_ID,
    name: 'Farmer Carry',
    externalId: 'EX07',
    performanceType: 'timed',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'duration',
    unilateral: false,
  }
}

function squat(): ProgressExerciseDefinition {
  return {
    id: SQUAT_ID,
    name: 'Box Squat',
    externalId: 'EX01',
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
  }
}

function setRecord(
  partial: Partial<CanonicalSetRecord> & Pick<CanonicalSetRecord, 'setId' | 'sessionId' | 'sessionDate'>,
): CanonicalSetRecord {
  return {
    sessionExerciseId: `${partial.sessionId}-ex`,
    exerciseId: CABLE_ID,
    sessionCreatedAt: `${partial.sessionDate}T12:00:00.000Z`,
    sessionExercisePosition: 1,
    setNumber: 1,
    setType: 'working',
    loadState: 'external',
    weightKg: 20,
    reps: 8,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    ...partial,
  }
}

function observation(
  partial: Omit<BodyObservation, 'valueKind'> & { valueKind?: BodyObservation['valueKind'] },
): BodyObservation {
  return {
    valueKind: 'measured',
    ...partial,
  }
}

function timelineInput(range: ProgressRange = 'all'): ProgressCanonicalInput {
  return {
    asOf: '2026-09-21',
    range,
    exercises: [cable(), farmer(), squat()],
    workouts: [
      {
        sessionId: 'w1',
        sessionDate: '2026-09-20',
        createdAt: '2026-09-20T19:00:00.000Z',
        templateName: 'Full Body A',
        effort: 3,
        durationMin: 55,
      },
      {
        sessionId: 'w2',
        sessionDate: '2026-09-20',
        createdAt: '2026-09-20T23:00:00.000Z',
        templateName: 'Full Body C',
        effort: 4,
        durationMin: 48,
      },
      {
        sessionId: 'w3',
        sessionDate: '2026-09-21',
        createdAt: '2026-09-21T18:00:00.000Z',
        templateName: 'Full Body B',
        effort: 1,
        durationMin: 50,
      },
    ],
    sets: [
      setRecord({
        setId: 'squat-1',
        sessionId: 'w1',
        sessionDate: '2026-09-20',
        exerciseId: SQUAT_ID,
        sessionExerciseId: 'w1-squat',
        weightKg: 125,
        reps: 10,
      }),
      setRecord({
        setId: 'cable-base',
        sessionId: 'w1',
        sessionDate: '2026-09-20',
        exerciseId: CABLE_ID,
        sessionExerciseId: 'w1-cable',
        weightKg: 20,
        reps: 8,
      }),
      setRecord({
        setId: 'farmer-base',
        sessionId: 'w1',
        sessionDate: '2026-09-20',
        exerciseId: FARMER_ID,
        sessionExerciseId: 'w1-farmer',
        weightKg: 18.14,
        reps: null,
        durationSec: 45,
      }),
      setRecord({
        setId: 'farmer-pr',
        sessionId: 'w2',
        sessionDate: '2026-09-20',
        exerciseId: FARMER_ID,
        sessionExerciseId: 'w2-farmer',
        weightKg: 22.68,
        reps: null,
        durationSec: 45,
      }),
      setRecord({
        setId: 'cable-pr',
        sessionId: 'w3',
        sessionDate: '2026-09-21',
        exerciseId: CABLE_ID,
        sessionExerciseId: 'w3-cable',
        weightKg: 26.76,
        reps: 9,
      }),
    ],
    bodyObservations: [
      observation({
        measurementId: 'm-weight',
        measurementSessionId: 'ms1',
        key: 'weight',
        value: 86.64,
        unit: 'kg',
        measuredAt: '2026-09-21T16:16:00.000Z',
        timezone: 'America/Los_Angeles',
        calendarDate: '2026-09-21',
      }),
      observation({
        measurementId: 'm-bmi',
        measurementSessionId: 'ms1',
        key: 'bmi',
        value: 27.3,
        unit: 'index',
        measuredAt: '2026-09-21T16:16:00.000Z',
        timezone: 'America/Los_Angeles',
        calendarDate: '2026-09-21',
      }),
    ],
  }
}

describe('progress timeline domain', () => {
  it('reuses the same trailing period as Overview', () => {
    for (const range of ['30d', '90d', '6m', '1y', 'all'] as const) {
      const input = timelineInput(range)
      expect(buildProgressTimeline(input).period).toEqual(buildProgressOverview(input).period)
    }
  })

  it('emits canonical workouts, body sessions, and genuine PRs without period-level findings', () => {
    const input = timelineInput('30d')
    const overview = buildProgressOverview(input)
    expect(overview.findings.some((finding) => finding.kind === 'training_frequency_change')).toBe(true)

    const timeline = buildProgressTimeline(input)
    const kinds = timeline.events.map((event) => event.kind)
    expect(kinds.filter((kind) => kind === 'training_session')).toHaveLength(3)
    expect(kinds.filter((kind) => kind === 'performance_best')).toHaveLength(2)
    expect(kinds.filter((kind) => kind === 'body_measurement')).toHaveLength(1)
    expect(timeline.events.some((event) => event.kind === 'training_session' && event.title === 'Full Body A')).toBe(
      true,
    )
    expect(timeline.events.some((event) => event.kind === 'training_session' && event.title === 'Full Body C')).toBe(
      true,
    )
    expect(JSON.stringify(timeline.events)).not.toContain('training_frequency_change')
    expect(JSON.stringify(timeline.events)).not.toContain('Workout frequency')
    expect(timeline.events.some((event) => event.kind === 'body_weight_trend' as never)).toBe(false)
  })

  it('keeps two workouts on the same calendar date as distinct events', () => {
    const timeline = buildProgressTimeline(timelineInput())
    const sep20 = timeline.events.filter(
      (event) => event.kind === 'training_session' && event.date === '2026-09-20',
    )
    expect(sep20.map((event) => event.id)).toEqual(['training_session:w1', 'training_session:w2'])
    expect(timeline.series.workouts.filter((item) => item.date === '2026-09-20')).toHaveLength(2)
  })

  it('associates performance bests with their source workouts and ignores baseline first appearances', () => {
    const timeline = buildProgressTimeline(timelineInput())
    const cable = timeline.events.find(
      (event) => event.kind === 'performance_best' && event.data.exerciseName === 'Cable Row',
    )
    const farmerBest = timeline.events.find(
      (event) => event.kind === 'performance_best' && event.data.exerciseName === 'Farmer Carry',
    )
    const fullBodyB = timeline.events.find((event) => event.id === 'training_session:w3')
    const fullBodyC = timeline.events.find((event) => event.id === 'training_session:w2')
    expect(cable?.data.sessionId).toBe('w3')
    expect(farmerBest?.data.sessionId).toBe('w2')
    expect(fullBodyB && fullBodyB.kind === 'training_session' ? fullBodyB.data.performanceBestIds : []).toContain(
      cable?.id,
    )
    expect(fullBodyC && fullBodyC.kind === 'training_session' ? fullBodyC.data.performanceBestIds : []).toContain(
      farmerBest?.id,
    )
    expect(timeline.events.some((event) => event.kind === 'performance_best' && event.data.exerciseName === 'Box Squat')).toBe(
      false,
    )
  })

  it('does not invent workout timestamps and keeps missing body metrics missing', () => {
    const timeline = buildProgressTimeline(timelineInput())
    const workout = timeline.events.find((event) => event.kind === 'training_session')
    const body = timeline.events.find((event) => event.kind === 'body_measurement')
    expect(workout?.timePrecision).toBe('date')
    expect(workout?.occurredAt).toBeUndefined()
    expect(body?.timePrecision).toBe('timestamp')
    expect(body?.occurredAt).toBe('2026-09-21T16:16:00.000Z')
    expect(body && body.kind === 'body_measurement' ? body.data.partial : false).toBe(true)
    expect(body && body.kind === 'body_measurement' ? body.data.metrics.map((item) => item.key) : []).toEqual([
      'weight',
      'bmi',
    ])
    expect(body && body.kind === 'body_measurement' ? body.data.metrics.some((item) => item.value === 0) : true).toBe(
      false,
    )
  })

  it('orders events deterministically with newest calendar days first', () => {
    const timeline = buildProgressTimeline(timelineInput())
    const dates = timeline.events.map((event) => event.date)
    expect(dates).toEqual([...dates].sort((left, right) => (left < right ? 1 : left > right ? -1 : 0)))
    const days = groupedTimelineDays(timelineEventsForFocus(timeline, 'all'))
    expect(days.map((day) => day.date)).toEqual(['2026-09-21', '2026-09-20'])
    const allFeed = timelineEventsForFocus(timeline, 'all')
    expect(allFeed.filter((event) => event.kind === 'performance_best')).toEqual([])
    expect(allFeed.map((event) => event.kind)).toEqual(['body_measurement', 'training_session', 'training_session', 'training_session'])
  })

  it('filters series and feed together without changing the period', () => {
    const timeline = buildProgressTimeline(timelineInput('90d'))
    const period = timeline.period
    expect(timelineEventsForFocus(timeline, 'training').every((event) => event.kind === 'training_session')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'body').every((event) => event.kind === 'body_measurement')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'bests').every((event) => event.kind === 'performance_best')).toBe(true)
    expect(timelineSeriesForFocus(timeline, 'body').workouts).toEqual([])
    expect(timelineSeriesForFocus(timeline, 'training').bodyWeight).toEqual([])
    expect(timelineSeriesForFocus(timeline, 'bests').performanceBests).toHaveLength(2)
    expect(buildProgressTimeline(timelineInput('90d')).period).toEqual(period)
  })
})
