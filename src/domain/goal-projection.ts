import { latestSessionE1rm, observationToGoalUnit, type GoalKind, type GoalStatus, type GoalTarget } from './goals.js'
import { addCalendarDays, calendarDaysBetween } from './progress/dates.js'
import { prepareBodyMetricSeries } from './progress/body-trend.js'
import { PROGRESS_ANALYTICS_CONFIG } from './progress/config.js'
import { appearanceStrengthSeries } from './progress/exercise-trend.js'
import { linearPercentile, median, pairwiseSlopesPerDay } from './progress/statistics.js'
import { kilogramsToPounds } from './units.js'
import { isCalendarDate } from './training.js'
import type { BodyObservation, CanonicalSetRecord, ProgressExerciseDefinition } from './progress/types.js'

export const GOAL_PROJECTION_CALCULATION_VERSION = 'goal-projection-v1'

const BODY_EVIDENCE_DAYS = 90
const STRENGTH_EVIDENCE_DAYS = 180
const STRENGTH_MIN_APPEARANCES = 6
const STRENGTH_MIN_SPAN_DAYS = 28
const HORIZON_FLOOR_DAYS = 90
const HORIZON_SPAN_MULTIPLIER = 4
const HORIZON_CAP_DAYS = 365

export const GOAL_PROJECTION_STATES = [
  'available',
  'not_applicable',
  'not_applicable_lifecycle',
  'target_currently_satisfied',
  'insufficient_data',
  'trend_not_toward_target',
  'unstable_trend',
  'beyond_projection_horizon',
] as const

export type GoalProjectionState = (typeof GOAL_PROJECTION_STATES)[number]

export type GoalProjection = {
  goalId: string
  goalVersionId: string
  goalKind: GoalKind
  asOf: string
  state: GoalProjectionState
  reason: string | null
  currentValue: number | null
  targetBoundary: number | null
  targetDate: string | null
  unit: string
  sampleCount: number | null
  spanDays: number | null
  firstObservationDate: string | null
  lastObservationDate: string | null
  trendPerDay: number | null
  trendPerWeek: number | null
  trendLowerPerDay: number | null
  trendUpperPerDay: number | null
  estimatedCrossingDate: string | null
  estimatedWindowStart: string | null
  estimatedWindowEnd: string | null
  maxProjectionDate: string | null
  calculationVersion: typeof GOAL_PROJECTION_CALCULATION_VERSION
}

type DatedValue = { date: string; value: number }

type ProjectGoalInput = {
  goalId: string
  goalVersionId: string
  status: GoalStatus
  goalKind: GoalKind
  target: GoalTarget
  asOf: string
  current: { value: number; observedOn: string } | null
  series: readonly DatedValue[]
}

const PROJECTABLE = new Set<GoalKind>(['body_metric', 'strength_e1rm'])

export function projectionHorizonDays(evidenceSpanDays: number): number {
  return Math.min(HORIZON_CAP_DAYS, Math.max(HORIZON_FLOOR_DAYS, evidenceSpanDays * HORIZON_SPAN_MULTIPLIER))
}

export function parseProjectionAsOf(value: string | null | undefined, today: string): { asOf: string } | { error: string } {
  if (value == null || value.trim() === '') {
    return { asOf: today }
  }
  if (!isCalendarDate(value)) {
    return { error: 'asOf must be a calendar date.' }
  }
  if (value > today) {
    return { error: 'asOf cannot be in the future.' }
  }
  return { asOf: value }
}

export function bodyGoalSeries(
  observations: readonly BodyObservation[],
  metricKey: string,
  goalUnit: string,
  asOf: string,
): { current: { value: number; observedOn: string } | null; series: DatedValue[] } {
  const series: DatedValue[] = []
  for (const point of prepareBodyMetricSeries(observations, metricKey)) {
    if (point.calendarDate > asOf) {
      continue
    }
    const value = observationToGoalUnit(point.value, point.unit, goalUnit)
    if (value == null) {
      continue
    }
    series.push({ date: point.calendarDate, value })
  }
  const latest = series.length === 0 ? null : series[series.length - 1]!
  return {
    current: latest ? { value: latest.value, observedOn: latest.date } : null,
    series,
  }
}

export function strengthGoalSeries(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
  asOf: string,
): { current: { value: number; observedOn: string } | null; series: DatedValue[] } {
  const eligible = sets.filter((set) => set.sessionDate <= asOf)
  const bySession = new Map<string, CanonicalSetRecord[]>()
  for (const set of eligible) {
    const bucket = bySession.get(set.sessionId) ?? []
    bucket.push(set)
    bySession.set(set.sessionId, bucket)
  }
  const currentPoint = latestSessionE1rm([...bySession.values()], exercise)
  const series = appearanceStrengthSeries(eligible, exercise).map((point) => ({
    date: point.date,
    value: kilogramsToPounds(point.estimated1RmKg),
  }))
  return {
    current: currentPoint
      ? { value: kilogramsToPounds(currentPoint.e1rmKg), observedOn: currentPoint.observedOn }
      : null,
    series,
  }
}

function blank(input: ProjectGoalInput, state: GoalProjectionState, reason: string | null, extra?: Partial<GoalProjection>): GoalProjection {
  return {
    goalId: input.goalId,
    goalVersionId: input.goalVersionId,
    goalKind: input.goalKind,
    asOf: input.asOf,
    state,
    reason,
    currentValue: input.current?.value ?? null,
    targetBoundary: null,
    targetDate: input.target.targetDate,
    unit: input.target.targetUnit,
    sampleCount: null,
    spanDays: null,
    firstObservationDate: null,
    lastObservationDate: null,
    trendPerDay: null,
    trendPerWeek: null,
    trendLowerPerDay: null,
    trendUpperPerDay: null,
    estimatedCrossingDate: null,
    estimatedWindowStart: null,
    estimatedWindowEnd: null,
    maxProjectionDate: null,
    calculationVersion: GOAL_PROJECTION_CALCULATION_VERSION,
    ...extra,
  }
}

function boundaryFor(current: number, target: GoalTarget): { boundary: number; direction: 1 | -1 } | { satisfied: true } | { invalid: true } {
  if (target.targetMode === 'at_least') {
    if (target.targetMin == null) {
      return { invalid: true }
    }
    if (current >= target.targetMin) {
      return { satisfied: true }
    }
    return { boundary: target.targetMin, direction: 1 }
  }
  if (target.targetMode === 'at_most') {
    if (target.targetMax == null) {
      return { invalid: true }
    }
    if (current <= target.targetMax) {
      return { satisfied: true }
    }
    return { boundary: target.targetMax, direction: -1 }
  }
  if (target.targetMin == null || target.targetMax == null) {
    return { invalid: true }
  }
  if (current >= target.targetMin && current <= target.targetMax) {
    return { satisfied: true }
  }
  if (current < target.targetMin) {
    return { boundary: target.targetMin, direction: 1 }
  }
  return { boundary: target.targetMax, direction: -1 }
}

function toward(slope: number, direction: 1 | -1): boolean {
  return slope * direction > 0
}

/**
 * Crossing dates are whole Health calendar dates. A fractional day count uses
 * `ceil`, so 36.2 days lands on the 37th date after `asOf` and never on an hour.
 */
function crossingDate(asOf: string, current: number, boundary: number, slopePerDay: number): { days: number; date: string } | null {
  if (!Number.isFinite(slopePerDay) || slopePerDay === 0) {
    return null
  }
  const days = (boundary - current) / slopePerDay
  if (!Number.isFinite(days) || days <= 0) {
    return null
  }
  const wholeDays = Math.ceil(days)
  return { days: wholeDays, date: addCalendarDays(asOf, wholeDays) }
}

export function projectGoal(input: ProjectGoalInput): GoalProjection {
  if (!PROJECTABLE.has(input.goalKind)) {
    return blank(input, 'not_applicable', 'unsupported_kind')
  }
  if (input.status !== 'active') {
    return blank(input, 'not_applicable_lifecycle', input.status)
  }
  if (!input.current) {
    return blank(input, 'insufficient_data', 'no_current_observation')
  }
  const boundary = boundaryFor(input.current.value, input.target)
  if ('invalid' in boundary) {
    return blank(input, 'insufficient_data', 'invalid_target')
  }
  if ('satisfied' in boundary) {
    return blank(input, 'target_currently_satisfied', 'current_meets_target')
  }
  const windowDays = input.goalKind === 'body_metric' ? BODY_EVIDENCE_DAYS : STRENGTH_EVIDENCE_DAYS
  const windowStart = addCalendarDays(input.asOf, -windowDays)
  const points = [...input.series]
    .filter((point) => point.date >= windowStart && point.date <= input.asOf)
    .sort((left, right) => (left.date < right.date ? -1 : left.date > right.date ? 1 : 0))
  const minimumSamples = input.goalKind === 'body_metric' ? PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumMeasurements : STRENGTH_MIN_APPEARANCES
  const minimumSpan = input.goalKind === 'body_metric' ? PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumSpanDays : STRENGTH_MIN_SPAN_DAYS
  const first = points[0]
  const last = points[points.length - 1]
  const spanDays = first && last ? calendarDaysBetween(first.date, last.date) : null
  const evidence = {
    currentValue: input.current.value,
    targetBoundary: boundary.boundary,
    sampleCount: points.length,
    spanDays,
    firstObservationDate: first?.date ?? null,
    lastObservationDate: last?.date ?? null,
  }
  if (points.length < minimumSamples) {
    return blank(input, 'insufficient_data', 'insufficient_sample', evidence)
  }
  if (spanDays == null || spanDays < minimumSpan || !first) {
    return blank(input, 'insufficient_data', 'insufficient_span', evidence)
  }
  const origin = first.date
  const slopes = pairwiseSlopesPerDay(
    points.map((point) => ({
      day: calendarDaysBetween(origin, point.date),
      value: point.value,
    })),
  )
  const trendPerDay = median(slopes)
  const trendLowerPerDay = linearPercentile(slopes, 0.25)
  const trendUpperPerDay = linearPercentile(slopes, 0.75)
  const slopeFields = {
    ...evidence,
    trendPerDay,
    trendPerWeek: trendPerDay == null ? null : trendPerDay * 7,
    trendLowerPerDay,
    trendUpperPerDay,
  }
  if (trendPerDay == null || trendLowerPerDay == null || trendUpperPerDay == null) {
    return blank(input, 'insufficient_data', 'insufficient_span', slopeFields)
  }
  if (!toward(trendPerDay, boundary.direction)) {
    return blank(input, 'trend_not_toward_target', 'slope_not_toward_target', slopeFields)
  }
  if (!toward(trendLowerPerDay, boundary.direction) || !toward(trendUpperPerDay, boundary.direction)) {
    return blank(input, 'unstable_trend', 'slope_dispersion_not_toward_target', slopeFields)
  }
  const horizon = projectionHorizonDays(spanDays)
  const maxProjectionDate = addCalendarDays(input.asOf, horizon)
  const central = crossingDate(input.asOf, input.current.value, boundary.boundary, trendPerDay)
  const lower = crossingDate(input.asOf, input.current.value, boundary.boundary, trendLowerPerDay)
  const upper = crossingDate(input.asOf, input.current.value, boundary.boundary, trendUpperPerDay)
  const dated = { ...slopeFields, maxProjectionDate }
  if (!central || !lower || !upper) {
    return blank(input, 'unstable_trend', 'slope_dispersion_not_toward_target', dated)
  }
  if (central.days > horizon) {
    return blank(input, 'beyond_projection_horizon', 'central_beyond_horizon', dated)
  }
  if (lower.days > horizon || upper.days > horizon) {
    return blank(input, 'unstable_trend', 'dispersion_beyond_horizon', dated)
  }
  const dates = [central.date, lower.date, upper.date].sort()
  return blank(input, 'available', null, {
    ...dated,
    estimatedCrossingDate: central.date,
    estimatedWindowStart: dates[0] ?? null,
    estimatedWindowEnd: dates[2] ?? null,
  })
}
