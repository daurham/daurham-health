import { percentChange } from './statistics.js'
import { availableMetric, notApplicableMetric, type MetricResult } from './types.js'

export type PeriodComparisonValue = {
  current: number
  previous: number
  change: number
  percentChange: number | null
}

export function compareCounts(current: number | null, previous: number | null): MetricResult<PeriodComparisonValue> {
  if (current == null || previous == null) {
    return notApplicableMetric(0)
  }
  const change = current - previous
  return availableMetric(
    {
      current,
      previous,
      change,
      percentChange: percentChange(current, previous),
    },
    2,
  )
}
