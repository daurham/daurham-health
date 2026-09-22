import { phoenixCalendarDate } from './calendar.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../time.js'

/**
 * Health Auto Export JSON v2 daily summaries.
 *
 * Canonical v1 metrics: step_count, active_energy, apple_exercise_time,
 * resting_heart_rate. walking_running_distance is reported and ignored.
 * These values are Health Auto Export / HealthKit daily summaries. They are
 * not Apple ActivitySummary, Move, or Exercise ring values.
 *
 * Step counts may be fractional. Physical steps are whole numbers:
 * truncate a nonnegative quantity toward zero. Do not round to nearest.
 * The original provider quantity stays in import evidence.
 */

export const HAE_SOURCE = 'health_auto_export'
export const HAE_SOURCE_VERSION = 'v2'
export const HAE_BASIS = 'daily_summary'
export const HAE_CALCULATION_VERSION = 'hae-daily-v2'
export const HAE_STEP_NORMALIZATION = 'truncate_toward_zero'

export const HAE_CANONICAL_METRICS = [
  'step_count',
  'active_energy',
  'apple_exercise_time',
  'resting_heart_rate',
] as const

export type HaeCanonicalMetric = (typeof HAE_CANONICAL_METRICS)[number]

export const HAE_IGNORED_DISTANCE_METRIC = 'walking_running_distance'

const HAE_DATE = /^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2}))?$/

const UNITS: Record<HaeCanonicalMetric, readonly string[]> = {
  step_count: ['count', 'steps'],
  active_energy: ['kcal', 'cal', 'calorie', 'calories'],
  apple_exercise_time: ['min', 'mins', 'minute', 'minutes'],
  resting_heart_rate: ['bpm', 'count/min', 'beats/min'],
}

export class HealthAutoExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HealthAutoExportError'
  }
}

export type HaeMetricEvidence = {
  source: typeof HAE_SOURCE
  sourceVersion: typeof HAE_SOURCE_VERSION
  basis: typeof HAE_BASIS
  providerQty: number
  canonicalQty: number
  unit: string
  normalization: typeof HAE_STEP_NORMALIZATION | 'as_provided'
  providerSource: string | null
}

export type HaeDayPatch = {
  date: string
  timezone: typeof HEALTH_CALENDAR_TIME_ZONE
  stepsCount: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  restingHeartRateBpm: number | null
  metrics: Partial<Record<HaeCanonicalMetric, HaeMetricEvidence>>
}

export type HaeIgnoredMetric = {
  name: string
  count: number
}

export type HaeParseResult = {
  days: HaeDayPatch[]
  ignoredMetrics: HaeIgnoredMetric[]
  ignoredDistanceCount: number
  metricsApplied: Record<HaeCanonicalMetric, number>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function calendarDateOnly(value: string): string | null {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) {
    return null
  }
  const check = new Date(Date.UTC(year, month - 1, day))
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return null
  }
  return value
}

/** Offset-aware HAE timestamps become an America/Phoenix calendar day. */
export function healthDayFromHaeDate(value: string): string {
  const match = HAE_DATE.exec(value.trim())
  if (!match) {
    throw new HealthAutoExportError('Health Auto Export date is invalid')
  }
  const date = calendarDateOnly(match[1] ?? '')
  if (!date) {
    throw new HealthAutoExportError('Health Auto Export date is invalid')
  }
  if (!match[2]) {
    return date
  }
  const iso = `${date}T${match[2]}${match[3]}${match[4]}:${match[5]}`
  const instant = Date.parse(iso)
  if (!Number.isFinite(instant)) {
    throw new HealthAutoExportError('Health Auto Export date is invalid')
  }
  return phoenixCalendarDate(instant)
}

export function truncateHaeSteps(qty: number): number {
  if (!Number.isFinite(qty) || qty < 0) {
    throw new HealthAutoExportError('Health Auto Export step_count is invalid')
  }
  return Math.trunc(qty)
}

function canonicalMetric(name: string): HaeCanonicalMetric | null {
  return (HAE_CANONICAL_METRICS as readonly string[]).includes(name) ? (name as HaeCanonicalMetric) : null
}

function emptyDay(date: string): HaeDayPatch {
  return {
    date,
    timezone: HEALTH_CALENDAR_TIME_ZONE,
    stepsCount: null,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    restingHeartRateBpm: null,
    metrics: {},
  }
}

function applyPoint(day: HaeDayPatch, metric: HaeCanonicalMetric, qty: number, unit: string, providerSource: string | null) {
  if (metric === 'step_count') {
    const canonicalQty = truncateHaeSteps(qty)
    day.stepsCount = canonicalQty
    day.metrics.step_count = {
      source: HAE_SOURCE,
      sourceVersion: HAE_SOURCE_VERSION,
      basis: HAE_BASIS,
      providerQty: qty,
      canonicalQty,
      unit,
      normalization: HAE_STEP_NORMALIZATION,
      providerSource,
    }
    return
  }
  if (!Number.isFinite(qty) || qty < 0) {
    throw new HealthAutoExportError(`Health Auto Export ${metric} is invalid`)
  }
  const evidence: HaeMetricEvidence = {
    source: HAE_SOURCE,
    sourceVersion: HAE_SOURCE_VERSION,
    basis: HAE_BASIS,
    providerQty: qty,
    canonicalQty: qty,
    unit,
    normalization: 'as_provided',
    providerSource,
  }
  if (metric === 'active_energy') {
    day.activeEnergyKcal = qty
    day.metrics.active_energy = evidence
  } else if (metric === 'apple_exercise_time') {
    day.exerciseMinutes = qty
    day.metrics.apple_exercise_time = evidence
  } else {
    day.restingHeartRateBpm = qty
    day.metrics.resting_heart_rate = evidence
  }
}

function readPoint(metric: HaeCanonicalMetric, point: unknown, declaredUnit: string): {
  qty: number
  unit: string
  date: string
  providerSource: string | null
} {
  if (!isRecord(point)) {
    throw new HealthAutoExportError(`Health Auto Export ${metric} point is invalid`)
  }
  const qty = point.qty
  if (typeof qty !== 'number') {
    throw new HealthAutoExportError(`Health Auto Export ${metric} quantity is invalid`)
  }
  const unit = typeof point.units === 'string' && point.units.trim() !== '' ? point.units : declaredUnit
  if (!UNITS[metric].includes(unit.trim().toLowerCase())) {
    throw new HealthAutoExportError(`Health Auto Export ${metric} unit is invalid`)
  }
  if (typeof point.date !== 'string') {
    throw new HealthAutoExportError(`Health Auto Export ${metric} date is invalid`)
  }
  const providerSource = typeof point.source === 'string' ? point.source.trim().slice(0, 180) : null
  return {
    qty,
    unit: unit.trim(),
    date: healthDayFromHaeDate(point.date),
    providerSource: providerSource && providerSource.length > 0 ? providerSource : null,
  }
}

export function parseHealthAutoExport(payload: unknown): HaeParseResult {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.metrics)) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  const days = new Map<string, HaeDayPatch>()
  const ignored = new Map<string, number>()
  const metricsApplied: Record<HaeCanonicalMetric, number> = {
    step_count: 0,
    active_energy: 0,
    apple_exercise_time: 0,
    resting_heart_rate: 0,
  }
  for (const metric of payload.data.metrics) {
    if (!isRecord(metric) || typeof metric.name !== 'string') {
      throw new HealthAutoExportError('Health Auto Export metric name is invalid')
    }
    const name = metric.name.trim()
    const canonical = canonicalMetric(name)
    const data = Array.isArray(metric.data) ? metric.data : null
    if (!data) {
      throw new HealthAutoExportError(`Health Auto Export ${name} data is invalid`)
    }
    if (!canonical) {
      ignored.set(name, (ignored.get(name) ?? 0) + data.length)
      continue
    }
    const declaredUnit = typeof metric.units === 'string' ? metric.units : ''
    for (const point of data) {
      const parsed = readPoint(canonical, point, declaredUnit)
      const day = days.get(parsed.date) ?? emptyDay(parsed.date)
      applyPoint(day, canonical, parsed.qty, parsed.unit, parsed.providerSource)
      days.set(parsed.date, day)
      metricsApplied[canonical] += 1
    }
  }
  return {
    days: [...days.values()].sort((left, right) => left.date.localeCompare(right.date)),
    ignoredMetrics: [...ignored.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => left.name.localeCompare(right.name)),
    ignoredDistanceCount: ignored.get(HAE_IGNORED_DISTANCE_METRIC) ?? 0,
    metricsApplied,
  }
}
