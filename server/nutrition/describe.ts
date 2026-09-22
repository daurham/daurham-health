import { createHash, randomUUID } from 'node:crypto'
import {
  NUTRITION_CONFIG,
  NutritionInterpretError,
  commitNutritionDescriptionEstimateRequestSchema,
  descriptionEstimateUserAdjusted,
  descriptionFailureMessage,
  resolveEntryLogDate,
  sanitizeDescriptionEstimate,
  validateMealEstimateReview,
  type DescriptionEstimateCandidate,
  type DescriptionEstimateInterpreter,
  type NutritionEntry,
} from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import { CLAIM_MEAL_GROUP_SQL } from './meal.js'
import { getEntry, insertEntryWithId } from './queries.js'

export type DescriptionPreview = DescriptionEstimateCandidate

export function descriptionEstimateFingerprint(input: {
  text: string
  logDate: string
  name: string
  calories: number
  proteinGrams: number
  carbsGrams: number
  fatGrams: number
  fiberGrams: number | null
}): string {
  const body = JSON.stringify({
    text: input.text.trim().toLowerCase().replace(/\s+/g, ' '),
    logDate: input.logDate,
    name: input.name.trim().toLowerCase(),
    calories: input.calories,
    proteinGrams: input.proteinGrams,
    carbsGrams: input.carbsGrams,
    fatGrams: input.fatGrams,
    fiberGrams: input.fiberGrams,
  })
  return `nutrition-describe-estimate-v1|${createHash('sha256').update(body).digest('hex')}`
}

export async function previewFoodDescription(
  text: string,
  options?: { interpret: DescriptionEstimateInterpreter },
): Promise<DescriptionPreview> {
  if (!options?.interpret) {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', descriptionFailureMessage('GEMINI_SEMANTIC'))
  }
  const interpreted = sanitizeDescriptionEstimate(await options.interpret.interpret(text), { original: text.trim() })
  if (interpreted.items.length === 0 || interpreted.calories <= 0) {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', descriptionFailureMessage('GEMINI_SEMANTIC'))
  }
  return interpreted
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

async function findEntryByFingerprint(sourceId: string, fingerprint: string): Promise<string | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT entity_id FROM source_record_links
     WHERE source_id = $1 AND entity_type = $2 AND external_fingerprint = $3
     LIMIT 1`,
    [sourceId, 'nutrition_entry', fingerprint],
  )) as Array<{ entity_id: string }>
  return rows[0]?.entity_id ?? null
}

export async function commitFoodDescription(body: unknown): Promise<{ entries: NutritionEntry[] }> {
  const parsed = commitNutritionDescriptionEstimateRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid food description')
  }
  const input = parsed.data
  const reviewErrors = validateMealEstimateReview({ name: input.name, calories: input.calories })
  if (reviewErrors.length > 0) {
    throw new HttpError(400, reviewErrors[0]?.message ?? 'Invalid food description', reviewErrors)
  }
  const reviewed = {
    calories: input.calories,
    proteinGrams: input.proteinGrams,
    carbsGrams: input.carbsGrams,
    fatGrams: input.fatGrams,
    fiberGrams: input.fiberGrams,
  }
  const interpreted = input.items && input.items.length > 0
    ? sanitizeDescriptionEstimate({ name: input.name, items: input.items, original: input.text })
    : null
  const aiEstimate = interpreted
    ? {
        calories: interpreted.calories,
        proteinGrams: interpreted.proteinGrams,
        carbsGrams: interpreted.carbsGrams,
        fatGrams: interpreted.fatGrams,
        fiberGrams: interpreted.fiberGrams,
      }
    : reviewed
  const resolved = resolveEntryLogDate({
    logDate: input.logDate,
    timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
  })
  const fingerprint = descriptionEstimateFingerprint({
    text: input.text,
    logDate: resolved.logDate,
    name: input.name,
    ...reviewed,
  })
  const sourceId = await sourceIdByKey('health_app')
  const existingId = await findEntryByFingerprint(sourceId, fingerprint)
  if (existingId) {
    const existing = await getEntry(existingId)
    if (existing) {
      return { entries: [existing] }
    }
  }

  const entryId = randomUUID()
  const sql = await getSql()
  const claimed = (await sql.query(CLAIM_MEAL_GROUP_SQL, [
    randomUUID(),
    sourceId,
    fingerprint,
    fingerprint,
    'nutrition_entry',
    entryId,
    JSON.stringify({
      source: 'description_ai',
      provider: 'gemini',
      estimated: true,
      reviewed: true,
      userAdjusted: descriptionEstimateUserAdjusted(aiEstimate, reviewed),
      originalDescription: input.text,
      interpretedItems: interpreted?.items ?? [],
      aiEstimate,
      reviewedValues: reviewed,
      portionScale: input.portionScale ?? 1,
    }),
  ])) as Array<{ entity_id: string }>
  const claimedId = claimed[0]?.entity_id
  if (claimedId && claimedId !== entryId) {
    const raced = await getEntry(claimedId)
    if (raced) {
      return { entries: [raced] }
    }
  }

  const entry = await insertEntryWithId([
    entryId,
    resolved.logDate,
    null,
    input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    input.meal ?? null,
    null,
    input.name.trim(),
    null,
    1,
    'meal',
    null,
    reviewed.calories,
    reviewed.proteinGrams,
    reviewed.carbsGrams,
    reviewed.fatGrams,
    reviewed.fiberGrams,
    'manual',
    'Reviewed from a food description estimate.',
    null,
  ])
  return { entries: [entry] }
}
