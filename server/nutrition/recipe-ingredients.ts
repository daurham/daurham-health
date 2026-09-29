import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  NUTRITION_FOOD_ENTITY,
  USDA_FOODDATA_SOURCE_KEY,
  descriptionFoodFingerprint,
  descriptionFoodProvenance,
  nutritionFoodCreateSchema,
  scalePer100Grams,
  usdaExternalId,
  usdaServingFingerprint,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import { mapFoodRow } from './queries.js'
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
  sodium: z.number().min(0).nullable().optional(),
  provider: z.enum(['gemini', 'home_ai']),
  model: z.string().max(80).nullable().optional(),
  originalCalories: z.number().min(0),
  adjusted: z.boolean(),
})

const CLAIM_FOOD_LINK_SQL = `INSERT INTO source_record_links (
  id, source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
) VALUES ($1::uuid, $2::uuid, NULL, $3, $4, $5, $6::uuid, $7::jsonb)
ON CONFLICT (source_id, external_fingerprint) DO NOTHING
RETURNING entity_id`

const INSERT_FOOD_WITH_ID_SQL = `INSERT INTO nutrition_foods (
  id, name, brand, barcode, catalog_kind, serving_quantity, serving_unit, serving_grams,
  calories, protein, carbs, fat, fiber, sodium, source_kind, is_staple, notes
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
RETURNING *`

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

async function sourceIdByKey(key: string): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(`SELECT id FROM data_sources WHERE key = $1 LIMIT 1`, [key])) as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, `${key} data source is not configured`)
  }
  return id
}

async function findFoodByFingerprint(sourceId: string, fingerprint: string) {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT foods.*
     FROM source_record_links links
     JOIN nutrition_foods foods ON foods.id = links.entity_id
     WHERE links.source_id = $1
       AND links.entity_type = $2
       AND links.external_fingerprint = $3
       AND foods.archived = false
     LIMIT 1`,
    [sourceId, NUTRITION_FOOD_ENTITY, fingerprint],
  )) as Array<Record<string, unknown>>
  return rows[0] ? mapFoodRow(rows[0]) : null
}

async function claimFoodLink(input: {
  sourceId: string
  externalId: string
  fingerprint: string
  foodId: string
  payload: Record<string, unknown>
}): Promise<string | null> {
  const sql = await getSql()
  const claimed = (await sql.query(CLAIM_FOOD_LINK_SQL, [
    randomUUID(),
    input.sourceId,
    input.externalId,
    input.fingerprint,
    NUTRITION_FOOD_ENTITY,
    input.foodId,
    JSON.stringify(input.payload),
  ])) as Array<{ entity_id: string }>
  return claimed[0]?.entity_id ?? null
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
  const fingerprint = usdaServingFingerprint({
    fdcId: candidate.fdcId,
    amount: portion.amount,
    unit: portion.unit,
    grams: portion.grams,
  })
  const sourceId = await sourceIdByKey(USDA_FOODDATA_SOURCE_KEY)
  const existing = await findFoodByFingerprint(sourceId, fingerprint)
  if (existing) {
    return { food: existing, reused: true }
  }
  const scaled = scalePer100Grams(candidate, portion.grams)
  const input = parseOr400(
    nutritionFoodCreateSchema,
    {
      name: candidate.name,
      catalogKind: 'ingredient',
      servingQuantity: portion.amount,
      servingUnit: portion.unit,
      servingGrams: portion.grams,
      calories: scaled.calories,
      protein: scaled.protein,
      carbs: scaled.carbs,
      fat: scaled.fat,
      fiber: scaled.fiber,
      sodium: scaled.sodium,
      sourceKind: 'usda',
    },
    'Invalid USDA food',
  )
  const foodId = randomUUID()
  const claimedId = await claimFoodLink({
    sourceId,
    externalId: usdaExternalId(candidate.fdcId),
    fingerprint,
    foodId,
    payload: {
      provider: USDA_FOODDATA_SOURCE_KEY,
      fdcId: candidate.fdcId,
      portionLabel: portion.label,
      amount: portion.amount,
      unit: portion.unit,
      grams: portion.grams,
    },
  })
  if (!claimedId) {
    const raced = await findFoodByFingerprint(sourceId, fingerprint)
    if (raced) {
      return { food: raced, reused: true }
    }
    throw new HttpError(409, 'USDA food already exists')
  }
  const sql = await getSql()
  const rows = (await sql.query(INSERT_FOOD_WITH_ID_SQL, [
    claimedId,
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
    input.sodium ?? null,
    'usda',
    false,
    null,
  ])) as Array<Record<string, unknown>>
  const food = rows[0] ? mapFoodRow(rows[0]) : null
  if (!food) {
    throw new HttpError(500, 'Food insert failed')
  }
  return { food, reused: false }
}

export async function saveAiReusableFood(body: unknown) {
  const requested = parseOr400(aiFoodSchema, body, 'Invalid reusable food')
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
      sodium: requested.sodium ?? null,
      sourceKind: 'description_ai',
    },
    'Invalid reusable food',
  )
  const fingerprint = descriptionFoodFingerprint({
    text: requested.text,
    name: input.name,
    servingQuantity: input.servingQuantity,
    servingUnit: input.servingUnit,
    servingGrams: input.servingGrams ?? null,
    calories: input.calories,
  })
  const sourceId = await sourceIdByKey('health_app')
  const existing = await findFoodByFingerprint(sourceId, fingerprint)
  if (existing) {
    return { food: existing, reused: true }
  }
  const foodId = randomUUID()
  const payload = descriptionFoodProvenance({
    text: requested.text,
    provider: requested.provider,
    model: requested.model ?? null,
    originalCalories: requested.originalCalories,
    adjusted: requested.adjusted,
    name: input.name,
    calories: input.calories,
    protein: input.protein ?? null,
    carbs: input.carbs ?? null,
    fat: input.fat ?? null,
    servingQuantity: input.servingQuantity,
    servingUnit: input.servingUnit,
    servingGrams: input.servingGrams ?? null,
  })
  const claimedId = await claimFoodLink({
    sourceId,
    externalId: fingerprint,
    fingerprint,
    foodId,
    payload,
  })
  if (!claimedId) {
    const raced = await findFoodByFingerprint(sourceId, fingerprint)
    if (raced) {
      return { food: raced, reused: true }
    }
    throw new HttpError(409, 'A food with this description already exists')
  }
  try {
    const sql = await getSql()
    const rows = (await sql.query(INSERT_FOOD_WITH_ID_SQL, [
      claimedId,
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
      input.sodium ?? null,
      'description_ai',
      false,
      null,
    ])) as Array<Record<string, unknown>>
    const food = rows[0] ? mapFoodRow(rows[0]) : null
    if (!food) {
      throw new HttpError(500, 'Food insert failed')
    }
    return { food, reused: false }
  } catch (error) {
    if (uniqueFoodConflict(error)) {
      throw new HttpError(409, 'A food with this name already exists')
    }
    throw error
  }
}
