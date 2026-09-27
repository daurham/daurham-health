import { z } from 'zod'
import {
  aiReusableFoodNotes,
  nutritionFoodCreateSchema,
  scalePer100Grams,
  usdaReusableFoodNotes,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import { insertFood, mapFoodRow } from './queries.js'
import { createUsdaFdcProvider, type UsdaFoodCandidate, type UsdaPortion } from './providers/usda-fdc.js'

export type UsdaFoodLookup = {
  search(query: string): Promise<
    | { status: 'found'; candidates: UsdaFoodCandidate[] }
    | { status: 'unavailable' }
    | { status: 'not_configured' }
  >
  getFood(fdcId: number): Promise<UsdaFoodCandidate | null>
}

const portionRequestSchema = z.object({
  fdcId: z.number().int().positive(),
  amount: z.number().positive(),
  unit: z.string().trim().min(1).max(80),
  grams: z.number().positive(),
})

const aiFoodSchema = z.object({
  name: z.string().trim().min(1).max(200),
  text: z.string().trim().min(1).max(500),
  servingQuantity: z.number().positive(),
  servingUnit: z.string().trim().min(1).max(80),
  servingGrams: z.number().positive().nullable().optional(),
  calories: z.number().min(0),
  protein: z.number().min(0).nullable().optional(),
  carbs: z.number().min(0).nullable().optional(),
  fat: z.number().min(0).nullable().optional(),
  fiber: z.number().min(0).nullable().optional(),
  provider: z.enum(['gemini', 'home_ai']),
  model: z.string().max(80).nullable().optional(),
  originalCalories: z.number().min(0),
  adjusted: z.boolean(),
})

function parseOr400<T>(schema: z.ZodType<T>, body: unknown, fallback: string): T {
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? fallback)
  }
  return parsed.data
}

function uniqueFoodConflict(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('nutrition_foods_name_brand_kind_uidx') || message.includes('23505')
}

function samePortion(portion: UsdaPortion, requested: { amount: number; unit: string; grams: number }): boolean {
  return (
    Math.abs(portion.amount - requested.amount) < 0.0001 &&
    portion.unit.toLowerCase() === requested.unit.trim().toLowerCase() &&
    Math.abs(portion.grams - requested.grams) < 0.0001
  )
}

async function findUsdaFood(fdcId: number, portion: { amount: number; unit: string; grams: number }) {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT * FROM nutrition_foods
     WHERE archived = false
       AND source_kind = 'usda'
       AND notes LIKE $1
       AND serving_quantity = $2
       AND lower(serving_unit) = lower($3)
       AND serving_grams IS NOT DISTINCT FROM $4
     LIMIT 1`,
    [`fdc:${fdcId}\n%`, portion.amount, portion.unit, portion.grams],
  )) as Array<Record<string, unknown>>
  return rows[0] ? mapFoodRow(rows[0]) : null
}

export async function searchUsdaFoods(query: string, provider: UsdaFoodLookup = createUsdaFdcProvider()) {
  const trimmed = query.trim()
  if (!trimmed) {
    throw new HttpError(400, 'Enter a food name')
  }
  const result = await provider.search(trimmed)
  if (result.status === 'not_configured') {
    throw new HttpError(503, 'USDA search is not configured')
  }
  if (result.status === 'unavailable') {
    throw new HttpError(503, 'USDA search is temporarily unavailable')
  }
  return { foods: result.candidates }
}

export async function saveUsdaReusableFood(body: unknown, provider: UsdaFoodLookup = createUsdaFdcProvider()) {
  const requested = parseOr400(portionRequestSchema, body, 'Invalid USDA food')
  const candidate = await provider.getFood(requested.fdcId)
  if (!candidate) {
    throw new HttpError(503, 'USDA food is temporarily unavailable')
  }
  const portion = candidate.portions.find((item) => samePortion(item, requested))
  if (!portion) {
    throw new HttpError(400, 'Choose a USDA serving with a gram weight')
  }
  const existing = await findUsdaFood(candidate.fdcId, portion)
  if (existing) {
    return { food: existing, reused: true }
  }
  const scaled = scalePer100Grams(candidate, portion.grams)
  const notes = usdaReusableFoodNotes(candidate.fdcId, portion.label)
  const input = parseOr400(
    nutritionFoodCreateSchema,
    {
      name: candidate.name,
      brand: portion.label,
      catalogKind: 'ingredient',
      servingQuantity: portion.amount,
      servingUnit: portion.unit,
      servingGrams: portion.grams,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
      fiber: scaled.fiber,
      sourceKind: 'usda',
      notes,
    },
    'Invalid USDA food',
  )
  try {
    const food = await insertUsdaFood(input)
    return { food, reused: false }
  } catch (error) {
    if (!uniqueFoodConflict(error)) {
      throw error
    }
    const again = await findUsdaFood(candidate.fdcId, portion)
    if (again) {
      return { food: again, reused: true }
    }
    const distinguished = await insertUsdaFood({
      ...input,
      brand: `${portion.label} · fdc ${candidate.fdcId}`.slice(0, 120),
    })
    return { food: distinguished, reused: false }
  }
}

async function insertUsdaFood(input: {
  name: string
  brand?: string | null
  servingQuantity: number
  servingUnit: string
  servingGrams?: number | null
  calories: number
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
  notes?: string | null
}) {
  return insertFood([
    input.name,
    input.brand ?? null,
    null,
    'ingredient',
    input.servingQuantity,
    input.servingUnit,
    input.servingGrams ?? null,
    input.calories,
    input.protein ?? null,
    input.carbs ?? null,
    input.fat ?? null,
    input.fiber ?? null,
    'usda',
    false,
    input.notes ?? null,
  ])
}

export async function saveAiReusableFood(body: unknown) {
  const requested = parseOr400(aiFoodSchema, body, 'Invalid reusable food')
  const notes = aiReusableFoodNotes({
    text: requested.text,
    provider: requested.provider,
    model: requested.model ?? null,
    originalCalories: requested.originalCalories,
    adjusted: requested.adjusted,
  })
  const input = parseOr400(
    nutritionFoodCreateSchema,
    {
      name: requested.name,
      catalogKind: 'ingredient',
      servingQuantity: requested.servingQuantity,
      servingUnit: requested.servingUnit,
      servingGrams: requested.servingGrams ?? null,
      calories: requested.calories,
      protein: requested.protein ?? null,
      carbs: requested.carbs ?? null,
      fat: requested.fat ?? null,
      fiber: requested.fiber ?? null,
      sourceKind: 'photo_ai',
      notes,
    },
    'Invalid reusable food',
  )
  try {
    const food = await insertFood([
      input.name,
      null,
      null,
      'ingredient',
      input.servingQuantity,
      input.servingUnit,
      input.servingGrams ?? null,
      input.calories,
      input.protein ?? null,
      input.carbs ?? null,
      input.fat ?? null,
      input.fiber ?? null,
      'photo_ai',
      false,
      input.notes ?? null,
    ])
    return { food, reused: false }
  } catch (error) {
    if (uniqueFoodConflict(error)) {
      throw new HttpError(409, 'A food with this name already exists')
    }
    throw error
  }
}
