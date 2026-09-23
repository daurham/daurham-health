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
  /** Canonical summary update time. Absent when the row was not loaded with one. */
  updatedAt?: string | null
}

export type ActivityCoverage = {
  calendarDays: number
  completedCalendarDays: number
  observedDays: number
  coveragePct: number
}

export type ActivityMetricSummary = MetricResult<number> & {
  metric: ActivityMetricKey | 'walking_running_distance_m'
  calendarDays: number
  completedCalendarDays: number
  observedDays: number
  coveragePct: number
  basis?: 'observed_average' | 'observed_median'
}

export type ActivityRangeSummary = {
  start: string
  end: string
  timezone: string
  calendarDays: number
  completedCalendarDays: number
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

function coverage(calendarDays: number, completedCalendarDays: number, observedDays: number): ActivityCoverage {
  return {
    calendarDays,
    completedCalendarDays,
    observedDays,
    coveragePct: completedCalendarDays === 0 ? 0 : (observedDays / completedCalendarDays) * 100,
  }
}

function completedWindow(start: string, end: string, today?: string): { aggregateEnd: string; completedCalendarDays: number } {
  const selected = inclusiveDayCount(start, end)
  if (!today || today < start || today > end) {
    return { aggregateEnd: end, completedCalendarDays: selected }
  }
  const yesterday = addCalendarDays(today, -1)
  if (yesterday < start) {
    return { aggregateEnd: yesterday, completedCalendarDays: 0 }
  }
  const aggregateEnd = yesterday < end ? yesterday : end
  return { aggregateEnd, completedCalendarDays: inclusiveDayCount(start, aggregateEnd) }
}

function observedValues(
  rows: readonly ActivityDailyRow[],
  start: string,
  end: string,
  metric: ActivityMetricKey,
  excludeDate?: string,
): number[] {
  const field = METRIC_FIELD[metric]
  const values: number[] = []
  for (const row of rows) {
    if (row.date < start || row.date > end || row.date === excludeDate) {
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
  today?: string,
): ActivityMetricSummary {
  const calendarDays = inclusiveDayCount(start, end)
  const completed = completedWindow(start, end, today)
  const excludeDate = today && today >= start && today <= end ? today : undefined
  const values = observedValues(rows, start, completed.aggregateEnd, metric, excludeDate)
  const observed = coverage(calendarDays, completed.completedCalendarDays, values.length)
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

function unsupportedDistance(calendarDays: number, completedCalendarDays: number): ActivityMetricSummary {
  return {
    metric: 'walking_running_distance_m',
    ...unsupportedMetric(0),
    calendarDays,
    completedCalendarDays,
    observedDays: 0,
    coveragePct: 0,
  }
}

export function activityRangeSummary(
  rows: readonly ActivityDailyRow[],
  start: string,
  end: string,
  timezone = ACTIVITY_TIMEZONE,
  today?: string,
): ActivityRangeSummary {
  const calendarDays = inclusiveDayCount(start, end)
  const completed = completedWindow(start, end, today)
  return {
    start,
    end,
    timezone,
    calendarDays,
    completedCalendarDays: completed.completedCalendarDays,
    steps: summarizeMetric('steps_count', rows, start, end, today),
    activeEnergy: summarizeMetric('active_energy_kcal', rows, start, end, today),
    exercise: summarizeMetric('exercise_minutes', rows, start, end, today),
    restingHeartRate: summarizeMetric('resting_heart_rate_bpm', rows, start, end, today),
    walkingRunningDistance: unsupportedDistance(calendarDays, completed.completedCalendarDays),
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
  const currentCoverage = coverage(currentDays, currentDays, currentValues.length)
  const previousCoverage = coverage(previousDays, previousDays, previousValues.length)
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

export function activityShortTermChange(
  rows: readonly ActivityDailyRow[],
  asOf: string,
  today?: string,
): ActivityShortTermChange {
  const currentEnd = today && asOf === today ? addCalendarDays(asOf, -1) : asOf
  const currentStart = addCalendarDays(currentEnd, -(ACTIVITY_SHORT_TERM_DAYS - 1))
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
