import type { ActivityProgressMetricView, ActivityProgressView } from '@/domain/activity'
import type { ProgressRange } from '@/domain/progress'
import type { MetricResult } from '@/domain/progress'
import type { SleepProgressNight, SleepProgressView } from '@/domain/sleep'
import { RANGE_HEADINGS } from './copy'
import { formatCalendarDate, formatPercent, formatSigned } from './format'

export const ACTIVITY_METRIC_OPTIONS = [
  { id: 'steps', label: 'Steps', empty: 'No step data in this range.' },
  { id: 'activeEnergy', label: 'Active energy', empty: 'No active energy data in this range.' },
  { id: 'exercise', label: 'Exercise', empty: 'No exercise data in this range.' },
  { id: 'restingHeartRate', label: 'Resting HR', empty: 'No resting heart rate data in this range.' },
] as const

export type ActivityMetricOptionId = (typeof ACTIVITY_METRIC_OPTIONS)[number]['id']

export function activityMetricOf(view: ActivityProgressView, id: ActivityMetricOptionId): ActivityProgressMetricView {
  return view[id]
}

export function formatSleepDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  const hours = Math.trunc(rounded / 60)
  const rest = Math.abs(rounded % 60)
  if (hours <= 0) {
    return `${rest}m`
  }
  if (rest === 0) {
    return `${hours}h`
  }
  return `${hours}h ${rest}m`
}

function formatWhole(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

export function activityHeadline(metric: ActivityProgressMetricView): string | null {
  if (metric.summary.status !== 'available') {
    return null
  }
  if (metric.key === 'resting_heart_rate_bpm') {
    return `${formatWhole(metric.summary.value)} bpm median`
  }
  const unit = metric.key === 'active_energy_kcal' ? ' kcal' : metric.key === 'exercise_minutes' ? ' min' : ''
  return `${formatWhole(metric.summary.value)}${unit} avg/day`
}

export function activityCoverageLine(metric: ActivityProgressMetricView): string {
  const { observedDays, calendarDays, completedCalendarDays, coveragePct } = metric.summary
  if (completedCalendarDays !== calendarDays) {
    return `${observedDays} of ${completedCalendarDays} completed days observed · ${Math.round(coveragePct)}%`
  }
  return `${observedDays} of ${calendarDays} days observed · ${Math.round(coveragePct)}%`
}

export function activityTodayLine(view: ActivityProgressView, id: ActivityMetricOptionId): string | null {
  const day = view.provisionalDay
  if (!day) {
    return null
  }
  const value =
    id === 'steps'
      ? day.stepsCount
      : id === 'activeEnergy'
        ? day.activeEnergyKcal
        : id === 'exercise'
          ? day.exerciseMinutes
          : day.restingHeartRateBpm
  if (value == null) {
    return null
  }
  const formatted = Math.round(value).toLocaleString('en-US')
  const unit = id === 'activeEnergy' ? ' kcal' : id === 'exercise' ? ' min' : id === 'restingHeartRate' ? ' bpm' : ''
  return `Today · ${formatted}${unit} so far`
}

export function activityChangeLine(metric: ActivityProgressMetricView): string | null {
  if (metric.summary.status !== 'available') {
    return null
  }
  if (metric.recent.status !== 'available') {
    return 'Not enough observed days to compare the last 7 days.'
  }
  const percent = metric.recent.value.percentDelta
  if (percent == null) {
    const unit = metric.key === 'resting_heart_rate_bpm' ? ' bpm' : metric.key === 'active_energy_kcal' ? ' kcal' : metric.key === 'exercise_minutes' ? ' min' : ''
    return `${formatSigned(metric.recent.value.absoluteDelta, 0)}${unit} vs previous 7 days`
  }
  return `${formatPercent(percent)} vs previous 7 days`
}

export function sleepCoverageLine(view: SleepProgressView): string {
  return `${view.analysisEligibleNights} of ${view.calendarNights} nights observed · ${Math.round(view.coveragePct)}% coverage`
}

export function sleepAverageHeadline(view: SleepProgressView): string | null {
  if (view.averageTotalSleepMinutes.status !== 'available') {
    return null
  }
  return `${formatSleepDuration(view.averageTotalSleepMinutes.value)} average`
}

export function sleepChangeLine(view: SleepProgressView): string | null {
  if (!view.recentAppliesToRange || view.recent.totalSleep.status !== 'available') {
    return null
  }
  const minutes = Math.round(view.recent.totalSleep.value.absoluteDelta)
  return `${formatSigned(minutes, 0)} min vs previous 7 nights`
}

const EMPTY_RANGE_COPY: Record<ProgressRange, string> = {
  '30d': 'No complete sleep observations in the last 30 days.',
  '90d': 'No complete sleep observations in the last 90 days.',
  '6m': 'No complete sleep observations in the last 6 months.',
  '1y': 'No complete sleep observations in the last year.',
  all: 'No complete sleep observations in this range.',
}

export function sleepAvailabilityCopy(view: SleepProgressView): { message: string; latest: string | null } | null {
  if (view.analysisEligibleNights > 0) {
    return null
  }
  if (!view.hasAnyNights) {
    return { message: 'No sleep data yet.', latest: null }
  }
  const latest = view.latestEligibleKnown
  return {
    message: EMPTY_RANGE_COPY[view.range],
    latest:
      latest && latest.totalSleepMinutes != null
        ? `Latest complete night: ${formatCalendarDate(latest.sleepDate)} · ${formatSleepDuration(latest.totalSleepMinutes)}`
        : null,
  }
}

export function sleepNightDurationLine(night: SleepProgressNight): string {
  if (night.status === 'analysis_eligible' && night.totalSleepMinutes != null) {
    return formatSleepDuration(night.totalSleepMinutes)
  }
  if (night.status === 'partial_observation' && night.totalSleepMinutes != null) {
    return `${formatSleepDuration(night.totalSleepMinutes)} observed`
  }
  if (night.timeInBedMinutes != null) {
    return `${formatSleepDuration(night.timeInBedMinutes)} in bed`
  }
  return 'In-bed only'
}

export function sleepNightStatusLabel(night: SleepProgressNight): string {
  if (night.status === 'analysis_eligible') {
    return 'Complete'
  }
  if (night.status === 'partial_observation') {
    return 'Partial observation'
  }
  return 'In-bed only'
}

export function activityCardCopy(view: ActivityProgressView): { primary: string; secondary: string; change: string | null; today: string | null } {
  const metric = view.steps
  const completed = metric.summary.completedCalendarDays
  const coverage =
    completed !== metric.summary.calendarDays
      ? `${metric.summary.observedDays} / ${completed} completed days observed`
      : `${metric.summary.observedDays} / ${metric.summary.calendarDays} days observed`
  if (metric.summary.status !== 'available') {
    return {
      primary: 'No step data in this range.',
      secondary: coverage,
      change: null,
      today: activityTodayLine(view, 'steps'),
    }
  }
  const change = metric.recent.status === 'available' ? activityChangeLine(metric) : null
  return {
    primary: `${formatWhole(metric.summary.value)} avg steps`,
    secondary: coverage,
    change,
    today: activityTodayLine(view, 'steps'),
  }
}

export function sleepCardCopy(view: SleepProgressView): { primary: string; secondary: string; change: string | null } {
  const availability = sleepAvailabilityCopy(view)
  if (!view.hasAnyNights) {
    return { primary: 'No sleep data yet.', secondary: 'No nights recorded.', change: null }
  }
  if (availability) {
    const latest = view.latestEligibleKnown
    return {
      primary: 'No complete nights in this range',
      secondary: latest ? `Latest complete: ${formatCalendarDate(latest.sleepDate)}` : availability.message,
      change: null,
    }
  }
  const average = view.averageTotalSleepMinutes.status === 'available' ? formatSleepDuration(view.averageTotalSleepMinutes.value) : null
  return {
    primary: average ? `${average} avg` : 'No complete nights in this range',
    secondary: `${view.analysisEligibleNights} / ${view.calendarNights} nights observed`,
    change: sleepChangeLine(view),
  }
}

export function rangeHeading(range: ProgressRange): string {
  return RANGE_HEADINGS[range]
}

export function stageAverageLine(label: string, metric: MetricResult<number>): string | null {
  if (metric.status !== 'available') {
    return null
  }
  return `${label} ${formatSleepDuration(metric.value)}`
}
