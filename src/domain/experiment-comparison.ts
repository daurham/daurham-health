import { addCalendarDays, inclusiveDayCount } from './progress/dates.js'
import { isCalendarDate } from './training.js'
import type { DailyMetricPoint, ExperimentRequirementSpec } from './experiment-results.js'

/**
 * PIQ-6.3 read-only COVERAGE screen, not an effect estimate, clinical
 * interpretation, or a replacement for canonical experiment classification.
 * Nutrition points MUST be filtered by the verified complete-day source gate
 * before this function is called; it never infers unlogged food as zero.
 */
export type ExperimentComparisonReview = {
  state: 'not_assessable' | 'insufficient_coverage' | 'descriptive_coverage'
  reason: 'no_reported_implementation' | 'invalid_implementation_date' |
    'no_primary_nutrition_outcome' | 'unsupported_primary_outcome' |
    'follow_up_in_progress' | 'insufficient_observations' | 'coverage_screen_met'
  baselineWindow: { start: string; end: string } | null
  followUpWindow: { start: string; end: string } | null
  metrics: Array<{ metricKey: string; beforeDays: number; afterDays: number;
    beforeExpected: number; afterExpected: number }>
}

const BASELINE_DAYS = 7
const MIN_OBSERVED_DAYS = 3
const MIN_COVERAGE = 0.5

function countDays(points: readonly DailyMetricPoint[], metricKey: string, start: string, end: string): number {
  return new Set(points.filter((p) =>
    p.metricKey === metricKey && isCalendarDate(p.date) &&
    p.date >= start && p.date <= end &&
    p.eligible !== false && p.value != null && Number.isFinite(p.value) && p.value >= 0,
  ).map((p) => p.date)).size
}

export function assessNutritionExperimentComparison(input: {
  reportedImplementationDate: string | null
  windowStart: string
  effectiveEndDate: string
  today: string
  requirements: readonly ExperimentRequirementSpec[]
  /** Canonically verified, non-provisional full-day nutrition records only. */
  nutrition: readonly DailyMetricPoint[]
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
  if (primary.some((r) => r.requirementKind !== 'nutrition_metric' ||
      !['calories', 'protein', 'carbs', 'fat'].includes(r.selector.metricKey ?? ''))) {
    return { ...base, reason: 'unsupported_primary_outcome' }
  }
  const beforeStart = addCalendarDays(changed, -BASELINE_DAYS)
  const beforeEnd = addCalendarDays(changed, -1)
  const afterLatest = [input.effectiveEndDate, addCalendarDays(changed, BASELINE_DAYS - 1), addCalendarDays(input.today, -1)].sort()[0]!
  const beforeWindow = { start: beforeStart, end: beforeEnd }
  if (afterLatest < changed) {
    return { ...base, reason: 'follow_up_in_progress', baselineWindow: beforeWindow }
  }
  const afterWindow = { start: changed, end: afterLatest }
  const afterExpected = inclusiveDayCount(afterWindow.start, afterWindow.end)
  const metrics = primary.map((r) => ({
    metricKey: r.selector.metricKey!,
    beforeDays: countDays(input.nutrition, r.selector.metricKey!, beforeStart, beforeEnd),
    afterDays: countDays(input.nutrition, r.selector.metricKey!, changed, afterLatest),
    beforeExpected: BASELINE_DAYS,
    afterExpected,
  }))
  const enough = metrics.every((metric) =>
    metric.beforeDays >= MIN_OBSERVED_DAYS && metric.afterDays >= MIN_OBSERVED_DAYS &&
    metric.beforeDays / metric.beforeExpected >= MIN_COVERAGE &&
    metric.afterDays / metric.afterExpected >= MIN_COVERAGE)
  return {
    state: enough ? 'descriptive_coverage' : 'insufficient_coverage',
    reason: enough ? 'coverage_screen_met' : 'insufficient_observations',
    baselineWindow: beforeWindow, followUpWindow: afterWindow, metrics,
  }
}

export function nutritionComparisonCopy(review: ExperimentComparisonReview): string {
  switch (review.reason) {
    case 'no_reported_implementation':
      return 'Before/after comparison unavailable: no current owner-confirmed behavior-change date. A Lab start date is not proof of implementation.'
    case 'invalid_implementation_date':
      return 'Before/after comparison unavailable: the reported change date is outside the valid observation window.'
    case 'no_primary_nutrition_outcome':
      return 'Before/after comparison not configured: no required primary nutrition outcome.'
    case 'unsupported_primary_outcome':
      return 'Before/after comparison is not yet supported for this primary outcome; do not infer a measured effect.'
    case 'follow_up_in_progress':
      return 'Before/after comparison not ready: the first full post-change day has not finished.'
    case 'insufficient_observations':
      return 'Before/after coverage is insufficient for a basic descriptive comparison; missing or incomplete days are not zero intake.'
    case 'coverage_screen_met':
      return 'Before/after recording coverage meets the initial descriptive screen. This does not verify adherence, comparable conditions, clinical benefit or causation.'
  }
}
