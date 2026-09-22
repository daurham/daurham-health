import { addCalendarDays, inclusiveDayCount } from '../progress/dates.js'
import { percentChange } from '../progress/statistics.js'
import { availableMetric, insufficientMetric, type MetricResult } from '../progress/types.js'
import { SLEEP_SHORT_TERM_MIN_OBSERVED, SLEEP_SHORT_TERM_NIGHTS } from './config.js'
import type { SleepNightlySummary } from './summarize.js'

export type SleepSummaryNight = Pick<
  SleepNightlySummary,
  | 'sleepDate'
  | 'analysisEligible'
  | 'totalSleepMinutes'
  | 'timeInBedMinutes'
  | 'stageAnalysisEligible'
  | 'coreMinutes'
  | 'deepMinutes'
  | 'remMinutes'
  | 'unspecifiedSleepMinutes'
> & { logicalSourceKey?: string; observationStatus?: SleepNightlySummary['observationStatus'] }

export type SleepRangeSummary = {
  start: string
  end: string
  calendarNights: number
  observedSleepNights: number
  coveragePct: number
  averageTotalSleepMinutes: MetricResult<number>
  averageTimeInBedMinutes: MetricResult<number>
  averageCoreMinutes: MetricResult<number>
  averageDeepMinutes: MetricResult<number>
  averageRemMinutes: MetricResult<number>
}

export type SleepShortTermChange = {
  currentDates: string[]
  previousDates: string[]
  totalSleep: MetricResult<{
    current: number
    previous: number
    absoluteDelta: number
    percentDelta: number | null
  }>
}

function averageOf(values: readonly number[]): MetricResult<number> {
  if (values.length === 0) {
    return insufficientMetric(0)
  }
  return availableMetric(values.reduce((sum, item) => sum + item, 0) / values.length, values.length, 'observed_average')
}

function eligibleNights(nights: readonly SleepSummaryNight[]): SleepSummaryNight[] {
  return nights.filter((item) => item.analysisEligible && item.totalSleepMinutes != null)
}

function stagedNights(nights: readonly SleepSummaryNight[]): SleepSummaryNight[] {
  return nights.filter((item) => item.stageAnalysisEligible)
}

export function sleepRangeSummary(nights: readonly SleepSummaryNight[], start: string, end: string): SleepRangeSummary {
  const inRange = nights.filter((item) => item.sleepDate >= start && item.sleepDate <= end)
  const calendarNights = inclusiveDayCount(start, end)
  const observed = eligibleNights(inRange)
  const staged = stagedNights(inRange)
  return {
    start,
    end,
    calendarNights,
    observedSleepNights: observed.length,
    coveragePct: calendarNights === 0 ? 0 : (observed.length / calendarNights) * 100,
    averageTotalSleepMinutes: averageOf(observed.map((item) => item.totalSleepMinutes!)),
    averageTimeInBedMinutes: averageOf(
      inRange.filter((item) => item.timeInBedMinutes != null).map((item) => item.timeInBedMinutes!),
    ),
    averageCoreMinutes: averageOf(staged.filter((item) => item.coreMinutes != null).map((item) => item.coreMinutes!)),
    averageDeepMinutes: averageOf(staged.filter((item) => item.deepMinutes != null).map((item) => item.deepMinutes!)),
    averageRemMinutes: averageOf(staged.filter((item) => item.remMinutes != null).map((item) => item.remMinutes!)),
  }
}

export function sleepShortTermChange(nights: readonly SleepSummaryNight[]): SleepShortTermChange {
  const observed = [...eligibleNights(nights)].sort(
    (left, right) =>
      right.sleepDate.localeCompare(left.sleepDate) || (left.logicalSourceKey ?? '').localeCompare(right.logicalSourceKey ?? ''),
  )
  const current = observed.slice(0, SLEEP_SHORT_TERM_NIGHTS)
  const previous = observed.slice(SLEEP_SHORT_TERM_NIGHTS, SLEEP_SHORT_TERM_NIGHTS * 2)
  if (current.length < SLEEP_SHORT_TERM_MIN_OBSERVED || previous.length < SLEEP_SHORT_TERM_MIN_OBSERVED) {
    return {
      currentDates: current.map((item) => item.sleepDate),
      previousDates: previous.map((item) => item.sleepDate),
      totalSleep: insufficientMetric(Math.min(current.length, previous.length), SLEEP_SHORT_TERM_MIN_OBSERVED),
    }
  }
  const currentAvg = current.reduce((sum, item) => sum + item.totalSleepMinutes!, 0) / current.length
  const previousAvg = previous.reduce((sum, item) => sum + item.totalSleepMinutes!, 0) / previous.length
  return {
    currentDates: current.map((item) => item.sleepDate),
    previousDates: previous.map((item) => item.sleepDate),
    totalSleep: availableMetric(
      {
        current: currentAvg,
        previous: previousAvg,
        absoluteDelta: currentAvg - previousAvg,
        percentDelta: percentChange(currentAvg, previousAvg),
      },
      current.length + previous.length,
    ),
  }
}

export function recentSleepWindows(asOf: string): { currentStart: string; currentEnd: string; previousStart: string; previousEnd: string } {
  const currentEnd = asOf
  const currentStart = addCalendarDays(asOf, -(SLEEP_SHORT_TERM_NIGHTS - 1))
  const previousEnd = addCalendarDays(currentStart, -1)
  const previousStart = addCalendarDays(previousEnd, -(SLEEP_SHORT_TERM_NIGHTS - 1))
  return { currentStart, currentEnd, previousStart, previousEnd }
}
