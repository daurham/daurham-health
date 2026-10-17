import { addCalendarDays, inclusiveDayCount } from './progress/dates.js'
import { isCalendarDate } from './training.js'
import type { DailyMetricPoint, ExperimentRequirementSpec } from './experiment-results.js'

/**
 * PIQ-6.3 read-only COVERAGE screen, not an effect estimate, clinical
 * interpretation, or a replacement for canonical experiment classification.
 * Nutrition points MUST be verified complete days and sleep points MUST be
 * analysis-eligible canonical nights before calling this function. It never
 * infers unlogged meals or missing nights as zero.
 */
export type ExperimentComparisonReview = {
  state: 'not_assessable' | 'insufficient_coverage' | 'descriptive_coverage'
  reason: 'no_reported_implementation' | 'invalid_implementation_date' |
    'no_primary_nutrition_outcome' | 'unsupported_primary_outcome' |
    'follow_up_in_progress' | 'insufficient_observations' |
    'inconsistent_sleep_sources' | 'coverage_screen_met'
  baselineWindow: { start: string; end: string } | null
  followUpWindow: { start: string; end: string } | null
  metrics: Array<{ requirementId: string; outcomeKind: 'nutrition_metric' | 'sleep_metric';
    metricKey: string; beforeDays: number; afterDays: number;
    beforeExpected: number; afterExpected: number }>
}

const BASELINE_DAYS = 7
const MIN_OBSERVED_DAYS = 3
const MIN_COVERAGE = 0.5

function eligibleDays(points: readonly DailyMetricPoint[], metricKey: string, start: string, end: string): DailyMetricPoint[] {
  return points.filter((p) =>
    p.metricKey === metricKey && isCalendarDate(p.date) &&
    p.date >= start && p.date <= end &&
    p.eligible !== false && p.value != null && Number.isFinite(p.value) && p.value >= 0
  )
}
function countDays(points: readonly DailyMetricPoint[], metricKey: string, start: string, end: string): number {
  return new Set(eligibleDays(points, metricKey, start, end).map((p) => p.date)).size
}

/** A device/provider switch (including missing source identity) may create an
 * apparent sleep change. Fail closed instead of comparing unlike sources. */
function consistentSleepSource(points: readonly DailyMetricPoint[], metricKey: string, before: { start: string; end: string }, after: { start: string; end: string }): boolean {
  const observed = [
    ...eligibleDays(points, metricKey, before.start, before.end),
    ...eligibleDays(points, metricKey, after.start, after.end),
  ]
  if (observed.length === 0) return true // missing nights are a coverage failure, not a source switch
  const keys = new Set(observed.map((item) => item.sourceKey))
  return keys.size === 1 && !keys.has(undefined) && !keys.has('')
}

/** Include the ENTIRE canonical experiment window, even if implementation
 * was acknowledged late. The comparison only widens the original read;
 * it must never discard earlier outcome observations. */
export function experimentComparisonLoadStart(windowStart: string, reportedChangeDate: string | null): string {
  if (!reportedChangeDate || !isCalendarDate(reportedChangeDate)) return windowStart
  const prior = addCalendarDays(reportedChangeDate, -BASELINE_DAYS)
  return prior < windowStart ? prior : windowStart
}

export function assessExperimentComparison(input: {
  reportedImplementationDate: string | null
  windowStart: string
  effectiveEndDate: string
  today: string
  requirements: readonly ExperimentRequirementSpec[]
  /** Canonically verified, non-provisional full-day nutrition records only. */
  nutrition: readonly DailyMetricPoint[]
  /** Canonical analysis-eligible sleep nights with stable provider identity. */
  sleep?: readonly DailyMetricPoint[]
}): ExperimentComparisonReview {
  const base: ExperimentComparisonReview = {
    state: 'not_assessable', reason: 'no_reported_implementation',
    baselineWindow: null, followUpWindow: null, metrics: [],
  }
  const changed = input.reportedImplementationDate
  if (!changed) return base
  if (![changed, input.windowStart, input.effectiveEndDate, input.today].every(isCalendarDate) ||
      changed < input.windowStart || changed > input.effectiveEndDate || changed > input.today) {
    return { ...base, reason: 'invalid_implementation_date' }
  }
  const primary = input.requirements.filter((r) => r.role === 'primary_outcome' && r.required)
  if (primary.length === 0) return { ...base, reason: 'no_primary_nutrition_outcome' }
  if (primary.some((r) => (
    r.requirementKind === 'nutrition_metric' ? !['calories', 'protein', 'carbs', 'fat'].includes(r.selector.metricKey ?? '') :
    r.requirementKind === 'sleep_metric' ? r.selector.metricKey !== 'total_sleep_minutes' :
    true
  ))) return { ...base, reason: 'unsupported_primary_outcome' }
  const beforeStart = addCalendarDays(changed, -BASELINE_DAYS)
  const beforeEnd = addCalendarDays(changed, -1)
  const afterLatest = [input.effectiveEndDate, addCalendarDays(changed, BASELINE_DAYS - 1), addCalendarDays(input.today, -1)].sort()[0]!
  const beforeWindow = { start: beforeStart, end: beforeEnd }
  if (afterLatest < changed) {
    return { ...base, reason: 'follow_up_in_progress', baselineWindow: beforeWindow }
  }
  const afterWindow = { start: changed, end: afterLatest }
  const afterExpected = inclusiveDayCount(afterWindow.start, afterWindow.end)
  const metrics = primary.map((r) => {
    const points = r.requirementKind === 'sleep_metric' ? input.sleep ?? [] : input.nutrition
    return {
      requirementId: r.id,
      outcomeKind: r.requirementKind as 'nutrition_metric' | 'sleep_metric',
      metricKey: r.selector.metricKey!,
      beforeDays: countDays(points, r.selector.metricKey!, beforeStart, beforeEnd),
      afterDays: countDays(points, r.selector.metricKey!, changed, afterLatest),
      beforeExpected: BASELINE_DAYS,
      afterExpected,
    }
  })
  const sleepSourcesMatch = primary.every((r) =>
    r.requirementKind !== 'sleep_metric' ||
    consistentSleepSource(input.sleep ?? [], r.selector.metricKey!, beforeWindow, afterWindow))
  const enough = metrics.every((metric) =>
    metric.beforeDays >= MIN_OBSERVED_DAYS && metric.afterDays >= MIN_OBSERVED_DAYS &&
    metric.beforeDays / metric.beforeExpected >= MIN_COVERAGE &&
    metric.afterDays / metric.afterExpected >= MIN_COVERAGE)
  return {
    state: enough && sleepSourcesMatch ? 'descriptive_coverage' : 'insufficient_coverage',
    reason: !sleepSourcesMatch ? 'inconsistent_sleep_sources' :
      enough ? 'coverage_screen_met' : 'insufficient_observations',
    baselineWindow: beforeWindow, followUpWindow: afterWindow, metrics,
  }
}

export function experimentComparisonCopy(review: ExperimentComparisonReview): string {
  switch (review.reason) {
    case 'no_reported_implementation':
      return 'Before/after comparison unavailable: no current owner-confirmed behavior-change date. A Lab start date is not proof of implementation.'
    case 'invalid_implementation_date':
      return 'Before/after comparison unavailable: the reported change date is outside the valid observation window.'
    case 'no_primary_nutrition_outcome':
      return 'Before/after comparison not configured: no required primary outcome.'
    case 'unsupported_primary_outcome':
      return 'Before/after comparison is not yet supported for this primary outcome; do not infer a measured effect.'
    case 'follow_up_in_progress':
      return 'Before/after comparison not ready: the first full post-change day has not finished.'
    case 'insufficient_observations':
      return 'Before/after coverage is insufficient for a basic descriptive comparison; missing, unverified or incomplete days and nights are not zero observations.'
    case 'inconsistent_sleep_sources':
      return 'Before/after sleep coverage cannot be compared reliably: recording sources changed or their identity was not available.'
    case 'coverage_screen_met':
      return 'Before/after recording coverage meets the initial descriptive screen. This does not verify adherence, comparable conditions, clinical benefit or causation.'
  }
}
