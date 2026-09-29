export const RECIPE_CALCULATION_VERSION = 'recipe-v1'

const NAME_MAX = 200
const NOTES_MAX = 2000
const UNIT_MAX = 80

const MASS_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
}

export type RecipeFoodBasis = {
  id: string
  name: string
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sodium: number | null
  sourceKind: string | null
  barcode: string | null
  archived?: boolean
}

export type RecipeIngredientDraft = {
  foodId: string
  amount: number
  unit: string
}

export type RecipeLine = {
  position: number
  foodId: string | null
  amount: number
  unit: string
  scaleFactor: number
  foodNameSnapshot: string
  foodSourceTypeSnapshot: string | null
  foodSourceExternalIdSnapshot: string | null
  baseServingAmountSnapshot: number | null
  baseServingUnitSnapshot: string | null
  baseWeightGramsSnapshot: number | null
  baseCaloriesKcalSnapshot: number
  baseProteinGSnapshot: number | null
  baseCarbsGSnapshot: number | null
  baseFatGSnapshot: number | null
  baseFiberGSnapshot: number | null
  baseSodiumMgSnapshot: number | null
  lineCaloriesKcal: number
  lineProteinG: number | null
  lineCarbsG: number | null
  lineFatG: number | null
  lineFiberG: number | null
  lineSodiumMg: number | null
}

export type ComposedRecipe = {
  name: string
  notes: string | null
  yieldServings: number | null
  finishedWeightG: number | null
  caloriesKcal: number
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sodiumMg: number | null
  calculationVersion: typeof RECIPE_CALCULATION_VERSION
  ingredients: RecipeLine[]
}

export function normalizeRecipeUnit(unit: string): string {
  return unit.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function resolveIngredientScale(
  food: Pick<RecipeFoodBasis, 'servingQuantity' | 'servingUnit' | 'servingGrams'>,
  amount: number,
  unit: string,
): { scaleFactor: number } | { error: string } {
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: 'Ingredient amount must be greater than zero.' }
  }
  const requested = normalizeRecipeUnit(unit)
  if (!requested || requested.length > UNIT_MAX) {
    return { error: 'Ingredient unit is required.' }
  }
  if (requested === 'serving' || requested === 'servings') {
    return { scaleFactor: amount }
  }
  const gramsEach = MASS_GRAMS[requested]
  if (gramsEach != null) {
    if (food.servingGrams == null || !(food.servingGrams > 0)) {
      return { error: 'That food has no weight basis, so a weight amount cannot be used.' }
    }
    return { scaleFactor: (amount * gramsEach) / food.servingGrams }
  }
  const foodUnit = normalizeRecipeUnit(food.servingUnit)
  if (foodUnit && requested === foodUnit) {
    if (!(food.servingQuantity > 0)) {
      return { error: 'That food has no serving amount.' }
    }
    return { scaleFactor: amount / food.servingQuantity }
  }
  return { error: 'That unit cannot be converted for this food.' }
}

export function composeRecipe(input: {
  name: string
  notes: string | null
  yieldServings: number | null
  finishedWeightG: number | null
  ingredients: Array<{ food: RecipeFoodBasis; amount: number; unit: string }>
}): ComposedRecipe | { error: string } {
  const name = input.name.trim()
  if (!name) return { error: 'Recipe name is required.' }
  if (name.length > NAME_MAX) return { error: 'Recipe name must be 200 characters or fewer.' }
  const notes = input.notes?.trim() ? input.notes.trim() : null
  if (notes && notes.length > NOTES_MAX) return { error: 'Recipe notes must be 2000 characters or fewer.' }
  if (input.yieldServings != null && (!(input.yieldServings > 0) || !Number.isFinite(input.yieldServings))) {
    return { error: 'Servings must be greater than zero.' }
  }
  if (input.finishedWeightG != null && (!(input.finishedWeightG > 0) || !Number.isFinite(input.finishedWeightG))) {
    return { error: 'Finished weight must be greater than zero.' }
  }
  if (input.ingredients.length === 0) return { error: 'A recipe needs at least one ingredient.' }
  const lines: RecipeLine[] = []
  for (const [index, ingredient] of input.ingredients.entries()) {
    if (ingredient.food.archived) return { error: 'Archived foods cannot be added to a recipe.' }
    const scale = resolveIngredientScale(ingredient.food, ingredient.amount, ingredient.unit)
    if ('error' in scale) return scale
    const baseCalories = ingredient.food.calories
    const baseProtein = ingredient.food.protein
    const baseCarbs = ingredient.food.carbs
    const baseFat = ingredient.food.fat
    const baseFiber = ingredient.food.fiber
    const baseSodium = ingredient.food.sodium
    lines.push({
      position: index + 1,
      foodId: ingredient.food.id,
      amount: ingredient.amount,
      unit: ingredient.unit.trim(),
      scaleFactor: scale.scaleFactor,
      foodNameSnapshot: ingredient.food.name,
      foodSourceTypeSnapshot: ingredient.food.sourceKind,
      foodSourceExternalIdSnapshot: ingredient.food.barcode,
      baseServingAmountSnapshot: ingredient.food.servingQuantity,
      baseServingUnitSnapshot: ingredient.food.servingUnit,
      baseWeightGramsSnapshot: ingredient.food.servingGrams,
      baseCaloriesKcalSnapshot: baseCalories,
      baseProteinGSnapshot: baseProtein,
      baseCarbsGSnapshot: baseCarbs,
      baseFatGSnapshot: baseFat,
      baseFiberGSnapshot: baseFiber,
      baseSodiumMgSnapshot: baseSodium,
      lineCaloriesKcal: baseCalories * scale.scaleFactor,
      lineProteinG: baseProtein == null ? null : baseProtein * scale.scaleFactor,
      lineCarbsG: baseCarbs == null ? null : baseCarbs * scale.scaleFactor,
      lineFatG: baseFat == null ? null : baseFat * scale.scaleFactor,
      lineFiberG: baseFiber == null ? null : baseFiber * scale.scaleFactor,
      lineSodiumMg: baseSodium == null ? null : baseSodium * scale.scaleFactor,
    })
  }
  return {
    name,
    notes,
    yieldServings: input.yieldServings,
    finishedWeightG: input.finishedWeightG,
    caloriesKcal: lines.reduce((sum, line) => sum + line.lineCaloriesKcal, 0),
    proteinG: sumKnown(lines.map((line) => line.lineProteinG)),
    carbsG: sumKnown(lines.map((line) => line.lineCarbsG)),
    fatG: sumKnown(lines.map((line) => line.lineFatG)),
    fiberG: sumKnown(lines.map((line) => line.lineFiberG)),
    sodiumMg: sumKnown(lines.map((line) => line.lineSodiumMg)),
    calculationVersion: RECIPE_CALCULATION_VERSION,
    ingredients: lines,
  }
}

const FORBIDDEN_KEYS = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium', 'scaleFactor', 'caloriesKcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sodiumMg']

export function recipeFoodIds(body: unknown): string[] | { error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Recipe content is required.' }
  }
  const record = body as Record<string, unknown>
  if (forbiddenKey(record)) return { error: 'Recipe nutrition comes from the foods, not the request.' }
  if (!Array.isArray(record.ingredients) || record.ingredients.length === 0) {
    return { error: 'A recipe needs at least one ingredient.' }
  }
  const ids: string[] = []
  for (const item of record.ingredients) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Each ingredient needs a food, amount, and unit.' }
    }
    const line = item as Record<string, unknown>
    if (forbiddenKey(line)) return { error: 'Recipe nutrition comes from the foods, not the request.' }
    if (typeof line.foodId !== 'string' || line.foodId.trim() === '') {
      return { error: 'That food was not found.' }
    }
    ids.push(line.foodId)
  }
  return ids
}

export function supportedDisplayUnits(input: {
  baseServingUnitSnapshot: string | null
  baseWeightGramsSnapshot: number | null
}): string[] {
  const units = ['serving', 'servings']
  const foodUnit = normalizeRecipeUnit(input.baseServingUnitSnapshot ?? '')
  if (foodUnit && foodUnit !== 'serving' && foodUnit !== 'servings' && MASS_GRAMS[foodUnit] == null) {
    units.push((input.baseServingUnitSnapshot ?? foodUnit).trim())
  }
  if (input.baseWeightGramsSnapshot != null && input.baseWeightGramsSnapshot > 0) {
    units.push('g', 'oz', 'lb')
  }
  return units
}

export function parseRecipeCreate(
  body: unknown,
  foods: ReadonlyMap<string, RecipeFoodBasis>,
): ComposedRecipe | { error: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Recipe content is required.' }
  }
  const record = body as Record<string, unknown>
  const forbidden = forbiddenKey(record)
  if (forbidden) return { error: 'Recipe nutrition comes from the foods, not the request.' }
  if (!Array.isArray(record.ingredients) || record.ingredients.length === 0) {
    return { error: 'A recipe needs at least one ingredient.' }
  }
  const ingredients = []
  for (const item of record.ingredients) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Each ingredient needs a food, amount, and unit.' }
    }
    const line = item as Record<string, unknown>
    if (forbiddenKey(line)) return { error: 'Recipe nutrition comes from the foods, not the request.' }
    const foodId = typeof line.foodId === 'string' ? line.foodId : ''
    const food = foods.get(foodId)
    if (!food) return { error: 'That food was not found.' }
    const amount = typeof line.amount === 'number' ? line.amount : Number(line.amount)
    const unit = typeof line.unit === 'string' ? line.unit : ''
    ingredients.push({ food, amount, unit })
  }
  const yieldServings = optionalPositive(record.yieldServings, 'Servings')
  if (typeof yieldServings === 'string') return { error: yieldServings }
  const finishedWeightG = optionalPositive(record.finishedWeightG, 'Finished weight')
  if (typeof finishedWeightG === 'string') return { error: finishedWeightG }
  return composeRecipe({
    name: typeof record.name === 'string' ? record.name : '',
    notes: typeof record.notes === 'string' ? record.notes : null,
    yieldServings,
    finishedWeightG,
    ingredients,
  })
}

function optionalPositive(value: unknown, label: string): number | null | string {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return `${label} must be greater than zero.`
  return parsed
}

function forbiddenKey(record: Record<string, unknown>): boolean {
  return FORBIDDEN_KEYS.some((key) => key in record)
}

function sumKnown(values: Array<number | null>): number | null {
  let sum = 0
  for (const value of values) {
    if (value == null) return null
    sum += value
  }
  return sum
}
