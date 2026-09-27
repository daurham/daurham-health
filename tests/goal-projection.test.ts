import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { bodyGoalSeries, parseProjectionAsOf, projectGoal, projectionHorizonDays, strengthGoalSeries, type GoalProjection } from '../src/domain/goal-projection.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { linearPercentile, median, pairwiseSlopesPerDay } from '../src/domain/progress/statistics.ts'
import type { BodyObservation, CanonicalSetRecord, ProgressExerciseDefinition } from '../src/domain/progress/types.ts'
import { centimetersToInches, kilogramsToPounds } from '../src/domain/units.ts'
import type { GoalKind, GoalTarget } from '../src/domain/goals.ts'

const AS_OF = '2026-09-10'
const GOAL = '11111111-1111-4111-8111-111111111111'
const VERSION = '22222222-2222-4222-8222-222222222222'

function target(partial: Partial<GoalTarget> & Pick<GoalTarget, 'targetMode'>): GoalTarget {
  return {
    targetMin: null,
    targetMax: null,
    targetUnit: 'lb',
    targetDate: null,
    evaluationWindowDays: null,
    notes: null,
    ...partial,
  }
}

function project(partial: {
  goalKind?: GoalKind
  status?: 'active' | 'paused' | 'completed'
  goalVersionId?: string
  target: GoalTarget
  current: { value: number; observedOn: string } | null
  series: Array<{ date: string; value: number }>
  asOf?: string
}): GoalProjection {
  return projectGoal({
    goalId: GOAL,
    goalVersionId: partial.goalVersionId ?? VERSION,
    status: partial.status ?? 'active',
    goalKind: partial.goalKind ?? 'body_metric',
    target: partial.target,
    asOf: partial.asOf ?? AS_OF,
    current: partial.current,
    series: partial.series,
  })
}

function linearSeries(asOf: string, count: number, spanDays: number, endValue: number, slopePerDay: number): Array<{ date: string; value: number }> {
  const points = []
  for (let index = 0; index < count; index += 1) {
    const day = count === 1 ? 0 : Math.round((spanDays * index) / (count - 1))
    const date = addCalendarDays(asOf, day - spanDays)
    points.push({ date, value: endValue - slopePerDay * (spanDays - day) })
  }
  return points
}

function bodyObservation(id: string, key: string, date: string, value: number, unit: string, measuredAt: string): BodyObservation {
  return {
    measurementId: id,
    measurementSessionId: `${id}-session`,
    key,
    value,
    unit,
    valueKind: 'measured',
    measuredAt,
    timezone: 'America/Phoenix',
    calendarDate: date,
  }
}

function exercise(partial?: Partial<ProgressExerciseDefinition>): ProgressExerciseDefinition {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'Bench Press',
    externalId: 'EX02',
    performanceType: 'loaded_reps',
    analyticsLoadType: 'external',
    analyticsRepMode: 'standard',
    measurementKind: 'reps',
    unilateral: false,
    ...partial,
  }
}

function setRecord(partial: Partial<CanonicalSetRecord> & Pick<CanonicalSetRecord, 'setId' | 'sessionId' | 'sessionDate'>): CanonicalSetRecord {
  return {
    sessionExerciseId: `${partial.sessionId}-ex`,
    exerciseId: exercise().id,
    sessionCreatedAt: `${partial.sessionDate}T15:00:00.000Z`,
    sessionExercisePosition: 1,
    setNumber: 1,
    setType: 'working',
    loadState: 'external',
    weightKg: 100,
    reps: 5,
    durationSec: null,
    leftReps: null,
    rightReps: null,
    leftDurationSec: null,
    rightDurationSec: null,
    ...partial,
  }
}

describe('Theil-Sen slope dispersion', () => {
  it('uses the median pairwise slope and type-7 quartiles', () => {
    const points = [
      { day: 0, value: 0 },
      { day: 10, value: 10 },
      { day: 20, value: 20 },
      { day: 30, value: 40 },
      { day: 40, value: 40 },
    ]
    const slopes = pairwiseSlopesPerDay(points)
    expect(slopes).toHaveLength(10)
    expect(median(slopes)).toBe(1)
    expect(linearPercentile(slopes, 0.25)).toBe(1)
    expect(linearPercentile(slopes, 0.75)).toBe(1.25)
    expect(linearPercentile(slopes, 0.5)).toBe(median(slopes))
  })

  it('resists an outlier, keeps sign, and skips same-day pairs', () => {
    const steady = [
      { day: 0, value: 0 },
      { day: 10, value: 10 },
      { day: 20, value: 20 },
      { day: 30, value: 30 },
      { day: 40, value: 40 },
    ]
    const spiked = [...steady.slice(0, 4), { day: 40, value: 400 }]
    expect(median(pairwiseSlopesPerDay(steady))).toBe(1)
    expect(median(pairwiseSlopesPerDay(spiked))).toBe(1)
    const negative = steady.map((point) => ({ day: point.day, value: -point.value }))
    expect(median(pairwiseSlopesPerDay(negative))).toBe(-1)
    const fractional = [
      { day: 0, value: 1.5 },
      { day: 2, value: 2.25 },
      { day: 4, value: 3 },
    ]
    expect(median(pairwiseSlopesPerDay(fractional))).toBeCloseTo(0.375)
    expect(pairwiseSlopesPerDay([
      { day: 3, value: 10 },
      { day: 3, value: 80 },
      { day: 5, value: 12 },
    ])).toEqual([1, -34])
  })
})

describe('projection horizon', () => {
  it('floors at 90 days, scales by four, and caps at 365', () => {
    expect(projectionHorizonDays(14)).toBe(90)
    expect(projectionHorizonDays(49)).toBe(196)
    expect(projectionHorizonDays(120)).toBe(365)
    expect(projectionHorizonDays(200)).toBe(365)
  })
})

describe('body goal projection', () => {
  it('requires five measurements spanning 14 days', () => {
    const four = linearSeries(AS_OF, 4, 56, 190, -0.1)
    expect(project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: { value: 190, observedOn: AS_OF }, series: four }).state).toBe('insufficient_data')
    const short = linearSeries(AS_OF, 5, 13, 190, -0.1)
    expect(project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: { value: 190, observedOn: AS_OF }, series: short }).reason).toBe('insufficient_span')
    const ready = linearSeries(AS_OF, 5, 14, 190, -0.1)
    const result = project({ target: target({ targetMode: 'at_most', targetMax: 189 }), current: { value: 190, observedOn: AS_OF }, series: ready })
    expect(result.state).toBe('available')
    expect(result.sampleCount).toBe(5)
    expect(result.spanDays).toBe(14)
  })

  it('projects stored body units in the goal unit', () => {
    const dates = linearSeries(AS_OF, 5, 56, 0, 0).map((point) => point.date)
    const kilograms = [90, 89.3, 88.6, 87.9, 87.2]
    const observations = kilograms.map((value, index) => bodyObservation(`m${index}`, 'weight', dates[index]!, value, 'kg', `${dates[index]}T15:00:00.000Z`))
    observations.push(bodyObservation('same-day', 'weight', dates[4]!, 87.2, 'kg', `${dates[4]}T16:00:00.000Z`))
    observations.push(bodyObservation('waist', 'waist_circumference', dates[4]!, 90, 'cm', `${dates[4]}T16:00:00.000Z`))
    const series = bodyGoalSeries(observations, 'weight', 'lb', AS_OF)
    expect(series.series).toHaveLength(5)
    const result = project({
      target: target({ targetMode: 'at_most', targetMax: kilogramsToPounds(80) }),
      current: series.current,
      series: series.series,
    })
    expect(result.trendPerDay).toBeCloseTo(kilogramsToPounds(-0.05))
    const centimeters = kilograms.map((_, index) => bodyObservation(`c${index}`, 'waist_circumference', dates[index]!, 100 - index, 'cm', `${dates[index]}T15:00:00.000Z`))
    const waist = bodyGoalSeries(centimeters, 'waist_circumference', 'in', AS_OF)
    const waistResult = project({
      target: target({ targetMode: 'at_most', targetMax: 30, targetUnit: 'in' }),
      current: waist.current,
      series: waist.series,
    })
    expect(waistResult.trendPerDay).toBeCloseTo(centimetersToInches(-1 / 14))
    const fat = kilograms.map((_, index) => bodyObservation(`f${index}`, 'body_fat_percentage', dates[index]!, 30 - index, 'percent', `${dates[index]}T15:00:00.000Z`))
    const fatSeries = bodyGoalSeries(fat, 'body_fat_percentage', '%', AS_OF)
    expect(fatSeries.current?.value).toBe(26)
  })

  it('projects only when the robust slope moves toward the chosen boundary', () => {
    const down = linearSeries(AS_OF, 5, 56, 192, -1 / 7)
    const up = linearSeries(AS_OF, 5, 56, 160, 1 / 7)
    expect(project({ target: target({ targetMode: 'at_least', targetMin: 170 }), current: { value: 160, observedOn: AS_OF }, series: up }).state).toBe('available')
    expect(project({ target: target({ targetMode: 'at_least', targetMin: 200 }), current: { value: 192, observedOn: AS_OF }, series: down }).state).toBe('trend_not_toward_target')
    expect(project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: { value: 192, observedOn: AS_OF }, series: down }).state).toBe('available')
    expect(project({ target: target({ targetMode: 'at_most', targetMax: 150 }), current: { value: 160, observedOn: AS_OF }, series: up }).state).toBe('trend_not_toward_target')
    expect(project({ target: target({ targetMode: 'range', targetMin: 175, targetMax: 180 }), current: { value: 160, observedOn: AS_OF }, series: up }).state).toBe('available')
    expect(project({ target: target({ targetMode: 'range', targetMin: 175, targetMax: 180 }), current: { value: 160, observedOn: AS_OF }, series: down }).state).toBe('trend_not_toward_target')
    expect(project({ target: target({ targetMode: 'range', targetMin: 175, targetMax: 180 }), current: { value: 192, observedOn: AS_OF }, series: down }).state).toBe('available')
    expect(project({ target: target({ targetMode: 'range', targetMin: 175, targetMax: 180 }), current: { value: 192, observedOn: AS_OF }, series: up }).state).toBe('trend_not_toward_target')
  })

  it('reports a satisfied target without an ETA', () => {
    const series = linearSeries(AS_OF, 5, 56, 180, -0.1)
    const cases = [
      target({ targetMode: 'at_least', targetMin: 180 }),
      target({ targetMode: 'at_least', targetMin: 170 }),
      target({ targetMode: 'at_most', targetMax: 180 }),
      target({ targetMode: 'at_most', targetMax: 190 }),
      target({ targetMode: 'range', targetMin: 180, targetMax: 185 }),
      target({ targetMode: 'range', targetMin: 175, targetMax: 185 }),
      target({ targetMode: 'range', targetMin: 170, targetMax: 180 }),
    ]
    for (const item of cases) {
      const result = project({ target: item, current: { value: 180, observedOn: AS_OF }, series })
      expect(result.state).toBe('target_currently_satisfied')
      expect(result.estimatedCrossingDate).toBeNull()
      expect(result).not.toHaveProperty('status')
    }
  })

  it('withholds an ETA when slope dispersion is not entirely toward the target', () => {
    const series = [
      { date: '2026-07-16', value: 200 },
      { date: '2026-07-30', value: 190 },
      { date: '2026-08-13', value: 185 },
      { date: '2026-08-27', value: 180 },
      { date: '2026-09-10', value: 200 },
    ]
    const result = project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: { value: 200, observedOn: AS_OF }, series })
    expect(result.trendPerDay).toBeLessThan(0)
    expect(result.trendUpperPerDay).toBeGreaterThan(0)
    expect(result.state).toBe('unstable_trend')
    expect(result.estimatedCrossingDate).toBeNull()
  })

  it('maps current, boundary, and the three slopes onto sorted dates', () => {
    const series = [
      { date: '2026-08-01', value: 0 },
      { date: '2026-08-11', value: 10 },
      { date: '2026-08-21', value: 20 },
      { date: '2026-08-31', value: 40 },
      { date: '2026-09-10', value: 40 },
    ]
    const result = project({ target: target({ targetMode: 'at_least', targetMin: 50 }), current: { value: 40, observedOn: AS_OF }, series })
    expect(result.trendPerDay).toBe(1)
    expect(result.trendLowerPerDay).toBe(1)
    expect(result.trendUpperPerDay).toBe(1.25)
    expect(result.estimatedCrossingDate).toBe('2026-09-20')
    expect(result.estimatedWindowStart).toBe('2026-09-18')
    expect(result.estimatedWindowEnd).toBe('2026-09-20')
    expect(result.calculationVersion).toBe('goal-projection-v1')
    expect((50 - 40) / result.trendPerDay!).toBe(10)
    expect((50 - 40) / result.trendUpperPerDay!).toBe(8)
  })

  it('stops at the evidence horizon and does not use a rounded weekly slope', () => {
    const series = linearSeries(AS_OF, 8, 49, 199.51, -0.01)
    const result = project({ target: target({ targetMode: 'at_most', targetMax: 197 }), current: { value: 199.51, observedOn: AS_OF }, series })
    expect(result.spanDays).toBe(49)
    expect(result.state).toBe('beyond_projection_horizon')
    expect(result.maxProjectionDate).toBe(addCalendarDays(AS_OF, 196))
    expect(result.estimatedCrossingDate).toBeNull()
    const near = project({ target: target({ targetMode: 'at_most', targetMax: 198 }), current: { value: 199.51, observedOn: AS_OF }, series })
    expect(near.state).toBe('available')
    expect(near.trendPerDay).toBeCloseTo(-0.01)
    expect(near.estimatedCrossingDate).toBe(addCalendarDays(AS_OF, Math.ceil((198 - 199.51) / near.trendPerDay!)))
  })

  it('uses only the trailing 90 days and the current canonical value', () => {
    const old = { date: '2026-01-01', value: 300 }
    const recent = linearSeries(AS_OF, 5, 56, 192, -1 / 7)
    const result = project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: { value: 192, observedOn: AS_OF }, series: [old, ...recent] })
    expect(result.sampleCount).toBe(5)
    expect(result.currentValue).toBe(192)
    expect(result.firstObservationDate).not.toBe('2026-01-01')
  })
})

describe('strength goal projection', () => {
  it('requires six appearances spanning 28 days', () => {
    const five = linearSeries(AS_OF, 5, 40, 200, 0.2)
    expect(project({ goalKind: 'strength_e1rm', target: target({ targetMode: 'at_least', targetMin: 225 }), current: { value: 200, observedOn: AS_OF }, series: five }).reason).toBe('insufficient_sample')
    const brief = linearSeries(AS_OF, 6, 20, 200, 0.2)
    expect(project({ goalKind: 'strength_e1rm', target: target({ targetMode: 'at_least', targetMin: 225 }), current: { value: 200, observedOn: AS_OF }, series: brief }).reason).toBe('insufficient_span')
    const ready = linearSeries(AS_OF, 6, 28, 200, 0.5)
    expect(project({ goalKind: 'strength_e1rm', target: target({ targetMode: 'at_least', targetMin: 210 }), current: { value: 200, observedOn: AS_OF }, series: ready }).state).toBe('available')
  })

  it('keeps one comparable appearance and the existing e1RM exclusions', () => {
    const bench = exercise()
    const sets = [1, 2, 3].map((setNumber) => setRecord({ setId: `set-${setNumber}`, sessionId: 'session-1', sessionDate: '2026-09-01', setNumber, reps: 5, weightKg: 90 + setNumber }))
    const series = strengthGoalSeries(sets, bench, AS_OF)
    expect(series.series).toHaveLength(1)
    expect(series.current?.value).toBeCloseTo(kilogramsToPounds(93 * (1 + 5 / 30)))
    const heavyReps = strengthGoalSeries([setRecord({ setId: 'too-many', sessionId: 'session-2', sessionDate: '2026-09-02', reps: 16 })], bench, AS_OF)
    expect(heavyReps.series).toHaveLength(0)
    const lowConfidence = strengthGoalSeries([setRecord({ setId: 'fifteen', sessionId: 'session-3', sessionDate: '2026-09-03', reps: 15 })], bench, AS_OF)
    expect(lowConfidence.series).toHaveLength(0)
    const carry = strengthGoalSeries(
      [setRecord({ setId: 'carry', sessionId: 'session-4', sessionDate: '2026-09-04', reps: null, durationSec: 40 })],
      exercise({ performanceType: 'timed', measurementKind: 'duration' }),
      AS_OF,
    )
    expect(carry.series).toHaveLength(0)
    const unilateral = strengthGoalSeries(
      [setRecord({ setId: 'side', sessionId: 'session-5', sessionDate: '2026-09-05', reps: null, leftReps: 10, rightReps: 4, weightKg: 40 })],
      exercise({ analyticsRepMode: 'per_side' }),
      AS_OF,
    )
    expect(unilateral.current?.value).toBeCloseTo(kilogramsToPounds(40 * (1 + 4 / 30)))
  })

  it('does not project a declining e1RM toward a higher target', () => {
    const series = linearSeries(AS_OF, 6, 42, 205, -0.2)
    const result = project({ goalKind: 'strength_e1rm', target: target({ targetMode: 'at_least', targetMin: 225 }), current: { value: 205, observedOn: AS_OF }, series })
    expect(result.state).toBe('trend_not_toward_target')
    expect(result.estimatedCrossingDate).toBeNull()
  })

  it('caps a long strength span at 365 days', () => {
    const series = linearSeries(AS_OF, 6, 180, 200, 0.01)
    const result = project({ goalKind: 'strength_e1rm', target: target({ targetMode: 'at_least', targetMin: 210 }), current: { value: 200, observedOn: AS_OF }, series })
    expect(result.spanDays).toBe(180)
    expect(result.state).toBe('beyond_projection_horizon')
    expect(result.maxProjectionDate).toBe(addCalendarDays(AS_OF, 365))
  })
})

describe('projection applicability', () => {
  const series = linearSeries(AS_OF, 5, 56, 192, -1 / 7)
  const current = { value: 192, observedOn: AS_OF }

  it('marks aggregate and benchmark goals not applicable', () => {
    for (const goalKind of ['benchmark_result', 'training_frequency', 'activity_steps', 'nutrition_protein', 'sleep_duration', 'supplement_adherence'] as const) {
      const result = project({ goalKind, target: target({ targetMode: 'at_least', targetMin: 1, targetUnit: 'g/day' }), current, series })
      expect(result.state).toBe('not_applicable')
      expect(result.reason).not.toBe('no_current_observation')
    }
  })

  it('suppresses paused and completed goals', () => {
    const active = project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current, series })
    expect(active.state).toBe('available')
    expect(project({ status: 'paused', target: target({ targetMode: 'at_most', targetMax: 175 }), current, series }).state).toBe('not_applicable_lifecycle')
    expect(project({ status: 'completed', target: target({ targetMode: 'at_most', targetMax: 175 }), current, series }).state).toBe('not_applicable_lifecycle')
  })

  it('projects the current version from the same observations', () => {
    const first = project({ goalVersionId: 'v1', target: target({ targetMode: 'at_most', targetMax: 175 }), current, series })
    const second = project({ goalVersionId: 'v2', target: target({ targetMode: 'at_most', targetMax: 180 }), current, series })
    expect(first.goalVersionId).toBe('v1')
    expect(second.goalVersionId).toBe('v2')
    expect(second.estimatedCrossingDate).not.toBe(first.estimatedCrossingDate)
    expect(project({ goalVersionId: 'v1', target: target({ targetMode: 'at_most', targetMax: 175 }), current, series }).estimatedCrossingDate).toBe(first.estimatedCrossingDate)
  })

  it('changes when an observation is removed and ignores the target date', () => {
    const original = project({ target: target({ targetMode: 'at_most', targetMax: 175, targetDate: '2026-12-31' }), current, series })
    const corrected = project({ target: target({ targetMode: 'at_most', targetMax: 175, targetDate: '2026-12-31' }), current, series: series.slice(0, -1) })
    expect(corrected.trendPerDay).not.toBe(original.trendPerDay)
    const movedDeadline = project({ target: target({ targetMode: 'at_most', targetMax: 175, targetDate: '2027-06-01' }), current, series })
    const open = project({ target: target({ targetMode: 'at_most', targetMax: 175, targetDate: null }), current, series })
    expect(movedDeadline.trendPerDay).toBe(original.trendPerDay)
    expect(movedDeadline.estimatedCrossingDate).toBe(original.estimatedCrossingDate)
    expect(movedDeadline.estimatedWindowStart).toBe(original.estimatedWindowStart)
    expect(open.estimatedCrossingDate).toBe(original.estimatedCrossingDate)
    expect(original.targetDate).toBe('2026-12-31')
    expect(open.targetDate).toBeNull()
  })

  it('returns no current observation instead of zero', () => {
    const result = project({ target: target({ targetMode: 'at_most', targetMax: 175 }), current: null, series: [] })
    expect(result.state).toBe('insufficient_data')
    expect(result.reason).toBe('no_current_observation')
    expect(result.currentValue).toBeNull()
  })

  it('rejects a future asOf', () => {
    expect(parseProjectionAsOf(null, '2026-09-27')).toEqual({ asOf: '2026-09-27' })
    expect(parseProjectionAsOf('2026-09-01', '2026-09-27')).toEqual({ asOf: '2026-09-01' })
    expect(parseProjectionAsOf('2026-10-01', '2026-09-27')).toEqual({ error: 'asOf cannot be in the future.' })
    expect(parseProjectionAsOf('tomorrow', '2026-09-27')).toEqual({ error: 'asOf must be a calendar date.' })
  })
})

describe('projection boundaries', () => {
  it('stays derived, owner-only, and free of track language', () => {
    const projection = readFileSync('src/domain/goal-projection.ts', 'utf8')
    const service = readFileSync('server/goals/service.ts', 'utf8')
    const pages = readFileSync('src/features/goals/GoalsPages.tsx', 'utf8')
    const inventory = readFileSync('server/backup/inventory.ts', 'utf8')
    const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    expect(projection).toContain("goal-projection-v1")
    expect(projection).not.toContain('gemini')
    expect(service.slice(service.indexOf('export async function readGoalProjection'))).not.toContain('INSERT')
    expect(service).toContain("sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')")
    expect(inventory).not.toContain('goal_projections')
    expect(pages).not.toContain('on track')
    expect(pages).not.toContain('off track')
    expect(pages).not.toContain('You will reach')
    expect(today).not.toContain('projection')
  })
})
