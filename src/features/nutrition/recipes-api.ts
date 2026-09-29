import type { RecipeAssistDraft } from '@/domain/nutrition/recipe-assist'
import { RECIPE_ASSIST_VERSION } from '@/domain/nutrition/recipe-assist'
import { healthFetch, readApiError } from '@/lib'

export type RecipeIngredient = {
  id: string
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
  supportedUnits: string[]
}

export type RecipeHistoryItem = {
  id: string
  version: number
  isCurrent: boolean
  name: string
  createdAt: string
}

export type RecipeDetail = {
  id: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  history?: RecipeHistoryItem[]
  version: {
    id: string
    version: number
    isCurrent: boolean
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
    createdAt: string
    ingredients: RecipeIngredient[]
  }
}

export type RecipeListItem = {
  id: string
  name: string
  version: number
  isCurrent: boolean
  caloriesKcal: number
  yieldServings: number | null
  finishedWeightG: number | null
}

async function parseOk<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(await readApiError(response))
  return (await response.json()) as T
}

export async function fetchRecipes(): Promise<RecipeListItem[]> {
  const body = await parseOk<{ recipes: RecipeListItem[] }>(await healthFetch('/api/nutrition/recipes'))
  return body.recipes
}

export async function fetchRecipe(id: string): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(await healthFetch(`/api/nutrition/recipes/${id}`))
}

export async function fetchRecipeVersion(id: string, version: number): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(await healthFetch(`/api/nutrition/recipes/${id}/versions/${version}`))
}

export type RecipePreview = {
  status: 'ready' | 'no_changes' | 'blocked'
  sourceVersionId: string
  currentVersion: number
  candidateVersionNumber: number
  metadataChanges: Array<{ field: 'name' | 'notes'; from: string | null; to: string | null }>
  yieldChanges: Array<{ field: 'yieldServings' | 'finishedWeightG'; from: number | null; to: number | null }>
  ingredientChanges: Array<{
    categories: string[]
    foodId: string | null
    name: string
    position: number | null
    previousPosition: number | null
    from: { amount: number; unit: string; basis: RecipeBasis } | null
    to: { amount: number; unit: string; basis: RecipeBasis } | null
  }>
  ingredientBasisChanges: RecipePreview['ingredientChanges']
  currentWholeNutrition: { caloriesKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null; sodiumMg: number | null }
  candidateWholeNutrition: { caloriesKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null; sodiumMg: number | null } | null
  nutritionDelta: { caloriesKcal: number | null; proteinG: number | null; carbsG: number | null; fatG: number | null; fiberG: number | null; sodiumMg: number | null }
  warnings: string[]
  canCommit: boolean
  previewFingerprint: string | null
}

type RecipeBasis = {
  name: string
  caloriesKcal: number | null
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sodiumMg: number | null
}

export async function previewRecipeChange(
  id: string,
  input: {
    sourceVersionId: string
    name: string
    notes: string
    yieldServings: number | null
    finishedWeightG: number | null
    ingredients: Array<{ foodId: string | null; amount: number; unit: string }>
  },
): Promise<RecipePreview> {
  return parseOk<RecipePreview>(
    await healthFetch(`/api/nutrition/recipes/${id}/versions/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function commitRecipeVersion(
  id: string,
  input: {
    sourceVersionId: string
    previewFingerprint: string
    name: string
    notes: string
    yieldServings: number | null
    finishedWeightG: number | null
    ingredients: Array<{ foodId: string | null; amount: number; unit: string }>
  },
): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(
    await healthFetch(`/api/nutrition/recipes/${id}/versions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function draftRecipeFromText(text: string): Promise<RecipeAssistDraft> {
  return parseOk<RecipeAssistDraft>(
    await healthFetch('/api/nutrition/recipes/assist', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: RECIPE_ASSIST_VERSION, text }),
    }),
  )
}

export async function createRecipe(input: {
  name: string
  notes: string
  yieldServings: number | null
  finishedWeightG: number | null
  ingredients: Array<{ foodId: string; amount: number; unit: string }>
}): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(
    await healthFetch('/api/nutrition/recipes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function archiveRecipe(id: string): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(await healthFetch(`/api/nutrition/recipes/${id}/archive`, { method: 'POST' }))
}

export async function restoreRecipe(id: string): Promise<RecipeDetail> {
  return parseOk<RecipeDetail>(await healthFetch(`/api/nutrition/recipes/${id}/restore`, { method: 'POST' }))
}
