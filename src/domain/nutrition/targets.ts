import type { NutritionTarget } from './types.js'

/**
 * Effective-dated target for a calendar day.
 * Same rule as TARGET_FOR_DATE_SQL: latest effective_from on or before date.
 * Do not apply a later target retroactively.
 */
export function resolveNutritionTarget(
  targets: readonly NutritionTarget[],
  date: string,
): NutritionTarget | null {
  const applicable = targets.filter((target) => target.effectiveFrom <= date)
  if (applicable.length === 0) {
    return null
  }
  return [...applicable].sort((left, right) => {
    if (left.effectiveFrom !== right.effectiveFrom) {
      return left.effectiveFrom < right.effectiveFrom ? 1 : -1
    }
    if (left.createdAt !== right.createdAt) {
      return left.createdAt < right.createdAt ? 1 : -1
    }
    return left.id < right.id ? 1 : left.id > right.id ? -1 : 0
  })[0]!
}
