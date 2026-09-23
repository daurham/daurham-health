export type TodayNutritionOutcome = 'consumed' | 'saved_for_later'

export function todayShouldReloadAfterNutrition(outcome: TodayNutritionOutcome): boolean {
  return outcome === 'consumed'
}
