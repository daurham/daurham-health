export const NUTRITION_EVIDENCE_QUALITIES = [
  'measured_reference',
  'owner_entered',
  'ai_estimate',
  'legacy_unknown',
] as const

export type NutritionEvidenceQuality = (typeof NUTRITION_EVIDENCE_QUALITIES)[number]

export const NUTRITION_DAY_QUALITIES = ['high_confidence', 'mixed', 'estimate_heavy', 'unknown'] as const
export type NutritionDayQualityKind = (typeof NUTRITION_DAY_QUALITIES)[number]

export type NutritionQualityEntry = {
  calories: number
  evidenceQuality?: NutritionEvidenceQuality
}

export type NutritionDayQuality = {
  kind: NutritionDayQualityKind
  entryCount: number
  knownCalories: number
  aiEstimateCalories: number
  unknownCalories: number
  aiEstimatePct: number | null
  unknownPct: number | null
}

export function nutritionDayQuality(entries: readonly NutritionQualityEntry[]): NutritionDayQuality {
  if (entries.length === 0) {
    return {
      kind: 'unknown',
      entryCount: 0,
      knownCalories: 0,
      aiEstimateCalories: 0,
      unknownCalories: 0,
      aiEstimatePct: null,
      unknownPct: null,
    }
  }
  let totalCalories = 0
  let aiEstimateCalories = 0
  let unknownCalories = 0
  for (const entry of entries) {
    const calories = Number.isFinite(entry.calories) && entry.calories > 0 ? entry.calories : 0
    totalCalories += calories
    if (entry.evidenceQuality === 'ai_estimate') aiEstimateCalories += calories
    if (entry.evidenceQuality == null || entry.evidenceQuality === 'legacy_unknown') unknownCalories += calories
  }
  const knownCalories = Math.max(0, totalCalories - unknownCalories)
  const aiEstimatePct = totalCalories > 0 ? (aiEstimateCalories / totalCalories) * 100 : null
  const unknownPct = totalCalories > 0 ? (unknownCalories / totalCalories) * 100 : null
  const kind: NutritionDayQualityKind =
    totalCalories <= 0
      ? 'mixed'
      : aiEstimateCalories / totalCalories >= 0.5
        ? 'estimate_heavy'
        : unknownCalories === 0 && aiEstimateCalories === 0
          ? 'high_confidence'
          : 'mixed'
  return {
    kind,
    entryCount: entries.length,
    knownCalories,
    aiEstimateCalories,
    unknownCalories,
    aiEstimatePct,
    unknownPct,
  }
}

export function nutritionDayQualityLabel(kind: NutritionDayQualityKind): string {
  if (kind === 'high_confidence') return 'Higher-confidence log'
  if (kind === 'estimate_heavy') return 'Estimate-heavy log'
  if (kind === 'mixed') return 'Mixed evidence'
  return 'Quality unknown'
}
