/**
 * PIQ-5.1: canonical Weekly Focus can be an operational task, while Coach
 * "next best" must represent a decision or evidence-grounded interpretation.
 *
 * Classify only known scheduled/logging/review tasks. Unknown new kinds are
 * left intact rather than silently suppressing genuine warnings. The task
 * itself stays in its original Training, Nutrition, Goal or Lab surface.
 */
const OPERATIONAL_WEEKLY_FOCUS_KINDS = new Set([
  'training_plan_today',
  'body_cadence',
  'benchmark_retest',
  'review_capture',
  'nutrition_coverage',
])

export function isOperationalCoachOpportunity(kind: string): boolean {
  return OPERATIONAL_WEEKLY_FOCUS_KINDS.has(kind)
}
