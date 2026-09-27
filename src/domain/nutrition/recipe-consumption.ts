import { scaleNutrients } from './servings.js'

export const RECIPE_PORTION_KINDS = ['servings', 'fraction', 'grams'] as const
export type RecipePortionKind = (typeof RECIPE_PORTION_KINDS)[number]

export type RecipePortionBasis = {
  version: number
  name: string
  caloriesKcal: number
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  yieldServings: number | null
  finishedWeightG: number | null
}

export type LoggableRecipeVersion = RecipePortionBasis & {
  recipeId: string
  recipeVersionId: string
}

export type ResolvedRecipePortion = {
  kind: RecipePortionKind
  amount: number
  fraction: number
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  description: string
  servingQuantity: number
  servingUnit: string
  grams: number | null
}

export type RecipePortionError = {
  error: string
  code: 'unknown_kind' | 'invalid_amount' | 'unavailable_servings' | 'unavailable_grams'
}

export function matchCurrentRecipes<T extends { name: string }>(recipes: readonly T[], query: string): T[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) return []
  return recipes
    .filter((recipe) => recipe.name.toLowerCase().includes(needle))
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name) || 0)
}

export function recipePortionDescription(input: { kind: RecipePortionKind; amount: number; version: number }): string {
  const amountLabel = formatPortionAmount(input.amount)
  const versionLabel = `Recipe v${input.version}`
  if (input.kind === 'servings') {
    const unit = input.amount === 1 ? 'serving' : 'servings'
    return `${amountLabel} ${unit} · ${versionLabel}`
  }
  if (input.kind === 'grams') return `${amountLabel} g · ${versionLabel}`
  return `${amountLabel} recipe · ${versionLabel}`
}

export function resolveRecipePortion(
  version: RecipePortionBasis,
  kind: string,
  amount: number,
): ResolvedRecipePortion | RecipePortionError {
  if (!RECIPE_PORTION_KINDS.includes(kind as RecipePortionKind)) {
    return { error: 'Portion kind must be servings, fraction, or grams.', code: 'unknown_kind' }
  }
  const portionKind = kind as RecipePortionKind
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Amount must be greater than zero.', code: 'invalid_amount' }
  }
  let fraction: number
  if (portionKind === 'servings') {
    if (version.yieldServings == null || version.yieldServings <= 0) {
      return { error: 'Servings are unavailable because this Recipe Version has no yield.', code: 'unavailable_servings' }
    }
    fraction = amount / version.yieldServings
  } else if (portionKind === 'grams') {
    if (version.finishedWeightG == null || version.finishedWeightG <= 0) {
      return { error: 'Grams are unavailable because this Recipe Version has no finished weight.', code: 'unavailable_grams' }
    }
    fraction = amount / version.finishedWeightG
  } else {
    fraction = amount
  }
  const scaled = scaleNutrients(
    {
      calories: version.caloriesKcal,
      protein: version.proteinG,
      carbs: version.carbsG,
      fat: version.fatG,
      fiber: null,
    },
    fraction,
  )
  const description = recipePortionDescription({ kind: portionKind, amount, version: version.version })
  const servingUnit =
    portionKind === 'servings'
      ? `${amount === 1 ? 'serving' : 'servings'} · Recipe v${version.version}`
      : portionKind === 'grams'
        ? `g · Recipe v${version.version}`
        : `recipe · Recipe v${version.version}`
  return {
    kind: portionKind,
    amount,
    fraction,
    calories: scaled.calories,
    protein: scaled.protein,
    carbs: scaled.carbs,
    fat: scaled.fat,
    description,
    servingQuantity: amount,
    servingUnit,
    grams: portionKind === 'grams' ? amount : null,
  }
}

export function recipeDefinedAverageGrams(version: RecipePortionBasis): number | null {
  if (version.yieldServings == null || version.finishedWeightG == null) return null
  if (version.yieldServings <= 0 || version.finishedWeightG <= 0) return null
  return version.finishedWeightG / version.yieldServings
}

function formatPortionAmount(value: number): string {
  if (Number.isInteger(value)) return String(value)
  const rounded = Math.round(value * 10000) / 10000
  return String(rounded)
}
