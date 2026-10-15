import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'
import type { NutritionPeriodSummary } from '../progress/nutrition.js'

export const MIN_VERIFIED_NUTRITION_TARGET_DAYS = 4

/** No additional SQL or AI call: use the already revision-verified intelligence frame.
 * Guard against a mismatch between independently loaded progress rows and the
 * intelligence read before using those confirmations in the Ask Health packet.
 */
export type AskNutritionIntegrity = {
  status: 'available' | 'unavailable'
  verifiedCompleteDays: number | null
  verifiedTargetDays: number
  verifiedAverageTargetDifference: number | null
}

export function askNutritionIntegrityFromSnapshot(input: {
  nutrition: NutritionPeriodSummary
  intelligence: HealthIntelligenceSnapshot
  today: string
}): AskNutritionIntegrity {
  const status = input.intelligence.coverage.find((c) => c.key === 'nutrition.calories')?.completenessCheck
  if (status !== 'available') {
    return { status: 'unavailable', verifiedCompleteDays: null, verifiedTargetDays: 0, verifiedAverageTargetDifference: null }
  }
  const frame = new Map(input.intelligence.frame.map((day) => [day.date, day]))
  let verifiedCompleteDays = 0
  const differences: number[] = []
  for (const day of input.nutrition.observations) {
    if (day.date >= input.today) continue // current calendar date remains provisional
    const calorie = day.calories.status === 'available' ? day.calories.value : null
    if (calorie == null || !Number.isFinite(calorie)) continue
    const source = frame.get(day.date)?.signals['nutrition.calories']
    if (!source || source.dayCompleteness !== 'verified_complete' ||
        source.quality !== 'high_confidence' ||
        !Number.isFinite(source.value) || Math.abs(source.value - calorie) > 0.00001) continue
    const expected = [...source.sourceIds].sort()
    const actual = [...day.evidence.entryIds].sort()
    if (expected.length === 0 || expected.length !== actual.length ||
        new Set(expected).size !== expected.length ||
        expected.some((id, i) => id !== actual[i])) continue
    verifiedCompleteDays++
    if (day.target?.calories != null && Number.isFinite(day.target.calories)) {
      differences.push(calorie - day.target.calories)
    }
  }
  return {
    status: 'available',
    verifiedCompleteDays,
    verifiedTargetDays: differences.length,
    verifiedAverageTargetDifference: differences.length === 0
      ? null : differences.reduce((sum, value) => sum + value, 0) / differences.length,
  }
}
