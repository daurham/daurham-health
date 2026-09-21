export type NutrientAmount = {
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

const GRAMS_ONLY = /^\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*$/i
const PAREN_GRAMS = /\(\s*(\d+(?:\.\d+)?)\s*g(?:rams?)?\s*\)\s*$/i

function asFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`)
  }
  return value
}

export function parseOptionalGramsFromServingText(text: string | null | undefined): number | null {
  if (text == null) {
    return null
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return null
  }
  const exact = GRAMS_ONLY.exec(trimmed)
  if (exact) {
    const grams = Number(exact[1])
    return Number.isFinite(grams) && grams > 0 ? grams : null
  }
  const parenthetical = PAREN_GRAMS.exec(trimmed)
  if (parenthetical) {
    const grams = Number(parenthetical[1])
    return Number.isFinite(grams) && grams > 0 ? grams : null
  }
  return null
}

export function scaleNutrients(base: NutrientAmount, multiplier: number): NutrientAmount {
  const factor = asFinite(multiplier, 'serving multiplier')
  if (factor < 0) {
    throw new Error('serving multiplier must be >= 0')
  }
  return {
    calories: asFinite(base.calories, 'calories') * factor,
    protein: base.protein == null ? null : asFinite(base.protein, 'protein') * factor,
    carbs: base.carbs == null ? null : asFinite(base.carbs, 'carbs') * factor,
    fat: base.fat == null ? null : asFinite(base.fat, 'fat') * factor,
    fiber: base.fiber == null ? null : asFinite(base.fiber, 'fiber') * factor,
  }
}

export function servingMultiplier(input: {
  quantity: number
  grams?: number | null
  foodServingGrams?: number | null
}): number {
  const quantity = asFinite(input.quantity, 'quantity')
  if (quantity <= 0) {
    throw new Error('quantity must be > 0')
  }
  const grams = input.grams ?? null
  const foodServingGrams = input.foodServingGrams ?? null
  if (grams != null && foodServingGrams != null) {
    if (grams <= 0 || foodServingGrams <= 0) {
      throw new Error('grams must be > 0')
    }
    return grams / foodServingGrams
  }
  return quantity
}

export function scaledGrams(input: {
  quantity: number
  grams?: number | null
  foodServingGrams?: number | null
}): number | null {
  if (input.grams != null) {
    return input.grams > 0 ? input.grams : null
  }
  if (input.foodServingGrams != null && input.foodServingGrams > 0) {
    return input.foodServingGrams * asFinite(input.quantity, 'quantity')
  }
  return null
}

export function snapshotFromDefinition(
  definition: NutrientAmount & { servingGrams?: number | null },
  input: { quantity: number; grams?: number | null },
): NutrientAmount & { grams: number | null; multiplier: number } {
  const multiplier = servingMultiplier({
    quantity: input.quantity,
    grams: input.grams,
    foodServingGrams: definition.servingGrams ?? null,
  })
  return {
    ...scaleNutrients(definition, multiplier),
    grams: scaledGrams({
      quantity: input.quantity,
      grams: input.grams,
      foodServingGrams: definition.servingGrams ?? null,
    }),
    multiplier,
  }
}
