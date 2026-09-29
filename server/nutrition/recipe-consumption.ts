import { z } from 'zod'
import { NUTRITION_CONFIG, resolveEntryLogDate, resolveRecipePortion } from '../../src/domain/nutrition/index.js'
import { HttpError } from '../http.js'
import { getSql } from '../db.js'
import { insertRecipeEntry } from './queries.js'

const CURRENT_RECIPE_SQL = `SELECT recipes.id::text AS recipe_id, versions.id::text AS recipe_version_id,
  versions.version, versions.name, versions.calories_kcal, versions.protein_g, versions.carbs_g, versions.fat_g, versions.fiber_g, versions.sodium_mg,
  versions.yield_servings, versions.finished_weight_g
  FROM recipes
  JOIN recipe_versions versions ON versions.recipe_id = recipes.id AND versions.is_current
  WHERE recipes.is_active
  ORDER BY versions.name ASC, recipes.id ASC
  LIMIT $1`

const VERSION_SQL = `SELECT versions.id::text AS recipe_version_id, versions.recipe_id::text AS recipe_id,
  versions.version, versions.name, versions.calories_kcal, versions.protein_g, versions.carbs_g, versions.fat_g, versions.fiber_g, versions.sodium_mg,
  versions.yield_servings, versions.finished_weight_g
  FROM recipe_versions versions
  WHERE versions.id = $1::uuid`

type VersionRow = {
  recipe_id: string
  recipe_version_id: string
  version: number
  name: string
  calories_kcal: unknown
  protein_g: unknown
  carbs_g: unknown
  fat_g: unknown
  fiber_g: unknown
  sodium_mg: unknown
  yield_servings: unknown
  finished_weight_g: unknown
}

export async function listCurrentRecipeVersions(limit = NUTRITION_CONFIG.recipesLimit) {
  const sql = await getSql()
  const rows = (await sql.query(CURRENT_RECIPE_SQL, [limit])) as VersionRow[]
  return rows.map(mapVersion)
}

export async function logRecipeConsumption(body: unknown) {
  const input = parseLog(body)
  let resolvedDate
  try {
    resolvedDate = resolveEntryLogDate({
      logDate: input.logDate,
      timezone: input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    })
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid entry date')
  }
  const sql = await getSql()
  const rows = (await sql.query(VERSION_SQL, [input.recipeVersionId])) as VersionRow[]
  const version = rows[0] ? mapVersion(rows[0]) : null
  if (!version) throw new HttpError(404, 'Recipe version not found', undefined, 'missing_version')
  const portion = resolveRecipePortion(version, input.portionKind, input.amount)
  if ('error' in portion) throw new HttpError(422, portion.error, undefined, portion.code)
  const entry = await insertRecipeEntry([
    resolvedDate.logDate,
    resolvedDate.consumedAt,
    input.timezone ?? NUTRITION_CONFIG.calendarTimeZone,
    null,
    null,
    version.name,
    null,
    portion.servingQuantity,
    portion.servingUnit,
    portion.grams,
    portion.calories,
    portion.protein,
    portion.carbs,
    portion.fat,
    portion.fiber,
    portion.sodium,
    'manual',
    null,
    version.recipeVersionId,
    portion.kind,
    portion.amount,
    portion.fraction,
  ])
  return {
    ...entry,
    recipeId: version.recipeId,
    recipeVersionNumber: version.version,
    foodName: version.name,
  }
}

function parseLog(body: unknown): { recipeVersionId: string; logDate: string; portionKind: string; amount: number; timezone?: string } {
  if (body == null || typeof body !== 'object') throw new HttpError(400, 'Invalid recipe log')
  const record = body as Record<string, unknown>
  if (!z.uuid().safeParse(record.recipeVersionId).success) {
    throw new HttpError(400, 'recipeVersionId is invalid', undefined, 'invalid_id')
  }
  const amount = typeof record.amount === 'number' ? record.amount : Number(record.amount)
  if (!Number.isFinite(amount)) throw new HttpError(422, 'Amount must be greater than zero.', undefined, 'invalid_amount')
  const logDate = typeof record.logDate === 'string' ? record.logDate : ''
  const portionKind = typeof record.portionKind === 'string' ? record.portionKind : ''
  const timezone = typeof record.timezone === 'string' ? record.timezone : undefined
  return { recipeVersionId: String(record.recipeVersionId), logDate, portionKind, amount, timezone }
}

function mapVersion(row: VersionRow) {
  return {
    recipeId: row.recipe_id,
    recipeVersionId: row.recipe_version_id,
    version: Number(row.version),
    name: row.name,
    caloriesKcal: numberValue(row.calories_kcal),
    proteinG: optionalNumber(row.protein_g),
    carbsG: optionalNumber(row.carbs_g),
    fatG: optionalNumber(row.fat_g),
    fiberG: optionalNumber(row.fiber_g),
    sodiumMg: optionalNumber(row.sodium_mg),
    yieldServings: optionalNumber(row.yield_servings),
    finishedWeightG: optionalNumber(row.finished_weight_g),
  }
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
