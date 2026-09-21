import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { calendarDaysBetween } from './dates.js'
import { theilSenSlopePerDay } from './statistics.js'
import {
  availableMetric,
  insufficientMetric,
  type BodyObservation,
  type CanonicalEvidence,
  type MetricResult,
} from './types.js'

export type BodyWeightTrendValue = {
  slopePerDay: number
  slopePerWeek: number
  measurementCount: number
  spanDays: number
  latest: BodyObservation
}

function onePointPerDate(observations: readonly BodyObservation[]): BodyObservation[] {
  const byDate = new Map<string, BodyObservation>()
  const ordered = [...observations].sort((left, right) => {
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? -1 : 1
    }
    if (left.measuredAt !== right.measuredAt) {
      return left.measuredAt < right.measuredAt ? -1 : 1
    }
    return left.measurementId < right.measurementId ? -1 : 1
  })
  for (const observation of ordered) {
    byDate.set(observation.calendarDate, observation)
  }
  return [...byDate.values()].sort((left, right) =>
    left.calendarDate < right.calendarDate ? -1 : left.calendarDate > right.calendarDate ? 1 : 0,
  )
}

export function bodyWeightTrend(
  observations: readonly BodyObservation[],
): MetricResult<BodyWeightTrendValue> {
  const points = onePointPerDate(observations.filter((item) => item.key === 'weight'))
  const required = PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumMeasurements
  const minSpan = PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumSpanDays
  if (points.length < required) {
    return insufficientMetric(points.length, required)
  }
  const first = points[0]!
  const last = points[points.length - 1]!
  const spanDays = calendarDaysBetween(first.calendarDate, last.calendarDate)
  if (spanDays < minSpan) {
    return insufficientMetric(points.length, required)
  }
  const origin = first.calendarDate
  const slopePerDay = theilSenSlopePerDay(
    points.map((point) => ({
      day: calendarDaysBetween(origin, point.calendarDate),
      value: point.value,
    })),
  )
  if (slopePerDay == null) {
    return insufficientMetric(points.length, required)
  }
  return availableMetric(
    {
      slopePerDay,
      slopePerWeek: slopePerDay * 7,
      measurementCount: points.length,
      spanDays,
      latest: last,
    },
    points.length,
    'theil_sen',
  )
}

export function bodyWeightTrendEvidence(observations: readonly BodyObservation[]): CanonicalEvidence[] {
  return onePointPerDate(observations.filter((item) => item.key === 'weight')).map((item) => ({
    domain: 'body' as const,
    measurementId: item.measurementId,
    measurementSessionId: item.measurementSessionId,
    date: item.calendarDate,
  }))
}

export type SparseMetricComparison = {
  key: string
  unit: string
  current: BodyObservation | null
  previous: BodyObservation | null
  change: number | null
  periodStartNearest: BodyObservation | null
  periodEndNearest: BodyObservation | null
}

function nearestToDate(observations: readonly BodyObservation[], date: string): BodyObservation | null {
  if (observations.length === 0) {
    return null
  }
  return [...observations].sort((left, right) => {
    const leftDistance = Math.abs(calendarDaysBetween(left.calendarDate, date))
    const rightDistance = Math.abs(calendarDaysBetween(right.calendarDate, date))
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? -1 : 1
    }
    return left.measurementId < right.measurementId ? -1 : 1
  })[0]!
}

export function compareSparseBodyMetric(
  observations: readonly BodyObservation[],
  key: string,
  periodStart: string,
  periodEnd: string,
): MetricResult<SparseMetricComparison> {
  const series = [...observations]
    .filter((item) => item.key === key && item.calendarDate <= periodEnd)
    .sort((left, right) => {
      if (left.calendarDate !== right.calendarDate) {
        return left.calendarDate < right.calendarDate ? -1 : 1
      }
      if (left.measuredAt !== right.measuredAt) {
        return left.measuredAt < right.measuredAt ? -1 : 1
      }
      return left.measurementId < right.measurementId ? -1 : 1
    })
  if (series.length === 0) {
    return insufficientMetric(0, 1)
  }
  const current = series[series.length - 1]!
  const previous = series.length > 1 ? series[series.length - 2]! : null
  const comparison: SparseMetricComparison = {
    key,
    unit: current.unit,
    current,
    previous,
    change: previous ? current.value - previous.value : null,
    periodStartNearest: nearestToDate(series, periodStart),
    periodEndNearest: nearestToDate(series, periodEnd),
  }
  if (!previous) {
    return insufficientMetric(1, 2)
  }
  return availableMetric(comparison, series.length)
}
