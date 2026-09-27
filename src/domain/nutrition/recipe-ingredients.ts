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

export function usdaExternalId(fdcId: number): string {
  return String(fdcId)
}

function jsonServingNumber(value: number): string {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return JSON.stringify(rounded)
}

export function usdaServingFingerprint(input: {
  fdcId: number
  amount: number
  unit: string
  grams: number
}): string {
  const body = `{"amount":${jsonServingNumber(input.amount)},"fdcId":${input.fdcId},"grams":${jsonServingNumber(input.grams)},"unit":${JSON.stringify(input.unit.trim().toLowerCase())}}`
  return `usda-fdc-serving-v1|${body}`
}

export function stripUsdaMachineNotes(notes: string | null): string | null {
  if (notes == null) {
    return null
  }
  if (/^fdc:\d+$/.test(notes)) {
    return null
  }
  const generated = notes.match(/^fdc:\d+\nUSDA FoodData Central\nportion: [^\n]+(?:\n([\s\S]*))?$/)
  if (generated) {
    const rest = generated[1]?.trim() ?? ''
    return rest.length > 0 ? rest : null
  }
  if (/^fdc:\d+\n/.test(notes)) {
    const rest = notes.replace(/^fdc:\d+\n/, '').trim()
    return rest.length > 0 ? rest : null
  }
  return notes
}

export function stripUsdaMachineBrand(brand: string | null, portionLabel: string | null): string | null {
  if (brand == null) {
    return null
  }
  if (/ · fdc \d+$/.test(brand)) {
    return null
  }
  if (portionLabel != null && brand === portionLabel) {
    return null
  }
  return brand
}

export function descriptionFoodFingerprint(input: {
  text: string
  name: string
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
  calories: number
}): string {
  const body = JSON.stringify({
    calories: input.calories,
    grams: input.servingGrams,
    name: input.name.trim().toLowerCase(),
    quantity: input.servingQuantity,
    text: input.text.trim().toLowerCase().replace(/\s+/g, ' '),
    unit: input.servingUnit.trim().toLowerCase(),
  })
  return `nutrition-reusable-description-v1|${body}`
}

export function descriptionFoodProvenance(input: {
  text: string
  provider: string
  model: string | null
  originalCalories: number
  adjusted: boolean
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
}): Record<string, unknown> {
  return {
    source: 'description_ai',
    inputKind: 'description',
    provider: input.provider,
    model: input.model ? input.model.slice(0, 80) : null,
    originalDescription: input.text.replace(/\s+/g, ' ').trim().slice(0, 500),
    originalEstimate: { calories: input.originalCalories },
    reviewed: {
      name: input.name,
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
      servingQuantity: input.servingQuantity,
      servingUnit: input.servingUnit,
      servingGrams: input.servingGrams,
    },
    userAdjusted: input.adjusted,
  }
}

export function usdaFoodOrigin(
  food: {
    sourceKind: string
    servingQuantity: number
    servingUnit: string
    servingGrams: number | null
  },
  link: { externalId: string; sourceKey: string } | null,
): { source: string; fdcId: string; serving: string } | null {
  if (food.sourceKind !== 'usda' || link == null || link.sourceKey !== 'usda_fooddata_central') {
    return null
  }
  const weight = food.servingGrams == null ? '' : ` / ${food.servingGrams} g`
  return {
    source: 'USDA FoodData Central',
    fdcId: link.externalId,
    serving: `${food.servingQuantity} ${food.servingUnit}${weight}`,
  }
}
