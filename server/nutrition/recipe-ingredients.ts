import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import {
  NUTRITION_FOOD_ENTITY,
  NUTRITION_MEAL_CAPTURE_KIND,
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
import { findCommittedLabelFood } from './label-jobs.js'
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
  // Only a reviewed Meal Photo saved to Pantry supplies a capture job ID.
  jobId: z.uuid().optional(),
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

/**
 * One SQL statement atomically holds the completed capture lock, claims the
 * canonical fingerprint, inserts its food and commits the Pantry-only job.
 * A concurrent first-time approval or Log Meal that wins the capture status
 * cannot leave behind a new Pantry link/food from a rejected save.
 *
 * This path applies ONLY to a new food for a real Meal Photo capture.
 * Generic AI food saves and reuses retain their existing behavior.
 */
export const ATOMIC_PANTRY_CAPTURE_SAVE_SQL = `WITH eligible_capture AS MATERIALIZED (
  SELECT home_ai_job_id
  FROM nutrition_capture_jobs
  WHERE home_ai_job_id = $1 AND capture_kind = $2 AND status = 'completed'
  FOR UPDATE
), claimed_link AS (
  INSERT INTO source_record_links (
    id, source_id, import_job_id, external_id, external_fingerprint,
    entity_type, entity_id, source_payload
  )
  SELECT $3::uuid, $4::uuid, NULL, $5, $6, $7, $8::uuid, $9::jsonb
  FROM eligible_capture
  ON CONFLICT (source_id, external_fingerprint) DO NOTHING
  RETURNING entity_id
), created_food AS (
  INSERT INTO nutrition_foods (
    id, name, brand, barcode, catalog_kind, serving_quantity, serving_unit,
    serving_grams, calories, protein, carbs, fat, fiber, sodium,
    source_kind, is_staple, notes
  )
  SELECT entity_id, $10, NULL, NULL, 'ingredient', $11, $12,
         $13, $14, $15, $16, $17, $18, $19, 'description_ai', false, NULL
  FROM claimed_link
  RETURNING *
), finalized_capture AS (
  UPDATE nutrition_capture_jobs jobs
  SET status = 'committed', food_id = food.id, entry_id = NULL,
      failure_message = NULL, committed_at = now(), updated_at = now()
  FROM created_food food
  WHERE jobs.home_ai_job_id = $1 AND jobs.capture_kind = $2
    AND jobs.status = 'completed'
  RETURNING jobs.home_ai_job_id
)
SELECT food.* FROM created_food food
JOIN finalized_capture ON true`

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

/**
 * Pantry-only approval must durably resolve the originating Meal Photo job;
 * hiding the card in React alone would allow it to reappear on reload.
 * Check the capture kind/status before inserting food, then use a conditional
 * update so a concurrent "Log Meal" cannot lose its linked entry ID.
 */
async function assertMealPhotoReadyForPantry(jobId: string | undefined): Promise<'completed' | 'committed' | null> {
  if (!jobId) return null
  const sql = await getSql()
  const rows = await sql.query(
    'SELECT capture_kind, status FROM nutrition_capture_jobs WHERE home_ai_job_id = $1',
    [jobId],
  ) as Array<{ capture_kind: string; status: string }>
  const job = rows[0]
  if (job?.capture_kind !== NUTRITION_MEAL_CAPTURE_KIND ||
      (job.status !== 'completed' && job.status !== 'committed')) {
    throw new HttpError(409, 'Meal capture is not ready to save to Pantry')
  }
  return job.status
}

async function markMealPhotoSavedToPantry(jobId: string | undefined, foodId: string): Promise<void> {
  if (!jobId) return
  const sql = await getSql()
  const rows = await sql.query(
    `UPDATE nutrition_capture_jobs
     SET status = 'committed', food_id = $2::uuid, entry_id = NULL,
         failure_message = NULL, committed_at = now(), updated_at = now()
     WHERE home_ai_job_id = $1 AND capture_kind = $3 AND status = 'completed'
     RETURNING home_ai_job_id`,
    [jobId, foodId, NUTRITION_MEAL_CAPTURE_KIND],
  ) as unknown[]
  if (rows.length > 0) return
  // Safe retry after a lost response: never rewrite a different food or an
  // existing logged entry when the job was already committed.
  const committed = await findCommittedLabelFood(jobId)
  if (committed?.foodId === foodId && committed.entryId === null) return
  throw new HttpError(409, 'Meal capture has already been finalized elsewhere')
}

export async function saveAiReusableFood(body: unknown) {
  const requested = parseOr400(aiFoodSchema, body, 'Invalid reusable food')
  const captureStatus = await assertMealPhotoReadyForPantry(requested.jobId)
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
  // A committed capture is immutable. A changed retry must never create a
  // second Pantry food/link before the finalization conflict is detected.
  if (captureStatus === 'committed' && requested.jobId) {
    const committed = await findCommittedLabelFood(requested.jobId)
    if (!existing || !committed || committed.entryId !== null || committed.foodId !== existing.id) {
      throw new HttpError(409, 'Meal capture has already been finalized elsewhere')
    }
    return { food: existing, reused: true }
  }
  if (existing) {
    await markMealPhotoSavedToPantry(requested.jobId, existing.id)
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
  if (requested.jobId) {
    // A status check before insertion is not sufficient: Log Meal or another
    // Pantry approval can commit in the gap between independent HTTP queries.
    // The row lock + dependent data-modifying CTEs make the FIRST save atomic.
    try {
      const sql = await getSql()
      const rows = await sql.query(ATOMIC_PANTRY_CAPTURE_SAVE_SQL, [
        requested.jobId, NUTRITION_MEAL_CAPTURE_KIND,
        randomUUID(), sourceId, fingerprint, fingerprint,
        NUTRITION_FOOD_ENTITY, foodId, JSON.stringify(payload),
        input.name, input.servingQuantity, input.servingUnit,
        input.servingGrams ?? null, input.calories,
        input.protein ?? null, input.carbs ?? null, input.fat ?? null,
        input.fiber ?? null, input.sodium ?? null,
      ]) as Array<Record<string, unknown>>
      if (rows[0]) return { food: mapFoodRow(rows[0]), reused: false }
      // A concurrent identical approval can legitimately win the claim.
      // Only reuse it if its job finalization agrees with this fingerprint.
      const raced = await findFoodByFingerprint(sourceId, fingerprint)
      if (raced) {
        await markMealPhotoSavedToPantry(requested.jobId, raced.id)
        return { food: raced, reused: true }
      }
      throw new HttpError(409, 'Meal capture has already been finalized elsewhere')
    } catch (error) {
      if (uniqueFoodConflict(error)) throw new HttpError(409, 'A food with this name already exists')
      throw error
    }
  }

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
      await markMealPhotoSavedToPantry(requested.jobId, raced.id)
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
    await markMealPhotoSavedToPantry(requested.jobId, food.id)
    return { food, reused: false }
  } catch (error) {
    if (uniqueFoodConflict(error)) {
      throw new HttpError(409, 'A food with this name already exists')
    }
    throw error
  }
}
