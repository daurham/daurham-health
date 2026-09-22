import { addCalendarDays } from '../progress/dates.js'
import { trailingPeriod } from '../progress/periods.js'
import { availableMetric, insufficientMetric, type MetricResult, type ProgressRange } from '../progress/types.js'
import { sleepRangeSummary, sleepShortTermChange, type SleepShortTermChange } from './analytics.js'
import type { SleepObservationStatus, SleepSelectionReason } from './completeness.js'
import { SLEEP_TIMEZONE } from './config.js'
import { compareSleepSourcePriority } from './sources.js'
import type { SleepNightlySummary } from './summarize.js'

export type SleepProgressNight = {
  sleepDate: string
  sourceName: string
  startAt: string
  endAt: string
  timezone: string
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
  awakeMinutes: number | null
  coreMinutes: number | null
  deepMinutes: number | null
  remMinutes: number | null
  unspecifiedSleepMinutes: number | null
  status: SleepObservationStatus
  analysisEligible: boolean
  stageAnalysisEligible: boolean
  stageCoveragePct: number | null
  selectionReason: SleepSelectionReason
  overrideExplanation: string | null
}

export type SleepChartPoint = {
  date: string
  eligibleMinutes: number | null
  partialMinutes: number | null
}

export type SleepProgressView = {
  range: ProgressRange
  asOf: string
  start: string
  end: string
  timezone: string
  calendarNights: number
  analysisEligibleNights: number
  coveragePct: number
  hasAnyNights: boolean
  averageTotalSleepMinutes: MetricResult<number>
  latestEligibleInRange: SleepProgressNight | null
  latestEligibleKnown: SleepProgressNight | null
  recent: SleepShortTermChange
  recentAppliesToRange: boolean
  stageEligibleNights: number
  averageCoreMinutes: MetricResult<number>
  averageDeepMinutes: MetricResult<number>
  averageRemMinutes: MetricResult<number>
  averageUnspecifiedMinutes: MetricResult<number>
  series: SleepChartPoint[]
  recentNights: SleepProgressNight[]
}

const RECENT_NIGHT_LIMIT = 14

export function sleepOverrideExplanation(night: SleepNightlySummary): string | null {
  if (night.selectionReason !== 'completeness_override') {
    return null
  }
  const eligible = night.evidence.alternatives.filter((item) => item.status === 'analysis_eligible' && item.sourceName.trim() !== '')
  const preferred = [...eligible].sort((left, right) => compareSleepSourcePriority(left.logicalSourceKey, right.logicalSourceKey))[0]
  if (!preferred) {
    return null
  }
  return `${night.sourceName} was used because the ${preferred.sourceName} observation was substantially incomplete.`
}

export function toSleepProgressNight(night: SleepNightlySummary): SleepProgressNight {
  return {
    sleepDate: night.sleepDate,
    sourceName: night.sourceName,
    startAt: night.startAt,
    endAt: night.endAt,
    timezone: night.timezone,
    totalSleepMinutes: night.totalSleepMinutes,
    timeInBedMinutes: night.timeInBedMinutes,
    awakeMinutes: night.awakeMinutes,
    coreMinutes: night.coreMinutes,
    deepMinutes: night.deepMinutes,
    remMinutes: night.remMinutes,
    unspecifiedSleepMinutes: night.unspecifiedSleepMinutes,
    status: night.observationStatus,
    analysisEligible: night.analysisEligible,
    stageAnalysisEligible: night.stageAnalysisEligible,
    stageCoveragePct: night.stageCoveragePct,
    selectionReason: night.selectionReason,
    overrideExplanation: sleepOverrideExplanation(night),
  }
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

function averageMinutes(values: readonly number[]): MetricResult<number> {
  if (values.length === 0) {
    return insufficientMetric(0)
  }
  return availableMetric(values.reduce((sum, item) => sum + item, 0) / values.length, values.length, 'observed_average')
}

export function buildSleepProgressView(
  nights: readonly SleepNightlySummary[],
  input: { range: ProgressRange; asOf: string },
): SleepProgressView {
  const owned = nights.filter((night) => night.timezone === SLEEP_TIMEZONE && night.sleepDate <= input.asOf)
  const earliest = owned.reduce<string | null>((min, night) => (min == null || night.sleepDate < min ? night.sleepDate : min), null)
  const period = trailingPeriod(input.range, input.asOf, earliest)
  const inRange = owned.filter((night) => night.sleepDate >= period.start && night.sleepDate <= period.end)
  const summary = sleepRangeSummary(owned, period.start, period.end)
  const recent = sleepShortTermChange(owned)
  const staged = inRange.filter((night) => night.stageAnalysisEligible)
  const eligibleKnown = [...owned]
    .filter((night) => night.analysisEligible && night.totalSleepMinutes != null)
    .sort((left, right) => right.sleepDate.localeCompare(left.sleepDate))
  const latestKnown = eligibleKnown[0] ?? null
  const latestInRange = eligibleKnown.find((night) => night.sleepDate >= period.start && night.sleepDate <= period.end) ?? null
  const byDate = new Map(inRange.map((night) => [night.sleepDate, night]))
  const recentAppliesToRange =
    recent.totalSleep.status === 'available' &&
    summary.observedSleepNights > 0 &&
    recent.currentDates.some((date) => date >= period.start && date <= period.end)
  return {
    range: input.range,
    asOf: input.asOf,
    start: period.start,
    end: period.end,
    timezone: SLEEP_TIMEZONE,
    calendarNights: summary.calendarNights,
    analysisEligibleNights: summary.observedSleepNights,
    coveragePct: summary.coveragePct,
    hasAnyNights: owned.length > 0,
    averageTotalSleepMinutes: summary.averageTotalSleepMinutes,
    latestEligibleInRange: latestInRange ? toSleepProgressNight(latestInRange) : null,
    latestEligibleKnown: latestKnown ? toSleepProgressNight(latestKnown) : null,
    recent,
    recentAppliesToRange,
    stageEligibleNights: staged.length,
    averageCoreMinutes: summary.averageCoreMinutes,
    averageDeepMinutes: summary.averageDeepMinutes,
    averageRemMinutes: summary.averageRemMinutes,
    averageUnspecifiedMinutes: averageMinutes(
      staged.filter((night) => night.unspecifiedSleepMinutes != null).map((night) => night.unspecifiedSleepMinutes!),
    ),
    series: datesThrough(period.start, period.end).map((date) => {
      const night = byDate.get(date)
      const minutes = night?.totalSleepMinutes
      const eligible = night?.analysisEligible === true && typeof minutes === 'number' ? minutes : null
      const partial = night?.observationStatus === 'partial_observation' && typeof minutes === 'number' ? minutes : null
      return { date, eligibleMinutes: eligible, partialMinutes: partial }
    }),
    recentNights: [...inRange]
      .sort((left, right) => right.sleepDate.localeCompare(left.sleepDate))
      .slice(0, RECENT_NIGHT_LIMIT)
      .map(toSleepProgressNight),
  }
}
