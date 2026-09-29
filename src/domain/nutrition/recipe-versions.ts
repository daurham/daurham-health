import {
  composeRecipe,
  normalizeRecipeUnit,
  RECIPE_CALCULATION_VERSION,
  type ComposedRecipe,
  type RecipeFoodBasis,
  type RecipeLine,
} from './recipes.js'

export const RECIPE_STALE_VERSION = 'stale_version'
export const RECIPE_STALE_PREVIEW = 'stale_preview'
export const RECIPE_NO_CHANGES = 'no_changes'
export const RECIPE_ARCHIVED = 'archived'
export const RECIPE_MISSING_FOOD = 'missing_food'

export type RecipeChangeCategory =
  | 'added'
  | 'removed'
  | 'reordered'
  | 'amount_changed'
  | 'unit_changed'
  | 'food_replaced'
  | 'food_basis_changed'
  | 'unchanged'
  | 'unresolved'

export type RecipeBasisView = {
  name: string
  servingQuantity: number | null
  servingUnit: string | null
  servingGrams: number | null
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sodiumMg: number | null
}

export type RecipeVersionSnapshot = {
  id: string
  version: number
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
  calculationVersion: string
  ingredients: RecipeLine[]
}

export type RecipeDraftIngredient = {
  foodId: string | null
  amount: number
  unit: string
}

export type RecipeDraft = {
  sourceVersionId: string
  previewFingerprint: string | null
  name: string
  notes: string | null
  yieldServings: number | null
  finishedWeightG: number | null
  ingredients: RecipeDraftIngredient[]
}

export type RecipeIngredientChange = {
  categories: RecipeChangeCategory[]
  foodId: string | null
  name: string
  position: number | null
  previousPosition: number | null
  from: { amount: number; unit: string; basis: RecipeBasisView } | null
  to: { amount: number; unit: string; basis: RecipeBasisView } | null
}

export type RecipeNutrition = {
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sodiumMg: number | null
}

export type RecipeVersionPreview = {
  status: 'ready' | 'no_changes' | 'blocked'
  sourceVersionId: string
  currentVersion: number
  candidateVersionNumber: number
  metadataChanges: Array<{ field: 'name' | 'notes'; from: string | null; to: string | null }>
  yieldChanges: Array<{ field: 'yieldServings' | 'finishedWeightG'; from: number | null; to: number | null }>
  ingredientChanges: RecipeIngredientChange[]
  ingredientBasisChanges: RecipeIngredientChange[]
  currentWholeNutrition: RecipeNutrition
  candidateWholeNutrition: RecipeNutrition | null
  nutritionDelta: RecipeNutrition
  warnings: string[]
  canCommit: boolean
  previewFingerprint: string | null
  candidate: ComposedRecipe | null
}

export function parseRecipeDraft(body: unknown, requireFingerprint: boolean): RecipeDraft | { error: string; code?: string } {
  if (body == null || typeof body !== 'object' || Array.isArray(body)) return { error: 'Recipe content is required.' }
  const record = body as Record<string, unknown>
  if (forbiddenRecipeKey(record)) return { error: 'Recipe nutrition comes from the foods, not the request.' }
  if (typeof record.sourceVersionId !== 'string' || record.sourceVersionId.trim() === '') {
    return { error: 'Recipe changed since editing began.', code: RECIPE_STALE_VERSION }
  }
  const fingerprint = typeof record.previewFingerprint === 'string' ? record.previewFingerprint : null
  if (requireFingerprint && !fingerprint) {
    return { error: 'Recipe ingredients changed since preview.', code: RECIPE_STALE_PREVIEW }
  }
  if (!Array.isArray(record.ingredients) || record.ingredients.length === 0) {
    return { error: 'A recipe needs at least one ingredient.' }
  }
  const ingredients: RecipeDraftIngredient[] = []
  for (const item of record.ingredients) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      return { error: 'Each ingredient needs a food, amount, and unit.' }
    }
    const line = item as Record<string, unknown>
    if (forbiddenRecipeKey(line)) return { error: 'Recipe nutrition comes from the foods, not the request.' }
    const foodId = typeof line.foodId === 'string' && line.foodId.trim() ? line.foodId : null
    const amount = typeof line.amount === 'number' ? line.amount : Number.NaN
    const unit = typeof line.unit === 'string' ? line.unit : ''
    if (foodId && (!Number.isFinite(amount) || amount <= 0)) return { error: 'Ingredient amount must be greater than zero.' }
    ingredients.push({ foodId, amount: Number.isFinite(amount) ? amount : 0, unit })
  }
  const yieldServings = optionalPositive(record.yieldServings, 'Servings')
  if (typeof yieldServings === 'string') return { error: yieldServings }
  const finishedWeightG = optionalPositive(record.finishedWeightG, 'Finished weight')
  if (typeof finishedWeightG === 'string') return { error: finishedWeightG }
  const name = typeof record.name === 'string' ? record.name : ''
  if (!name.trim()) return { error: 'Recipe name is required.' }
  return {
    sourceVersionId: record.sourceVersionId,
    previewFingerprint: fingerprint,
    name,
    notes: typeof record.notes === 'string' ? record.notes : null,
    yieldServings,
    finishedWeightG,
    ingredients,
  }
}

export function previewRecipeVersion(input: {
  recipeId: string
  current: RecipeVersionSnapshot
  draft: RecipeDraft
  foods: ReadonlyMap<string, RecipeFoodBasis>
}): RecipeVersionPreview | { error: string } {
  const unresolved = input.draft.ingredients.some((line) => line.foodId == null)
  const resolved = []
  for (const line of input.draft.ingredients) {
    if (line.foodId == null) continue
    const food = input.foods.get(line.foodId)
    if (!food) return { error: 'That food was not found.' }
    resolved.push({ food, amount: line.amount, unit: line.unit })
  }
  const composed = unresolved
    ? null
    : composeRecipe({
        name: input.draft.name,
        notes: input.draft.notes,
        yieldServings: input.draft.yieldServings,
        finishedWeightG: input.draft.finishedWeightG,
        ingredients: resolved,
      })
  if (composed && 'error' in composed) return composed
  const candidate = composed
  const ingredientChanges = pairIngredientChanges(input.current.ingredients, input.draft, input.foods, candidate)
  const metadataChanges = metadataDiff(input.current, candidate, input.draft)
  const yieldChanges = yieldDiff(input.current, candidate, input.draft)
  const basisChanges = ingredientChanges.filter((change) => change.categories.includes('food_basis_changed'))
  const currentWhole = nutritionOf(input.current)
  const candidateWhole = candidate ? nutritionOf(candidate) : null
  const warnings = []
  if (unresolved) warnings.push('Replace or remove the ingredient whose food is no longer available.')
  if (basisChanges.length > 0) warnings.push(`v${input.current.version + 1} will use the current food values.`)
  const meaningful = metadataChanges.length > 0 || yieldChanges.length > 0 || ingredientChanges.some((change) => !change.categories.includes('unchanged'))
  const status = unresolved ? 'blocked' : meaningful ? 'ready' : 'no_changes'
  const fingerprint = candidate
    ? recipePreviewFingerprint({
        recipeId: input.recipeId,
        sourceVersionId: input.current.id,
        calculationVersion: RECIPE_CALCULATION_VERSION,
        name: candidate.name,
        notes: candidate.notes,
        yieldServings: candidate.yieldServings,
        finishedWeightG: candidate.finishedWeightG,
        caloriesKcal: candidate.caloriesKcal,
        proteinG: candidate.proteinG,
        carbsG: candidate.carbsG,
        fatG: candidate.fatG,
        fiberG: candidate.fiberG,
        sodiumMg: candidate.sodiumMg,
        ingredients: candidate.ingredients.map((line) => ({
          foodId: line.foodId,
          amount: line.amount,
          unit: line.unit.trim(),
          scaleFactor: line.scaleFactor,
          servingQuantity: line.baseServingAmountSnapshot,
          servingUnit: line.baseServingUnitSnapshot,
          servingGrams: line.baseWeightGramsSnapshot,
          calories: line.baseCaloriesKcalSnapshot,
          protein: line.baseProteinGSnapshot,
          carbs: line.baseCarbsGSnapshot,
          fat: line.baseFatGSnapshot,
          fiber: line.baseFiberGSnapshot,
          sodium: line.baseSodiumMgSnapshot,
          lineCaloriesKcal: line.lineCaloriesKcal,
          lineProteinG: line.lineProteinG,
          lineCarbsG: line.lineCarbsG,
          lineFatG: line.lineFatG,
          lineFiberG: line.lineFiberG,
          lineSodiumMg: line.lineSodiumMg,
        })),
      })
    : null
  if (!meaningful && !unresolved) warnings.push('No recipe changes to save.')
  return {
    status,
    sourceVersionId: input.current.id,
    currentVersion: input.current.version,
    candidateVersionNumber: input.current.version + 1,
    metadataChanges,
    yieldChanges,
    ingredientChanges,
    ingredientBasisChanges: basisChanges,
    currentWholeNutrition: currentWhole,
    candidateWholeNutrition: candidateWhole,
    nutritionDelta: {
      caloriesKcal: delta(currentWhole.caloriesKcal, candidateWhole?.caloriesKcal ?? null),
      proteinG: delta(currentWhole.proteinG, candidateWhole?.proteinG ?? null),
      carbsG: delta(currentWhole.carbsG, candidateWhole?.carbsG ?? null),
      fatG: delta(currentWhole.fatG, candidateWhole?.fatG ?? null),
      fiberG: delta(currentWhole.fiberG, candidateWhole?.fiberG ?? null),
      sodiumMg: delta(currentWhole.sodiumMg, candidateWhole?.sodiumMg ?? null),
    },
    warnings,
    canCommit: status === 'ready' && fingerprint != null,
    previewFingerprint: status === 'ready' ? fingerprint : null,
    candidate,
  }
}

export function recipePreviewFingerprint(value: {
  recipeId: string
  sourceVersionId: string
  calculationVersion: string
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
  ingredients: Array<{
    foodId: string | null
    amount: number
    unit: string
    scaleFactor: number
    servingQuantity: number | null
    servingUnit: string | null
    servingGrams: number | null
    calories: number
    protein: number | null
    carbs: number | null
    fat: number | null
    fiber: number | null
    sodium: number | null
    lineCaloriesKcal: number
    lineProteinG: number | null
    lineCarbsG: number | null
    lineFatG: number | null
    lineFiberG: number | null
    lineSodiumMg: number | null
  }>
}): string {
  return JSON.stringify([
    value.recipeId,
    value.sourceVersionId,
    value.calculationVersion,
    value.name,
    value.notes,
    value.yieldServings,
    value.finishedWeightG,
    value.caloriesKcal,
    value.proteinG,
    value.carbsG,
    value.fatG,
    value.fiberG,
    value.sodiumMg,
    value.ingredients.map((line) => [
      line.foodId,
      line.amount,
      line.unit,
      line.scaleFactor,
      line.servingQuantity,
      line.servingUnit,
      line.servingGrams,
      line.calories,
      line.protein,
      line.carbs,
      line.fat,
      line.fiber,
      line.sodium,
      line.lineCaloriesKcal,
      line.lineProteinG,
      line.lineCarbsG,
      line.lineFatG,
      line.lineFiberG,
      line.lineSodiumMg,
    ]),
  ])
}

function pairIngredientChanges(
  current: RecipeLine[],
  draft: RecipeDraft,
  foods: ReadonlyMap<string, RecipeFoodBasis>,
  candidate: ComposedRecipe | null,
): RecipeIngredientChange[] {
  const used = new Set<number>()
  const paired = new Map<number, number>()
  draft.ingredients.forEach((line, index) => {
    const sameSlot = current[index]
    if (sameSlot && line.foodId && sameSlot.foodId === line.foodId && !used.has(index)) {
      used.add(index)
      paired.set(index, index)
    }
  })
  draft.ingredients.forEach((line, index) => {
    if (paired.has(index) || line.foodId == null) return
    const match = current.findIndex((item, currentIndex) => !used.has(currentIndex) && item.foodId === line.foodId)
    if (match >= 0) {
      used.add(match)
      paired.set(index, match)
    }
  })
  draft.ingredients.forEach((line, index) => {
    if (paired.has(index) || line.foodId != null) return
    const slot = current[index]
    if (slot && slot.foodId == null && !used.has(index)) {
      used.add(index)
      paired.set(index, index)
    }
  })
  draft.ingredients.forEach((line, index) => {
    if (paired.has(index) || line.foodId == null) return
    const slot = current[index]
    if (slot && !used.has(index)) {
      used.add(index)
      paired.set(index, index)
    }
  })
  const changes: RecipeIngredientChange[] = []
  draft.ingredients.forEach((line, index) => {
    const currentIndex = paired.get(index)
    const previous = currentIndex == null ? null : current[currentIndex] ?? null
    const nextLine = candidate?.ingredients[index] ?? null
    const food = line.foodId ? foods.get(line.foodId) ?? null : null
    changes.push(describeChange(previous, line, nextLine, food, currentIndex ?? null, index))
  })
  current.forEach((line, index) => {
    if (used.has(index)) return
    changes.push({
      categories: ['removed'],
      foodId: line.foodId,
      name: line.foodNameSnapshot,
      position: null,
      previousPosition: line.position,
      from: { amount: line.amount, unit: line.unit, basis: basisFromLine(line) },
      to: null,
    })
  })
  return changes
}

function describeChange(
  previous: RecipeLine | null,
  draft: RecipeDraftIngredient,
  nextLine: RecipeLine | null,
  food: RecipeFoodBasis | null,
  previousIndex: number | null,
  nextIndex: number,
): RecipeIngredientChange {
  if (draft.foodId == null) {
    return {
      categories: ['unresolved'],
      foodId: null,
      name: previous?.foodNameSnapshot ?? 'Unknown food',
      position: nextIndex + 1,
      previousPosition: previous?.position ?? null,
      from: previous ? { amount: previous.amount, unit: previous.unit, basis: basisFromLine(previous) } : null,
      to: null,
    }
  }
  const toBasis = food ? basisFromFood(food) : nextLine ? basisFromLine(nextLine) : null
  if (!previous) {
    return {
      categories: ['added'],
      foodId: draft.foodId,
      name: food?.name ?? nextLine?.foodNameSnapshot ?? 'Food',
      position: nextIndex + 1,
      previousPosition: null,
      from: null,
      to: { amount: draft.amount, unit: draft.unit.trim(), basis: toBasis ?? emptyBasis(food?.name ?? 'Food') },
    }
  }
  const categories: RecipeChangeCategory[] = []
  if (previous.foodId !== draft.foodId) categories.push('food_replaced')
  if (previousIndex !== nextIndex) categories.push('reordered')
  if (previous.amount !== draft.amount) categories.push('amount_changed')
  if (previous.unit.trim() !== draft.unit.trim()) categories.push('unit_changed')
  if (previous.foodId === draft.foodId && food && !sameBasis(basisFromLine(previous), basisFromFood(food))) {
    categories.push('food_basis_changed')
  }
  if (categories.length === 0) categories.push('unchanged')
  return {
    categories,
    foodId: draft.foodId,
    name: food?.name ?? previous.foodNameSnapshot,
    position: nextIndex + 1,
    previousPosition: previous.position,
    from: { amount: previous.amount, unit: previous.unit, basis: basisFromLine(previous) },
    to: { amount: draft.amount, unit: draft.unit.trim(), basis: toBasis ?? basisFromLine(previous) },
  }
}

function metadataDiff(current: RecipeVersionSnapshot, candidate: ComposedRecipe | null, draft: RecipeDraft) {
  const nextName = candidate?.name ?? draft.name.trim()
  const nextNotes = candidate?.notes ?? (draft.notes?.trim() ? draft.notes.trim() : null)
  const changes: RecipeVersionPreview['metadataChanges'] = []
  if (current.name !== nextName) changes.push({ field: 'name', from: current.name, to: nextName })
  if ((current.notes ?? null) !== nextNotes) changes.push({ field: 'notes', from: current.notes, to: nextNotes })
  return changes
}

function yieldDiff(current: RecipeVersionSnapshot, candidate: ComposedRecipe | null, draft: RecipeDraft) {
  const nextYield = candidate ? candidate.yieldServings : draft.yieldServings
  const nextWeight = candidate ? candidate.finishedWeightG : draft.finishedWeightG
  const changes: RecipeVersionPreview['yieldChanges'] = []
  if (!sameQuantity(current.yieldServings, nextYield)) changes.push({ field: 'yieldServings', from: current.yieldServings, to: nextYield })
  if (!sameQuantity(current.finishedWeightG, nextWeight)) {
    changes.push({ field: 'finishedWeightG', from: current.finishedWeightG, to: nextWeight })
  }
  return changes
}

function basisFromLine(line: RecipeLine): RecipeBasisView {
  return {
    name: line.foodNameSnapshot,
    servingQuantity: line.baseServingAmountSnapshot,
    servingUnit: line.baseServingUnitSnapshot,
    servingGrams: line.baseWeightGramsSnapshot,
    caloriesKcal: line.baseCaloriesKcalSnapshot,
    proteinG: line.baseProteinGSnapshot,
    carbsG: line.baseCarbsGSnapshot,
    fatG: line.baseFatGSnapshot,
    fiberG: line.baseFiberGSnapshot,
    sodiumMg: line.baseSodiumMgSnapshot,
  }
}

function basisFromFood(food: RecipeFoodBasis): RecipeBasisView {
  return {
    name: food.name,
    servingQuantity: food.servingQuantity,
    servingUnit: food.servingUnit,
    servingGrams: food.servingGrams,
    caloriesKcal: food.calories,
    proteinG: food.protein,
    carbsG: food.carbs,
    fatG: food.fat,
    fiberG: food.fiber,
    sodiumMg: food.sodium,
  }
}

function emptyBasis(name: string): RecipeBasisView {
  return {
    name,
    servingQuantity: null,
    servingUnit: null,
    servingGrams: null,
    caloriesKcal: null,
    proteinG: null,
    carbsG: null,
    fatG: null,
    fiberG: null,
    sodiumMg: null,
  }
}

function sameBasis(left: RecipeBasisView, right: RecipeBasisView): boolean {
  return (
    left.name === right.name &&
    sameQuantity(left.servingQuantity, right.servingQuantity) &&
    normalizeRecipeUnit(left.servingUnit ?? '') === normalizeRecipeUnit(right.servingUnit ?? '') &&
    sameQuantity(left.servingGrams, right.servingGrams) &&
    sameQuantity(left.caloriesKcal, right.caloriesKcal) &&
    sameQuantity(left.proteinG, right.proteinG) &&
    sameQuantity(left.carbsG, right.carbsG) &&
    sameQuantity(left.fatG, right.fatG) &&
    sameQuantity(left.fiberG, right.fiberG) &&
    sameQuantity(left.sodiumMg, right.sodiumMg)
  )
}

function nutritionOf(value: { caloriesKcal: number; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null; sodiumMg: number | null }): RecipeNutrition {
  return {
    caloriesKcal: value.caloriesKcal,
    proteinG: value.proteinG,
    carbsG: value.carbsG,
    fatG: value.fatG,
    fiberG: value.fiberG,
    sodiumMg: value.sodiumMg,
  }
}

function delta(current: number | null, next: number | null): number | null {
  if (current == null || next == null) return null
  return next - current
}

function sameQuantity(left: number | null, right: number | null): boolean {
  if (left == null || right == null) return left == null && right == null
  return left === right
}

const FORBIDDEN = ['calories', 'protein', 'carbs', 'fat', 'fiber', 'sodium', 'scaleFactor', 'caloriesKcal', 'proteinG', 'carbsG', 'fatG', 'fiberG', 'sodiumMg']

function forbiddenRecipeKey(record: Record<string, unknown>): boolean {
  return FORBIDDEN.some((key) => key in record)
}

function optionalPositive(value: unknown, label: string): number | null | string {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return `${label} must be greater than zero.`
  return parsed
}
