import {
  activityRangeSummary,
  type ActivityDailyRow,
  type ActivityMetricSummary,
} from '../activity/analytics.js'
import { ACTIVITY_TIMEZONE, type ActivityMetricKey } from '../activity/config.js'
import { inclusiveDayCount } from './dates.js'
import { availableMetric, insufficientMetric, notApplicableMetric, type MetricResult } from './types.js'
import { percentChange } from './statistics.js'
import { sleepRangeSummary } from '../sleep/analytics.js'
import { SLEEP_SHORT_TERM_MIN_OBSERVED } from '../sleep/config.js'
import type { ProgressSleepObservation } from './health-timeline.js'

export type ActivityCompareSide = {
  selectedCalendarDays: number
  completedCalendarDays: number
  steps: ActivityMetricSummary
  activeEnergy: ActivityMetricSummary
  exercise: ActivityMetricSummary
  restingHeartRate: ActivityMetricSummary
}

export type SleepCompareSide = {
  calendarNights: number
  analysisEligibleNights: number
  coveragePct: number
  partialObservations: number
  averageTotalSleepMinutes: MetricResult<number>
  stageEligibleNights: number
  averageCoreMinutes: MetricResult<number>
  averageDeepMinutes: MetricResult<number>
  averageRemMinutes: MetricResult<number>
}

export type AverageDelta = MetricResult<{ absolute: number; percentChange: number | null }>

export type ActivitySleepPeriodCompare = {
  activity: {
    a: ActivityCompareSide
    b: ActivityCompareSide
    steps: AverageDelta
    activeEnergy: AverageDelta
    exercise: AverageDelta
    restingHeartRate: AverageDelta
  }
  sleep: {
    a: SleepCompareSide
    b: SleepCompareSide
    totalSleep: AverageDelta
    stagesComparable: boolean
  }
}

function blankActivityMetric(metric: ActivityMetricKey, calendarDays: number, applicable: boolean): ActivityMetricSummary {
  return {
    metric,
    ...(applicable ? insufficientMetric(0) : notApplicableMetric(0)),
    calendarDays,
    completedCalendarDays: applicable ? calendarDays : 0,
    observedDays: 0,
    coveragePct: 0,
  }
}

function blankActivitySide(start: string, end: string, applicable: boolean): ActivityCompareSide {
  const days = inclusiveDayCount(start, end)
  return {
    selectedCalendarDays: days,
    completedCalendarDays: applicable ? days : 0,
    steps: blankActivityMetric('steps_count', days, applicable),
    activeEnergy: blankActivityMetric('active_energy_kcal', days, applicable),
    exercise: blankActivityMetric('exercise_minutes', days, applicable),
    restingHeartRate: blankActivityMetric('resting_heart_rate_bpm', days, applicable),
  }
}

function activitySide(rows: readonly ActivityDailyRow[], start: string, end: string, today?: string): ActivityCompareSide {
  const summary = activityRangeSummary(rows, start, end, ACTIVITY_TIMEZONE, today)
  return {
    selectedCalendarDays: summary.calendarDays,
    completedCalendarDays: summary.completedCalendarDays,
    steps: summary.steps,
    activeEnergy: summary.activeEnergy,
    exercise: summary.exercise,
    restingHeartRate: summary.restingHeartRate,
  }
}

function averageDelta(left: MetricResult<number>, right: MetricResult<number>): AverageDelta {
  if (left.status !== 'available' || right.status !== 'available') {
    return insufficientMetric(Math.min(left.observations ?? 0, right.observations ?? 0))
  }
  return availableMetric(
    {
      absolute: right.value - left.value,
      percentChange: percentChange(right.value, left.value),
    },
    left.observations + right.observations,
  )
}

function sleepSide(nights: readonly ProgressSleepObservation[], start: string, end: string): SleepCompareSide {
  const summary = sleepRangeSummary(nights, start, end)
  const inRange = nights.filter((night) => night.sleepDate >= start && night.sleepDate <= end)
  return {
    calendarNights: summary.calendarNights,
    analysisEligibleNights: summary.observedSleepNights,
    coveragePct: summary.coveragePct,
    partialObservations: inRange.filter((night) => night.observationStatus === 'partial_observation').length,
    averageTotalSleepMinutes: summary.averageTotalSleepMinutes,
    stageEligibleNights: inRange.filter((night) => night.stageAnalysisEligible).length,
    averageCoreMinutes: summary.averageCoreMinutes,
    averageDeepMinutes: summary.averageDeepMinutes,
    averageRemMinutes: summary.averageRemMinutes,
  }
}

function blankSleepSide(start: string, end: string): SleepCompareSide {
  return {
    calendarNights: inclusiveDayCount(start, end),
    analysisEligibleNights: 0,
    coveragePct: 0,
    partialObservations: 0,
    averageTotalSleepMinutes: notApplicableMetric(0),
    stageEligibleNights: 0,
    averageCoreMinutes: notApplicableMetric(0),
    averageDeepMinutes: notApplicableMetric(0),
    averageRemMinutes: notApplicableMetric(0),
  }
}

export function activitySleepPeriodCompare(input: {
  activityDays: readonly ActivityDailyRow[]
  sleepNights: readonly ProgressSleepObservation[]
  periodA: { start: string; end: string }
  periodB: { start: string; end: string }
  today?: string
  intervalOnly?: boolean
}): ActivitySleepPeriodCompare {
  const nights = input.sleepNights
  const activityA = input.intervalOnly
    ? blankActivitySide(input.periodA.start, input.periodA.end, false)
    : activitySide(input.activityDays, input.periodA.start, input.periodA.end, input.today)
  const activityB = activitySide(input.activityDays, input.periodB.start, input.periodB.end, input.today)
  const sleepA = input.intervalOnly ? blankSleepSide(input.periodA.start, input.periodA.end) : sleepSide(nights, input.periodA.start, input.periodA.end)
  const sleepB = sleepSide(nights, input.periodB.start, input.periodB.end)
  const stagesComparable = input.intervalOnly
    ? sleepB.stageEligibleNights >= SLEEP_SHORT_TERM_MIN_OBSERVED
    : sleepA.stageEligibleNights >= SLEEP_SHORT_TERM_MIN_OBSERVED && sleepB.stageEligibleNights >= SLEEP_SHORT_TERM_MIN_OBSERVED
  return {
    activity: {
      a: activityA,
      b: activityB,
      steps: input.intervalOnly ? notApplicableMetric(0) : averageDelta(activityA.steps, activityB.steps),
      activeEnergy: input.intervalOnly ? notApplicableMetric(0) : averageDelta(activityA.activeEnergy, activityB.activeEnergy),
      exercise: input.intervalOnly ? notApplicableMetric(0) : averageDelta(activityA.exercise, activityB.exercise),
      restingHeartRate: input.intervalOnly ? notApplicableMetric(0) : averageDelta(activityA.restingHeartRate, activityB.restingHeartRate),
    },
    sleep: {
      a: sleepA,
      b: sleepB,
      totalSleep: input.intervalOnly ? notApplicableMetric(0) : averageDelta(sleepA.averageTotalSleepMinutes, sleepB.averageTotalSleepMinutes),
      stagesComparable,
    },
  }
}
