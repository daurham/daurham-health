import { describe, expect, it } from 'vitest'
import { checkpointCreateSchema, checkpointPatchSchema } from '../src/domain/progress/checkpoints.ts'
import {
  buildProgressCompare,
  buildSinceCheckpointCompare,
  comparePeriod,
  latestExerciseAppearanceOnOrBefore,
  nearestBodyObservationWithinDays,
} from '../src/domain/progress/compare.ts'
import { buildProgressTimeline, timelineEventsForFocus } from '../src/domain/progress/timeline.ts'
import { DELETE_CHECKPOINT_SQL, INSERT_CHECKPOINT_SQL, UPDATE_CHECKPOINT_SQL } from '../server/progress/queries.ts'
import { parseCompareQuery } from '../server/progress/service.ts'
import type {
  BodyObservation,
  CanonicalSetRecord,
  ProgressCanonicalInput,
  ProgressExerciseDefinition,
} from '../src/domain/progress/index.ts'

const CABLE_ID = '11111111-1111-4111-8111-111111111111'
const FARMER_ID = '22222222-2222-4222-8222-222222222222'

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

function weight(id: string, date: string, kg: number, measuredAt = `${date}T16:00:00.000Z`): BodyObservation {
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

function canonical(): ProgressCanonicalInput {
  return {
    asOf: '2026-09-21',
    range: 'all',
    exercises: [cable(), farmer()],
    workouts: [
      { sessionId: 'w1', sessionDate: '2026-06-10', createdAt: '2026-06-10T18:00:00.000Z', templateName: 'A' },
      { sessionId: 'w2', sessionDate: '2026-09-20', createdAt: '2026-09-20T18:00:00.000Z', templateName: 'C' },
      { sessionId: 'w3', sessionDate: '2026-09-21', createdAt: '2026-09-21T18:00:00.000Z', templateName: 'B' },
    ],
    sets: [
      setRecord({ setId: 'c1', sessionId: 'w1', sessionDate: '2026-06-10', weightKg: 20, reps: 8 }),
      setRecord({
        setId: 'f1',
        sessionId: 'w1',
        sessionDate: '2026-06-10',
        exerciseId: FARMER_ID,
        sessionExerciseId: 'w1-farmer',
        weightKg: 18.14,
        reps: null,
        durationSec: 45,
      }),
      setRecord({
        setId: 'f2',
        sessionId: 'w2',
        sessionDate: '2026-09-20',
        exerciseId: FARMER_ID,
        sessionExerciseId: 'w2-farmer',
        weightKg: 22.68,
        reps: null,
        durationSec: 45,
      }),
      setRecord({ setId: 'c2', sessionId: 'w3', sessionDate: '2026-09-21', weightKg: 26.76, reps: 9 }),
    ],
    bodyObservations: [weight('jun', '2026-06-12', 88), weight('sep', '2026-09-21', 86.64)],
  }
}

describe('checkpoint validation', () => {
  it('rejects blank labels and invalid dates', () => {
    expect(checkpointCreateSchema.safeParse({ checkpointDate: '2026-09-20', label: '   ' }).success).toBe(false)
    expect(checkpointCreateSchema.safeParse({ checkpointDate: '09-20-2026', label: 'Started cut' }).success).toBe(false)
    expect(checkpointCreateSchema.safeParse({ checkpointDate: '2026-09-20', label: 'Started cut' }).success).toBe(true)
    expect(checkpointPatchSchema.safeParse({}).success).toBe(false)
  })

  it('deletes only the checkpoint row SQL', () => {
    expect(DELETE_CHECKPOINT_SQL).toContain('DELETE FROM progress_checkpoints')
    expect(DELETE_CHECKPOINT_SQL).not.toContain('workout_sessions')
    expect(DELETE_CHECKPOINT_SQL).not.toContain('body_metrics')
    expect(INSERT_CHECKPOINT_SQL).toContain('INSERT INTO progress_checkpoints')
    expect(UPDATE_CHECKPOINT_SQL).toContain('UPDATE progress_checkpoints')
  })
})

describe('compare periods', () => {
  it('parses inclusive ranges and rejects inverted or invalid dates', () => {
    expect(comparePeriod('2026-06-01', '2026-06-30')).toEqual({
      start: '2026-06-01',
      end: '2026-06-30',
      dayCount: 30,
    })
    expect(() => comparePeriod('2026-06-30', '2026-06-01')).toThrow(/on or before/)
    expect(() => parseCompareQuery({
      startA: 'bad',
      endA: '2026-06-30',
      startB: '2026-09-01',
      endB: '2026-09-30',
      checkpointId: null,
      asOf: null,
    })).toThrow(/startA/)
  })

  it('supports unequal durations and normalizes workouts/week', () => {
    const result = buildProgressCompare({
      canonical: canonical(),
      periodA: comparePeriod('2026-06-01', '2026-06-30'),
      periodB: comparePeriod('2026-09-01', '2026-09-21'),
    })
    expect(result.periodA.dayCount).toBe(30)
    expect(result.periodB.dayCount).toBe(21)
    expect(result.training.workoutCount.a.status).toBe('available')
    expect(result.training.workoutCount.a.status === 'available' && result.training.workoutCount.a.value.value).toBe(1)
    expect(result.training.workoutCount.b.status === 'available' && result.training.workoutCount.b.value.value).toBe(2)
    expect(result.training.workoutsPerWeek.a.status === 'available' && result.training.workoutsPerWeek.a.value.value).toBeCloseTo(7 / 30, 8)
    expect(result.training.workoutsPerWeek.b.status === 'available' && result.training.workoutsPerWeek.b.value.value).toBeCloseTo(14 / 21, 8)
  })

  it('keeps raw workout counts for windows shorter than 7 days and treats workouts/week as unavailable', () => {
    const short = buildProgressCompare({
      canonical: canonical(),
      periodA: comparePeriod('2026-09-20', '2026-09-20'),
      periodB: comparePeriod('2026-09-21', '2026-09-21'),
    })
    expect(short.training.workoutCount.a.status === 'available' && short.training.workoutCount.a.value.value).toBe(1)
    expect(short.training.workoutCount.b.status === 'available' && short.training.workoutCount.b.value.value).toBe(1)
    expect(short.training.workoutsPerWeek.a.status).toBe('insufficient_data')
    expect(short.training.workoutsPerWeek.b.status).toBe('insufficient_data')
    expect(short.training.workoutsPerWeek.a).toMatchObject({ status: 'insufficient_data', required: 7, observations: 1 })
    expect(short.findings.some((finding) => finding.kind === 'training_frequency_change')).toBe(false)

    const mixed = buildProgressCompare({
      canonical: canonical(),
      periodA: comparePeriod('2026-06-01', '2026-06-30'),
      periodB: comparePeriod('2026-09-21', '2026-09-21'),
    })
    expect(mixed.training.workoutsPerWeek.a.status).toBe('available')
    expect(mixed.training.workoutsPerWeek.b.status).toBe('insufficient_data')
    expect(mixed.findings.some((finding) => finding.kind === 'training_frequency_change')).toBe(false)

    const week = buildProgressCompare({
      canonical: canonical(),
      periodA: comparePeriod('2026-09-15', '2026-09-21'),
      periodB: comparePeriod('2026-06-08', '2026-06-14'),
    })
    expect(week.periodA.dayCount).toBe(7)
    expect(week.training.workoutsPerWeek.a.status).toBe('available')
    expect(week.training.workoutsPerWeek.b.status).toBe('available')
  })

  it('keeps missing body data unavailable and preserves actual performed work', () => {
    const emptyBody = { ...canonical(), bodyObservations: [] }
    const result = buildProgressCompare({
      canonical: emptyBody,
      periodA: comparePeriod('2026-06-01', '2026-06-30'),
      periodB: comparePeriod('2026-09-01', '2026-09-21'),
    })
    expect(result.body.weight.aEnd).toBeNull()
    expect(result.body.weight.change.status).not.toBe('available')
    const row = result.exercises.find((item) => item.name === 'Cable Row')
    expect(row?.a.bestPerformed).toEqual(expect.objectContaining({ loadKg: 20, reps: 8 }))
    expect(row?.b.bestPerformed).toEqual(expect.objectContaining({ loadKg: 26.76, reps: 9 }))
    expect(row?.estimatedStrengthChangePercent).not.toBeNull()
    const timed = result.exercises.find((item) => item.name === 'Farmer Carry')
    expect(timed?.a.estimatedStrengthKg).toBeNull()
    expect(timed?.b.estimatedStrengthKg).toBeNull()
    expect(timed?.timedChange).toBe('heavier_equal_duration')
    expect(timed?.evidence.length).toBeGreaterThan(0)
  })

  it('treats a period with no workouts as a real zero, not missing volume-as-zero for empty analyzable work', () => {
    const result = buildProgressCompare({
      canonical: canonical(),
      periodA: comparePeriod('2026-01-01', '2026-01-31'),
      periodB: comparePeriod('2026-09-01', '2026-09-21'),
    })
    expect(result.training.workoutCount.a.status === 'available' && result.training.workoutCount.a.value.value).toBe(0)
    expect(result.training.externalVolumeKg.a.status).toBe('insufficient_data')
  })
})

describe('since checkpoint', () => {
  const checkpoint = {
    id: 'cp1',
    checkpointDate: '2026-06-14',
    label: 'Started current program',
    notes: null,
    createdAt: '2026-06-14T00:00:00.000Z',
    updatedAt: '2026-06-14T00:00:00.000Z',
  }

  it('uses nearest body measurement within ±3 days and prefers the earlier tie', () => {
    const observations = [
      weight('early', '2026-06-12', 88, '2026-06-12T08:00:00.000Z'),
      weight('same', '2026-06-12', 87.9, '2026-06-12T18:00:00.000Z'),
      weight('late', '2026-06-16', 87.5),
      weight('far', '2026-05-01', 90),
    ]
    const nearest = nearestBodyObservationWithinDays(observations, 'weight', '2026-06-14', 3)
    expect(nearest?.measurementId).toBe('early')
    expect(nearestBodyObservationWithinDays(observations, 'weight', '2026-09-21', 3)).toBeNull()
  })

  it('uses the latest exercise appearance on or before the checkpoint within 14 days', () => {
    const appearance = latestExerciseAppearanceOnOrBefore(canonical().sets, cable(), '2026-06-14', 14)
    expect(appearance?.[0]?.sessionDate).toBe('2026-06-10')
    expect(latestExerciseAppearanceOnOrBefore(canonical().sets, cable(), '2026-09-01', 14)).toBeNull()
  })

  it('compares checkpoint baseline to current evidence without interpolating', () => {
    const result = buildSinceCheckpointCompare({
      canonical: canonical(),
      checkpoint,
      asOf: '2026-09-21',
    })
    expect(result.mode).toBe('since_checkpoint')
    expect(result.body.weight.aStart?.calendarDate).toBe('2026-06-12')
    expect(result.body.weight.bEnd?.calendarDate).toBe('2026-09-21')
    expect(result.body.weight.change.status).toBe('available')
    expect(result.training.workoutCount.a.status).toBe('not_applicable')
    expect(result.training.workoutCount.b.status === 'available' && result.training.workoutCount.b.value.value).toBe(2)
    expect(result.training.workoutsPerWeek.a.status).toBe('not_applicable')
    expect(result.training.workoutsPerWeek.b.status).toBe('available')
    const cableRow = result.exercises.find((item) => item.name === 'Cable Row')
    expect(cableRow?.a.bestPerformed?.date).toBe('2026-06-10')
    expect(cableRow?.b.bestPerformed?.date).toBe('2026-09-21')
    expect(cableRow?.evidence).toHaveLength(2)
    const farmerCarry = result.exercises.find((item) => item.name === 'Farmer Carry')
    expect(farmerCarry?.timedChange).toBe('heavier_equal_duration')
  })

  it('leaves exercise baseline unavailable when the latest appearance is older than the 14-day lookback', () => {
    const result = buildSinceCheckpointCompare({
      canonical: canonical(),
      checkpoint: { ...checkpoint, checkpointDate: '2026-09-01' },
      asOf: '2026-09-21',
    })
    const cableRow = result.exercises.find((item) => item.name === 'Cable Row')
    expect(cableRow?.a.bestPerformed).toBeNull()
    expect(cableRow?.b.bestPerformed?.date).toBe('2026-09-21')
    expect(cableRow?.estimatedStrengthChangePercent).toBeNull()
  })

  it('does not reuse the same appearance as both baseline and current', () => {
    const result = buildSinceCheckpointCompare({
      canonical: canonical(),
      checkpoint: { ...checkpoint, checkpointDate: '2026-09-21' },
      asOf: '2026-09-21',
    })
    const cableRow = result.exercises.find((item) => item.name === 'Cable Row')
    expect(cableRow?.a.bestPerformed?.date).toBe('2026-09-21')
    expect(cableRow?.b.bestPerformed).toBeNull()
    expect(cableRow?.estimatedStrengthChangePercent).toBeNull()
    expect(result.training.workoutCount.b.status === 'available' && result.training.workoutCount.b.value.value).toBe(1)
    expect(result.training.workoutsPerWeek.b.status).toBe('insufficient_data')
    expect(result.findings.some((finding) => finding.kind === 'training_frequency_change')).toBe(false)
  })
})

describe('timeline checkpoints', () => {
  it('renders checkpoints as date-only annotation events, not health-domain records', () => {
    const timeline = buildProgressTimeline({
      ...canonical(),
      asOf: '2026-09-21',
      range: 'all',
      checkpoints: [
        {
          id: 'cp1',
          checkpointDate: '2026-09-20',
          label: 'Started cut',
          notes: null,
          createdAt: '2026-09-20T00:00:00.000Z',
          updatedAt: '2026-09-20T00:00:00.000Z',
        },
      ],
    })
    const event = timeline.events.find((item) => item.kind === 'checkpoint')
    expect(event?.domain).toBe('annotation')
    expect(event?.timePrecision).toBe('date')
    expect(event?.occurredAt).toBeUndefined()
    expect(event?.title).toBe('Started cut')
    expect(timeline.series.checkpoints).toHaveLength(1)
    expect(timelineEventsForFocus(timeline, 'all').some((item) => item.kind === 'checkpoint')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'training').some((item) => item.kind === 'checkpoint')).toBe(false)
  })
})
