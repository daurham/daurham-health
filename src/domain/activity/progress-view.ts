import { addCalendarDays } from '../progress/dates.js'
import { trailingPeriod } from '../progress/periods.js'
import type { ProgressRange } from '../progress/types.js'
import { activityRangeSummary, activityShortTermChange, type ActivityDailyRow, type ActivityMetricSummary, type ActivityShortTermMetric } from './analytics.js'
import { ACTIVITY_TIMEZONE, type ActivityMetricKey } from './config.js'

export type ActivityChartPoint = {
  date: string
  value: number | null
  provisional: boolean
}

export type ActivityProvisionalDay = {
  date: string
  stepsCount: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  restingHeartRateBpm: number | null
}

export type ActivityProgressMetricView = {
  key: ActivityMetricKey
  summary: ActivityMetricSummary
  series: ActivityChartPoint[]
  recent: ActivityShortTermMetric
}

export type ActivityProgressView = {
  range: ProgressRange
  asOf: string
  start: string
  end: string
  timezone: string
  calendarDays: number
  completedCalendarDays: number
  provisionalDay: ActivityProvisionalDay | null
  steps: ActivityProgressMetricView
  activeEnergy: ActivityProgressMetricView
  exercise: ActivityProgressMetricView
  restingHeartRate: ActivityProgressMetricView
  walkingRunningDistance: {
    summary: ActivityMetricSummary
    recent: ActivityShortTermMetric
  }
}

const METRIC_FIELD: Record<ActivityMetricKey, keyof ActivityDailyRow> = {
  steps_count: 'stepsCount',
  active_energy_kcal: 'activeEnergyKcal',
  exercise_minutes: 'exerciseMinutes',
  resting_heart_rate_bpm: 'restingHeartRateBpm',
}

function datesThrough(start: string, end: string): string[] {
  const dates: string[] = []
  if (end < start) {
    return dates
  }
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addCalendarDays(cursor, 1)
  }
  return dates
}

function seriesFor(
  rows: readonly ActivityDailyRow[],
  metric: ActivityMetricKey,
  start: string,
  end: string,
  today?: string,
): ActivityChartPoint[] {
  const field = METRIC_FIELD[metric]
  const byDate = new Map(rows.map((row) => [row.date, row]))
  return datesThrough(start, end).map((date) => {
    const row = byDate.get(date)
    const value = row ? row[field] : null
    return {
      date,
      value: typeof value === 'number' && Number.isFinite(value) ? value : null,
      provisional: today != null && date === today,
    }
  })
}

function metricView(
  key: ActivityMetricKey,
  rows: readonly ActivityDailyRow[],
  start: string,
  end: string,
  summary: ActivityMetricSummary,
  recent: ActivityShortTermMetric,
  today?: string,
): ActivityProgressMetricView {
  return {
    key,
    summary,
    series: seriesFor(rows, key, start, end, today),
    recent,
  }
}

export function buildActivityProgressView(
  rows: readonly ActivityDailyRow[],
  input: { range: ProgressRange; asOf: string; today?: string },
): ActivityProgressView {
  const observedDates = rows.map((row) => row.date).filter((date) => date <= input.asOf)
  const earliest = observedDates.length > 0 ? observedDates.reduce((min, date) => (date < min ? date : min)) : null
  const period = trailingPeriod(input.range, input.asOf, earliest)
  const today = input.today
  const summary = activityRangeSummary(rows, period.start, period.end, ACTIVITY_TIMEZONE, today)
  const recent = activityShortTermChange(rows, input.asOf, today)
  const provisionalRow =
    today && today >= period.start && today <= period.end ? rows.find((row) => row.date === today) ?? null : null
  return {
    range: input.range,
    asOf: input.asOf,
    start: period.start,
    end: period.end,
    timezone: ACTIVITY_TIMEZONE,
    calendarDays: period.dayCount,
    completedCalendarDays: summary.completedCalendarDays,
    provisionalDay: provisionalRow
      ? {
          date: provisionalRow.date,
          stepsCount: provisionalRow.stepsCount,
          activeEnergyKcal: provisionalRow.activeEnergyKcal,
          exerciseMinutes: provisionalRow.exerciseMinutes,
          restingHeartRateBpm: provisionalRow.restingHeartRateBpm,
        }
      : null,
    steps: metricView('steps_count', rows, period.start, period.end, summary.steps, recent.steps, today),
    activeEnergy: metricView('active_energy_kcal', rows, period.start, period.end, summary.activeEnergy, recent.activeEnergy, today),
    exercise: metricView('exercise_minutes', rows, period.start, period.end, summary.exercise, recent.exercise, today),
    restingHeartRate: metricView(
      'resting_heart_rate_bpm',
      rows,
      period.start,
      period.end,
      summary.restingHeartRate,
      recent.restingHeartRate,
      today,
    ),
    walkingRunningDistance: {
      summary: summary.walkingRunningDistance,
      recent: recent.walkingRunningDistance,
    },
  }
}
