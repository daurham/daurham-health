import { z } from 'zod'
import { isCalendarDate } from '../../src/domain/training.js'
import {
  NUTRITION_CONFIG,
  normalizeBarcode,
  nutritionDayTotals,
  nutritionEntryCreateSchema,
  nutritionEntryPatchSchema,
  nutritionFoodCreateSchema,
  nutritionFoodPatchSchema,
  nutritionTargetCreateSchema,
  rankFoodsForQuery,
  rescaleLoggedSnapshot,
  resolveEntryLogDate,
  snapshotFromDefinition,
  validatePackagedReview,
  type NutritionEntry,
  type NutritionFood,
  type NutritionTarget,
  type NutritionDayTotals,
  type PackagedFoodCandidate,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import {
  deleteEntry,
  getEntry,
  getFood,
  getFoodByBarcodeKeys,
  insertEntry,
  insertFood,
  listEntriesForDate,
  listFoods,
  listRecentFoods,
  listRecipeFoods,
  listStapleFoods,
  targetForDate,
  updateEntry,
  updateFood,
  upsertTarget,
} from './queries.js'
import { openFoodFactsProvider } from './providers/open-food-facts.js'
import type { PackagedFoodProvider } from './providers/types.js'

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
  return (
    message.includes('nutrition_foods_name_brand_kind_uidx') ||
    message.includes('nutrition_foods_barcode_uidx') ||
    message.includes('nutrition_foods_barcode_normalized_uidx')
  )
}

function barcodeConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('nutrition_foods_barcode_uidx') || message.includes('nutrition_foods_barcode_normalized_uidx')
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
  quickAdd: {
    recents: NutritionFood[]
    staples: NutritionFood[]
    recipes: NutritionFood[]
  }
}

export async function getNutritionDay(date: string): Promise<NutritionDayResponse> {
  const [entries, targets, recents, staples, recipes] = await Promise.all([
    listEntriesForDate(date),
    targetForDate(date),
    listRecentFoods(NUTRITION_CONFIG.recentsLimit),
    listStapleFoods(NUTRITION_CONFIG.staplesLimit),
    listRecipeFoods(NUTRITION_CONFIG.recipesLimit),
  ])
  return {
    date,
    entries,
    totals: nutritionDayTotals(entries),
    targets,
    quickAdd: { recents, staples, recipes },
  }
}

export async function searchNutritionFoods(query: string | null): Promise<NutritionFood[]> {
  const trimmed = query?.trim() || null
  const foods = await listFoods(trimmed, NUTRITION_CONFIG.foodQueryLimit)
  return trimmed ? rankFoodsForQuery(foods, trimmed) : foods
}

export async function getNutritionFood(id: string): Promise<NutritionFood> {
  if (!z.uuid().safeParse(id).success) {
    throw new HttpError(400, 'id is invalid')
  }
  const food = await getFood(id)
  if (!food) {
    throw new HttpError(404, 'Food not found')
  }
  return food
}

export async function getNutritionTarget(date: string): Promise<NutritionTarget | null> {
  return targetForDate(date)
}

export async function saveNutritionTarget(body: unknown): Promise<NutritionTarget> {
  const input = parseOr400(nutritionTargetCreateSchema, body, 'Invalid target')
  return upsertTarget([
    input.effectiveFrom,
    input.caloriesTarget,
    input.proteinTarget,
    input.carbsTarget ?? null,
    input.fatTarget ?? null,
    input.fiberTarget ?? null,
  ])
}

export async function createNutritionFood(body: unknown): Promise<NutritionFood> {
  const input = parseOr400(nutritionFoodCreateSchema, body, 'Invalid food')
  try {
    return await insertFood([
      input.name,
      input.brand ?? null,
      input.barcode ? (normalizeBarcode(input.barcode)?.normalized ?? input.barcode) : null,
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
      input.barcode != null ? (normalizeBarcode(input.barcode)?.normalized ?? input.barcode) : null,
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
  const servingQuantity = input.servingQuantity ?? existing.servingQuantity
  const quantityChanged = input.servingQuantity != null && input.servingQuantity !== existing.servingQuantity
  const gramsChanged = input.grams !== undefined && input.grams !== existing.grams
  const shouldRescale = (quantityChanged || gramsChanged) && input.calories == null
  let calories = input.calories ?? existing.calories
  let protein = input.protein !== undefined ? input.protein : existing.protein
  let carbs = input.carbs !== undefined ? input.carbs : existing.carbs
  let fat = input.fat !== undefined ? input.fat : existing.fat
  let fiber = input.fiber !== undefined ? input.fiber : existing.fiber
  let grams = input.grams !== undefined ? input.grams : existing.grams
  if (shouldRescale) {
    const snapshot = rescaleLoggedSnapshot(existing, {
      quantity: servingQuantity,
      grams: input.grams,
    })
    calories = snapshot.calories
    protein = snapshot.protein
    carbs = snapshot.carbs
    fat = snapshot.fat
    fiber = snapshot.fiber
    grams = snapshot.grams
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
    servingQuantity,
    input.servingUnit ?? null,
    input.grams !== undefined || shouldRescale,
    grams,
    calories,
    input.protein !== undefined || shouldRescale,
    protein,
    input.carbs !== undefined || shouldRescale,
    carbs,
    input.fat !== undefined || shouldRescale,
    fat,
    input.fiber !== undefined || shouldRescale,
    fiber,
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

export class NutritionBarcodeError extends Error {
  readonly statusCode: number
  readonly code: 'invalid_barcode' | 'not_found' | 'provider_unavailable'
  readonly barcode?: string

  constructor(
    statusCode: number,
    code: NutritionBarcodeError['code'],
    message: string,
    barcode?: string,
  ) {
    super(message)
    this.name = 'NutritionBarcodeError'
    this.statusCode = statusCode
    this.code = code
    this.barcode = barcode
  }
}

export type BarcodeLookupResponse =
  | { status: 'local'; barcode: string; food: NutritionFood }
  | { status: 'candidate'; barcode: string; candidate: PackagedFoodCandidate }

export async function lookupNutritionBarcode(
  raw: string | null,
  provider: PackagedFoodProvider = openFoodFactsProvider,
): Promise<BarcodeLookupResponse> {
  const parsed = normalizeBarcode(raw ?? '')
  if (!parsed) {
    throw new NutritionBarcodeError(400, 'invalid_barcode', 'Enter a valid barcode.')
  }
  const local = await getFoodByBarcodeKeys(parsed.lookupKeys)
  if (local) {
    return { status: 'local', barcode: parsed.normalized, food: local }
  }
  const remote = await provider.lookupBarcode(parsed.normalized)
  if (remote.status === 'unavailable') {
    throw new NutritionBarcodeError(503, 'provider_unavailable', remote.message, parsed.normalized)
  }
  if (remote.status === 'not_found') {
    throw new NutritionBarcodeError(
      404,
      'not_found',
      'Not found in the product database.',
      parsed.normalized,
    )
  }
  return { status: 'candidate', barcode: parsed.normalized, candidate: remote.candidate }
}

export async function savePackagedFoodAndLog(body: unknown): Promise<{
  food: NutritionFood
  entry: NutritionEntry | null
}> {
  const record = body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : {}
  const barcodeRaw = typeof record.barcode === 'string' ? record.barcode : ''
  const parsedBarcode = normalizeBarcode(barcodeRaw)
  const reviewErrors = validatePackagedReview({
    barcode: barcodeRaw,
    name: typeof record.name === 'string' ? record.name : null,
    servingUnit: typeof record.servingUnit === 'string' ? record.servingUnit : null,
    servingQuantity: record.servingQuantity == null ? null : Number(record.servingQuantity),
    servingGrams: record.servingGrams == null || record.servingGrams === '' ? null : Number(record.servingGrams),
    calories: record.calories == null || record.calories === '' ? null : Number(record.calories),
  })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid packaged food', reviewErrors)
  }
  const input = parseOr400(
    nutritionFoodCreateSchema,
    {
      ...record,
      barcode: parsedBarcode?.normalized ?? barcodeRaw,
      catalogKind: 'packaged',
      sourceKind: record.sourceKind ?? 'barcode',
    },
    'Invalid packaged food',
  )
  const shouldLog = record.log !== false
  const logQuantity = Number(record.logQuantity ?? 1)
  if (shouldLog && !(logQuantity > 0)) {
    throw new HttpError(400, 'Quantity must be greater than 0')
  }

  let food = parsedBarcode ? await getFoodByBarcodeKeys(parsedBarcode.lookupKeys) : null
  if (!food) {
    try {
      food = await insertFood([
        input.name,
        input.brand ?? null,
        input.barcode ?? parsedBarcode?.normalized ?? null,
        'packaged',
        input.servingQuantity,
        input.servingUnit,
        input.servingGrams ?? null,
        input.calories,
        input.protein ?? null,
        input.carbs ?? null,
        input.fat ?? null,
        input.fiber ?? null,
        'barcode',
        input.isStaple,
        input.notes ?? null,
      ])
    } catch (error) {
      if (barcodeConflict(error) && parsedBarcode) {
        food = await getFoodByBarcodeKeys(parsedBarcode.lookupKeys)
      }
      if (!food) {
        if (uniqueConflict(error)) {
          throw new HttpError(409, 'A food with this barcode or name already exists')
        }
        throw error
      }
    }
  }

  if (!shouldLog) {
    return { food, entry: null }
  }

  let logDate: string
  let timezone: string = NUTRITION_CONFIG.calendarTimeZone
  try {
    const resolved = resolveEntryLogDate({
      logDate: typeof record.logDate === 'string' ? record.logDate : undefined,
      consumedAt: null,
      timezone: typeof record.timezone === 'string' ? record.timezone : NUTRITION_CONFIG.calendarTimeZone,
    })
    logDate = resolved.logDate
    timezone = typeof record.timezone === 'string' ? record.timezone : NUTRITION_CONFIG.calendarTimeZone
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid entry date')
  }

  const snapshot = snapshotFromDefinition(
    {
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      servingGrams: food.servingGrams,
    },
    { quantity: logQuantity },
  )
  try {
    const entry = await insertEntry([
      logDate,
      null,
      timezone,
      null,
      food.id,
      food.name,
      food.brand,
      logQuantity,
      food.servingUnit,
      snapshot.grams,
      snapshot.calories,
      snapshot.protein,
      snapshot.carbs,
      snapshot.fat,
      snapshot.fiber,
      'barcode',
      null,
    ])
    return { food, entry }
  } catch {
    throw new HttpError(500, 'Food saved but logging failed. Scan again to log.')
  }
}
