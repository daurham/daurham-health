import { z } from 'zod'
import { isCalendarDate } from '../../src/domain/training.js'
import {
  NUTRITION_CONFIG,
  nutritionDayTotals,
  nutritionEntryCreateSchema,
  nutritionEntryPatchSchema,
  nutritionFoodCreateSchema,
  nutritionFoodPatchSchema,
  resolveEntryLogDate,
  snapshotFromDefinition,
  type NutritionEntry,
  type NutritionFood,
  type NutritionTarget,
  type NutritionDayTotals,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import {
  deleteEntry,
  getEntry,
  getFood,
  insertEntry,
  insertFood,
  listEntriesForDate,
  listFoods,
  targetForDate,
  updateEntry,
  updateFood,
} from './queries.js'

function parseOr400<T>(schema: z.ZodType<T>, body: unknown, fallback: string): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message
    throw new HttpError(400, issue && issue.length > 0 ? issue : fallback)
  }
  return parsed.data
}

function uniqueConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('nutrition_foods_name_brand_kind_uidx') || message.includes('nutrition_foods_barcode_uidx')
}

export function parseNutritionDayQuery(date: string | null): string {
  const trimmed = date?.trim() ?? ''
  if (!isCalendarDate(trimmed)) {
    throw new HttpError(400, 'date must be YYYY-MM-DD')
  }
  return trimmed
}

export type NutritionDayResponse = {
  date: string
  entries: NutritionEntry[]
  totals: NutritionDayTotals
  targets: NutritionTarget | null
}

export async function getNutritionDay(date: string): Promise<NutritionDayResponse> {
  const entries = await listEntriesForDate(date)
  const targets = await targetForDate(date)
  return {
    date,
    entries,
    totals: nutritionDayTotals(entries),
    targets,
  }
}

export async function searchNutritionFoods(query: string | null): Promise<NutritionFood[]> {
  const trimmed = query?.trim() || null
  return listFoods(trimmed, NUTRITION_CONFIG.foodQueryLimit)
}

export async function createNutritionFood(body: unknown): Promise<NutritionFood> {
  const input = parseOr400(nutritionFoodCreateSchema, body, 'Invalid food')
  try {
    return await insertFood([
      input.name,
      input.brand ?? null,
      input.barcode ?? null,
      input.catalogKind,
      input.servingQuantity,
      input.servingUnit,
      input.servingGrams ?? null,
      input.calories,
      input.protein ?? null,
      input.carbs ?? null,
      input.fat ?? null,
      input.fiber ?? null,
      input.sourceKind,
      input.isStaple,
      input.notes ?? null,
    ])
  } catch (error) {
    if (uniqueConflict(error)) {
      throw new HttpError(409, 'A food with this name and brand already exists')
    }
    throw error
  }
}

export async function patchNutritionFood(id: string, body: unknown): Promise<NutritionFood> {
  if (!z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'id is invalid')
  }
  const input = parseOr400(nutritionFoodPatchSchema, body, 'Invalid food patch')
  try {
    const updated = await updateFood([
      id,
      input.name ?? null,
      input.brand !== undefined,
      input.brand ?? null,
      input.barcode !== undefined,
      input.barcode ?? null,
      input.servingQuantity ?? null,
      input.servingUnit ?? null,
      input.servingGrams !== undefined,
      input.servingGrams ?? null,
      input.calories ?? null,
      input.protein !== undefined,
      input.protein ?? null,
      input.carbs !== undefined,
      input.carbs ?? null,
      input.fat !== undefined,
      input.fat ?? null,
      input.fiber !== undefined,
      input.fiber ?? null,
      input.isStaple ?? null,
      input.archived ?? null,
      input.notes !== undefined,
      input.notes ?? null,
    ])
    if (!updated) {
      throw new HttpError(404, 'Food not found')
    }
    return updated
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    if (uniqueConflict(error)) {
      throw new HttpError(409, 'A food with this name and brand already exists')
    }
    throw error
  }
}

async function snapshotForCreate(input: z.infer<typeof nutritionEntryCreateSchema>): Promise<{
  foodId: string | null
  foodName: string
  brand: string | null
  servingUnit: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  grams: number | null
}> {
  let food: NutritionFood | null = null
  if (input.foodId) {
    food = await getFood(input.foodId)
    if (!food || food.archived) {
      throw new HttpError(400, 'foodId does not match a current food')
    }
  }
  const foodName = input.foodName ?? food?.name
  if (!foodName) {
    throw new HttpError(400, 'foodName is required')
  }
  const servingUnit = input.servingUnit ?? food?.servingUnit
  if (!servingUnit) {
    throw new HttpError(400, 'Serving unit is required')
  }
  if (food && input.calories == null) {
    const snapshot = snapshotFromDefinition(
      {
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
        fiber: food.fiber,
        servingGrams: food.servingGrams,
      },
      { quantity: input.servingQuantity, grams: input.grams ?? null },
    )
    return {
      foodId: food.id,
      foodName,
      brand: input.brand !== undefined ? input.brand ?? null : food.brand,
      servingUnit,
      calories: snapshot.calories,
      protein: snapshot.protein,
      carbs: snapshot.carbs,
      fat: snapshot.fat,
      fiber: snapshot.fiber,
      grams: input.grams !== undefined ? input.grams ?? null : snapshot.grams,
    }
  }
  if (input.calories == null) {
    throw new HttpError(400, 'calories is required')
  }
  return {
    foodId: food?.id ?? null,
    foodName,
    brand: input.brand ?? food?.brand ?? null,
    servingUnit,
    calories: input.calories,
    protein: input.protein ?? null,
    carbs: input.carbs ?? null,
    fat: input.fat ?? null,
    fiber: input.fiber ?? null,
    grams: input.grams ?? null,
  }
}

export async function createNutritionEntry(body: unknown): Promise<NutritionEntry> {
  const input = parseOr400(nutritionEntryCreateSchema, body, 'Invalid entry')
  let resolved
  try {
    resolved = resolveEntryLogDate({
      logDate: input.logDate,
      consumedAt: input.consumedAt,
      timezone: input.timezone,
    })
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid entry date')
  }
  const snapshot = await snapshotForCreate(input)
  return insertEntry([
    resolved.logDate,
    resolved.consumedAt,
    input.timezone,
    input.meal ?? null,
    snapshot.foodId,
    snapshot.foodName,
    snapshot.brand,
    input.servingQuantity,
    snapshot.servingUnit,
    snapshot.grams,
    snapshot.calories,
    snapshot.protein,
    snapshot.carbs,
    snapshot.fat,
    snapshot.fiber,
    input.sourceKind,
    input.notes ?? null,
  ])
}

export async function patchNutritionEntry(id: string, body: unknown): Promise<NutritionEntry> {
  if (!z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'id is invalid')
  }
  const existing = await getEntry(id)
  if (!existing) {
    throw new HttpError(404, 'Entry not found')
  }
  const input = parseOr400(nutritionEntryPatchSchema, body, 'Invalid entry patch')
  let logDate = input.logDate ?? existing.logDate
  let consumedAt = existing.consumedAt
  if (input.consumedAt !== undefined || input.logDate) {
    try {
      const resolved = resolveEntryLogDate({
        logDate: input.logDate ?? existing.logDate,
        consumedAt: input.consumedAt !== undefined ? input.consumedAt : existing.consumedAt,
        timezone: existing.timezone,
      })
      logDate = resolved.logDate
      consumedAt = resolved.consumedAt
    } catch (error) {
      throw new HttpError(400, error instanceof Error ? error.message : 'Invalid entry date')
    }
  }
  const updated = await updateEntry([
    id,
    logDate,
    input.consumedAt !== undefined || input.logDate != null,
    consumedAt,
    input.meal !== undefined,
    input.meal ?? null,
    input.foodName ?? null,
    input.brand !== undefined,
    input.brand ?? null,
    input.servingQuantity ?? null,
    input.servingUnit ?? null,
    input.grams !== undefined,
    input.grams ?? null,
    input.calories ?? null,
    input.protein !== undefined,
    input.protein ?? null,
    input.carbs !== undefined,
    input.carbs ?? null,
    input.fat !== undefined,
    input.fat ?? null,
    input.fiber !== undefined,
    input.fiber ?? null,
    input.notes !== undefined,
    input.notes ?? null,
  ])
  if (!updated) {
    throw new HttpError(404, 'Entry not found')
  }
  return updated
}

export async function removeNutritionEntry(id: string): Promise<void> {
  if (!z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'id is invalid')
  }
  const deleted = await deleteEntry(id)
  if (!deleted) {
    throw new HttpError(404, 'Entry not found')
  }
}
