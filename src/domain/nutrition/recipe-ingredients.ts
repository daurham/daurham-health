export type UsdaPortionChoice = {
  label: string
  amount: number
  unit: string
  grams: number
}

export type RecipeIngredientDraft = {
  name: string
  notes: string
  yieldServings: string
  finishedWeightG: string
  lines: ReadonlyArray<{ key: string; foodId: string | null; name: string; amount: string; unit: string }>
}

export type IngredientFoodRef = {
  id: string
  name: string
}

export const COMPOSITE_FOOD_GUIDANCE =
  'This looks like a recipe or a composite meal. Add the ingredients separately, or rewrite it as one reusable food.'

export function looksLikeCompositeFoodDescription(text: string, itemCount: number): boolean {
  if (itemCount > 1) {
    return true
  }
  if (/\b(bowl|pot of|plate of)\b/i.test(text)) {
    return true
  }
  const parts = text
    .split(/,|\band\b/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  return parts.length >= 3
}

export function appendIngredientFood<T extends RecipeIngredientDraft>(
  draft: T,
  food: IngredientFoodRef,
  key: string,
): T {
  return {
    ...draft,
    lines: [
      ...draft.lines,
      { key, foodId: food.id, name: food.name, amount: '1', unit: 'serving' },
    ],
  }
}

export function scalePer100Grams(
  per100: {
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    fiber: number | null
  },
  grams: number,
): {
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
} {
  const factor = grams / 100
  const scale = (value: number | null) => (value == null ? null : value * factor)
  return {
    calories: per100.calories * factor,
    protein: scale(per100.protein),
    carbs: scale(per100.carbs),
    fat: scale(per100.fat),
    fiber: scale(per100.fiber),
  }
}

export function usdaReusableFoodNotes(fdcId: number, portionLabel: string): string {
  return [`fdc:${fdcId}`, 'USDA FoodData Central', `portion: ${portionLabel}`].join('\n').slice(0, 2000)
}

export function aiReusableFoodNotes(input: {
  text: string
  provider: string
  model: string | null
  originalCalories: number
  adjusted: boolean
}): string {
  const description = input.text.replace(/\s+/g, ' ').trim().slice(0, 500)
  const lines = [
    'AI-assisted estimate',
    `provider: ${input.provider}`,
    input.model ? `model: ${input.model.slice(0, 80)}` : null,
    `description: ${description}`,
    `original calories: ${input.originalCalories}`,
    `adjusted: ${input.adjusted ? 'yes' : 'no'}`,
  ].filter((line): line is string => line != null)
  return lines.join('\n').slice(0, 2000)
}
