import { addCalendarDays, inclusiveDayCount } from '../progress/dates.js'
import { median, percentChange } from '../progress/statistics.js'
import { availableMetric, insufficientMetric, unsupportedMetric, type MetricResult } from '../progress/types.js'
import {
  ACTIVITY_METRICS,
  ACTIVITY_SHORT_TERM_DAYS,
  ACTIVITY_SHORT_TERM_MIN_OBSERVED,
  ACTIVITY_TIMEZONE,
  type ActivityMetricKey,
} from './config.js'

export type ActivityDailyRow = {
  date: string
  timezone: string
  stepsCount: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  walkingRunningDistanceM: number | null
  restingHeartRateBpm: number | null
}

export type ActivityCoverage = {
  calendarDays: number
  observedDays: number
  coveragePct: number
}

export type ActivityMetricSummary = MetricResult<number> & {
  metric: ActivityMetricKey | 'walking_running_distance_m'
  calendarDays: number
  observedDays: number
  coveragePct: number
  basis?: 'observed_average' | 'observed_median'
}

export type ActivityRangeSummary = {
  start: string
  end: string
  timezone: string
  calendarDays: number
  steps: ActivityMetricSummary
  activeEnergy: ActivityMetricSummary
  exercise: ActivityMetricSummary
  restingHeartRate: ActivityMetricSummary
  walkingRunningDistance: ActivityMetricSummary
}

export type ActivityChangeValue = {
  current: number
  previous: number
  absoluteDelta: number
  percentDelta: number | null
  currentCoverage: ActivityCoverage
  previousCoverage: ActivityCoverage
}

export type ActivityShortTermMetric = MetricResult<ActivityChangeValue> & {
  metric: ActivityMetricKey | 'walking_running_distance_m'
}

export type ActivityShortTermChange = {
  asOf: string
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  steps: ActivityShortTermMetric
  activeEnergy: ActivityShortTermMetric
  exercise: ActivityShortTermMetric
  restingHeartRate: ActivityShortTermMetric
  walkingRunningDistance: ActivityShortTermMetric
}

const METRIC_FIELD: Record<ActivityMetricKey, keyof ActivityDailyRow> = {
  steps_count: 'stepsCount',
  active_energy_kcal: 'activeEnergyKcal',
  exercise_minutes: 'exerciseMinutes',
  resting_heart_rate_bpm: 'restingHeartRateBpm',
}

function coverage(calendarDays: number, observedDays: number): ActivityCoverage {
  return {
    calendarDays,
    observedDays,
    coveragePct: calendarDays === 0 ? 0 : (observedDays / calendarDays) * 100,
  }
}

function observedValues(rows: readonly ActivityDailyRow[], start: string, end: string, metric: ActivityMetricKey): number[] {
  const field = METRIC_FIELD[metric]
  const values: number[] = []
  for (const row of rows) {
    if (row.date < start || row.date > end) {
      continue
    }
    const value = row[field]
    if (typeof value === 'number' && Number.isFinite(value)) {
      values.push(value)
    }
  }
  return values
}

function summarizeMetric(
  metric: ActivityMetricKey,
  rows: readonly ActivityDailyRow[],
  start: string,
  end: string,
): ActivityMetricSummary {
  const calendarDays = inclusiveDayCount(start, end)
  const values = observedValues(rows, start, end, metric)
  const observed = coverage(calendarDays, values.length)
  if (values.length === 0) {
    return {
      metric,
      ...insufficientMetric(0),
      ...observed,
    }
  }
  const useMedian = metric === 'resting_heart_rate_bpm'
  const value = useMedian ? median(values) : values.reduce((sum, item) => sum + item, 0) / values.length
  if (value == null) {
    return {
      metric,
      ...insufficientMetric(values.length),
      ...observed,
    }
  }
  return {
    metric,
    ...availableMetric(value, values.length, useMedian ? 'observed_median' : 'observed_average'),
    ...observed,
    basis: useMedian ? 'observed_median' : 'observed_average',
  }
}

function unsupportedDistance(calendarDays: number): ActivityMetricSummary {
  return {
    metric: 'walking_running_distance_m',
    ...unsupportedMetric(0),
    calendarDays,
    observedDays: 0,
    coveragePct: 0,
  }
}

export function activityRangeSummary(
  rows: readonly ActivityDailyRow[],
  start: string,
  end: string,
  timezone = ACTIVITY_TIMEZONE,
): ActivityRangeSummary {
  const calendarDays = inclusiveDayCount(start, end)
  return {
    start,
    end,
    timezone,
    calendarDays,
    steps: summarizeMetric('steps_count', rows, start, end),
    activeEnergy: summarizeMetric('active_energy_kcal', rows, start, end),
    exercise: summarizeMetric('exercise_minutes', rows, start, end),
    restingHeartRate: summarizeMetric('resting_heart_rate_bpm', rows, start, end),
    walkingRunningDistance: unsupportedDistance(calendarDays),
  }
}

function changeForMetric(
  metric: ActivityMetricKey,
  rows: readonly ActivityDailyRow[],
  currentStart: string,
  currentEnd: string,
  previousStart: string,
  previousEnd: string,
): ActivityShortTermMetric {
  const currentDays = inclusiveDayCount(currentStart, currentEnd)
  const previousDays = inclusiveDayCount(previousStart, previousEnd)
  const currentValues = observedValues(rows, currentStart, currentEnd, metric)
  const previousValues = observedValues(rows, previousStart, previousEnd, metric)
  const currentCoverage = coverage(currentDays, currentValues.length)
  const previousCoverage = coverage(previousDays, previousValues.length)
  if (currentValues.length < ACTIVITY_SHORT_TERM_MIN_OBSERVED || previousValues.length < ACTIVITY_SHORT_TERM_MIN_OBSERVED) {
    return {
      metric,
      ...insufficientMetric(Math.min(currentValues.length, previousValues.length), ACTIVITY_SHORT_TERM_MIN_OBSERVED),
    }
  }
  const useMedian = metric === 'resting_heart_rate_bpm'
  const current = useMedian ? median(currentValues) : currentValues.reduce((sum, item) => sum + item, 0) / currentValues.length
  const previous = useMedian
    ? median(previousValues)
    : previousValues.reduce((sum, item) => sum + item, 0) / previousValues.length
  if (current == null || previous == null) {
    return {
      metric,
      ...insufficientMetric(Math.min(currentValues.length, previousValues.length), ACTIVITY_SHORT_TERM_MIN_OBSERVED),
    }
  }
  return {
    metric,
    ...availableMetric(
      {
        current,
        previous,
        absoluteDelta: current - previous,
        percentDelta: percentChange(current, previous),
        currentCoverage,
        previousCoverage,
      },
      currentValues.length + previousValues.length,
    ),
  }
}

export function activityShortTermChange(rows: readonly ActivityDailyRow[], asOf: string): ActivityShortTermChange {
  const currentEnd = asOf
  const currentStart = addCalendarDays(asOf, -(ACTIVITY_SHORT_TERM_DAYS - 1))
  const previousEnd = addCalendarDays(currentStart, -1)
  const previousStart = addCalendarDays(previousEnd, -(ACTIVITY_SHORT_TERM_DAYS - 1))
  return {
    asOf,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
    steps: changeForMetric('steps_count', rows, currentStart, currentEnd, previousStart, previousEnd),
    activeEnergy: changeForMetric('active_energy_kcal', rows, currentStart, currentEnd, previousStart, previousEnd),
    exercise: changeForMetric('exercise_minutes', rows, currentStart, currentEnd, previousStart, previousEnd),
    restingHeartRate: changeForMetric('resting_heart_rate_bpm', rows, currentStart, currentEnd, previousStart, previousEnd),
    walkingRunningDistance: {
      metric: 'walking_running_distance_m',
      ...unsupportedMetric(0),
    },
  }
}

export { ACTIVITY_METRICS }
