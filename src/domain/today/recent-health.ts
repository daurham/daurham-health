import { activityRangeSummary, activityShortTermChange, type ActivityDailyRow } from '../activity/analytics.js'
import { addCalendarDays } from '../progress/dates.js'
import type { ProgressSleepObservation } from '../progress/health-timeline.js'
import { sleepRangeSummary } from '../sleep/analytics.js'

export type TodayWeekPoint = { date: string; value: number | null }
export type TodayWeekMetric = {
  start: string
  end: string
  value: number | null
  observedDays: number
  points: TodayWeekPoint[]
}
export type TodayRestingHeartRateWeek = TodayWeekMetric & {
  /** Signed difference against the previous seven completed days, only when both windows meet coverage. */
  changeBpm: number | null
}

/** The seven completed Health-calendar dates preceding Today. No provisional observations. */
export function completedWeekDates(asOf: string): string[] {
  const first = addCalendarDays(asOf, -7)
  return Array.from({ length: 7 }, (_, index) => addCalendarDays(first, index))
}

export function todayWeeklyHealth(input: {
  asOf: string
  timezone: string
  activityDays: readonly ActivityDailyRow[]
  sleepNights: readonly ProgressSleepObservation[]
}): { restingHeartRate: TodayRestingHeartRateWeek; sleep: TodayWeekMetric } {
  const dates = completedWeekDates(input.asOf)
  const start = dates[0]!
  const end = dates[6]!
  const activity = activityRangeSummary(input.activityDays, start, end, input.timezone)
  const heart = activity.restingHeartRate
  // This shared comparison requires 4 observed dates in *each* seven-day window.
  const comparison = activityShortTermChange(input.activityDays, input.asOf, input.asOf).restingHeartRate
  const dailyActivity = new Map(input.activityDays.filter((day) => day.timezone === input.timezone).map((day) => [day.date, day]))
  const restingHeartRate: TodayRestingHeartRateWeek = {
    start, end,
    observedDays: heart.observedDays,
    value: heart.status === 'available' ? heart.value : null,
    changeBpm: comparison.status === 'available' ? comparison.value.absoluteDelta : null,
    points: dates.map((date) => {
      const value = dailyActivity.get(date)?.restingHeartRateBpm
      return { date, value: value != null && Number.isFinite(value) ? value : null }
    }),
  }

  const completeNights = input.sleepNights.filter(
    (night) => night.sleepDate >= start && night.sleepDate <= end &&
      night.analysisEligible && night.observationStatus !== 'partial_observation' &&
      night.totalSleepMinutes != null && Number.isFinite(night.totalSleepMinutes),
  )
  const selectedNights = new Map(completeNights.map((night) => [night.sleepDate, night]))
  const summary = sleepRangeSummary([...selectedNights.values()], start, end)
  return {
    restingHeartRate,
    sleep: {
      start, end,
      observedDays: summary.observedSleepNights,
      value: summary.averageTotalSleepMinutes.status === 'available' ? summary.averageTotalSleepMinutes.value : null,
      points: dates.map((date) => ({ date, value: selectedNights.get(date)?.totalSleepMinutes ?? null })),
    },
  }
}
