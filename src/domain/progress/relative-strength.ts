import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { calendarDaysBetween } from './dates.js'
import {
  availableMetric,
  notApplicableMetric,
  type BodyObservation,
  type MetricResult,
  type SessionStrengthPoint,
} from './types.js'

export type RelativeStrengthValue = {
  ratio: number
  estimated1RmKg: number
  bodyWeightKg: number
  bodyMeasurement: BodyObservation
}

export function relativeStrength(
  point: SessionStrengthPoint | null,
  bodyWeights: readonly BodyObservation[],
): MetricResult<RelativeStrengthValue> {
  if (!point) {
    return notApplicableMetric(0)
  }
  const maxDistance = PROGRESS_ANALYTICS_CONFIG.relativeStrength.maxBodyWeightDistanceDays
  const weights = bodyWeights.filter((item) => item.key === 'weight')
  const qualifying = weights.filter(
    (item) => Math.abs(calendarDaysBetween(item.calendarDate, point.date)) <= maxDistance,
  )
  if (qualifying.length === 0) {
    return notApplicableMetric(weights.length)
  }
  qualifying.sort((left, right) => {
    const leftDistance = Math.abs(calendarDaysBetween(left.calendarDate, point.date))
    const rightDistance = Math.abs(calendarDaysBetween(right.calendarDate, point.date))
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? -1 : 1
    }
    if (left.measuredAt !== right.measuredAt) {
      return left.measuredAt < right.measuredAt ? -1 : 1
    }
    return left.measurementId < right.measurementId ? -1 : 1
  })
  const nearest = qualifying[0]!
  if (nearest.value === 0) {
    return notApplicableMetric(1)
  }
  return availableMetric(
    {
      ratio: point.estimated1RmKg / nearest.value,
      estimated1RmKg: point.estimated1RmKg,
      bodyWeightKg: nearest.value,
      bodyMeasurement: nearest,
    },
    1,
    'session_e1rm_over_nearest_body_weight',
  )
}
