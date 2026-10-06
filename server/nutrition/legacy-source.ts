import { neon } from '@neondatabase/serverless'
import { loadLocalEnv } from '../env.js'
import { HttpError } from '../http.js'
import type {
  LegacyFoodLog,
  LegacyIngredient,
  LegacyMealCombo,
  LegacyNutritionDump,
  LegacyPackagedFood,
} from '../../src/domain/nutrition/legacy.js'

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requireNumber(value: unknown): number {
  const parsed = asNumber(value)
  return parsed ?? Number.NaN
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

export async function getLegacyNutritionDatabaseUrl(): Promise<string> {
  await loadLocalEnv()
  const url = process.env.LEGACY_NUTRITION_DATABASE_URL
  if (typeof url !== 'string' || url.trim() === '') {
    throw new HttpError(
      503,
      'LEGACY_NUTRITION_DATABASE_URL is not set. Use the calorie-tracker Neon connection string (read-only).',
    )
  }
  return url
}

export type LegacyMealComboRecipeIngredient = {
  ingredientId: number
  name: string
  unit: string
  quantity: number
}

export type LegacyMealComboRecipe = {
  id: number
  name: string
  mealType: string
  notes: string | null
  instructions: string | null
  ingredients: LegacyMealComboRecipeIngredient[]
}

export async function loadLegacyMealComboRecipe(id: number): Promise<LegacyMealComboRecipe | null> {
  if (!Number.isInteger(id) || id <= 0) {
    return null
  }
  const sql = neon(await getLegacyNutritionDatabaseUrl())
  const rows = (await sql.query(
    `SELECT
       mc.id,
       mc.name,
       mc.meal_type,
       mc.notes,
       mc.instructions,
       mci.ingredient_id,
       mci.quantity,
       i.name AS ingredient_name,
       i.unit AS ingredient_unit
     FROM meal_combos mc
     LEFT JOIN meal_combo_ingredients mci ON mci.meal_combo_id = mc.id
     LEFT JOIN ingredients i ON i.id = mci.ingredient_id
     WHERE mc.id = $1
     ORDER BY mci.ingredient_id ASC`,
    [id],
  )) as Array<Record<string, unknown>>
  const first = rows[0]
  if (!first) {
    return null
  }
  return {
    id: Number(first.id),
    name: String(first.name ?? '').trim(),
    mealType: String(first.meal_type ?? ''),
    notes: first.notes == null ? null : String(first.notes),
    instructions: first.instructions == null ? null : String(first.instructions),
    ingredients: rows.flatMap((row) => {
      const ingredientId = asNumber(row.ingredient_id)
      const quantity = asNumber(row.quantity)
      if (ingredientId == null || quantity == null || !(quantity > 0)) {
        return []
      }
      return [{
        ingredientId,
        name: String(row.ingredient_name ?? `Ingredient ${ingredientId}`).trim(),
        unit: String(row.ingredient_unit ?? 'serving').trim() || 'serving',
        quantity,
      }]
    }),
  }
}

export async function loadLegacyNutritionDump(): Promise<LegacyNutritionDump> {
  const sql = neon(await getLegacyNutritionDatabaseUrl())
  const ingredients = (await sql.query(
    `SELECT id, name, calories, protein, carbs, fat, unit, is_staple FROM ingredients ORDER BY id`,
  )) as Array<Record<string, unknown>>
  const mealCombos = (await sql.query(
    `SELECT id, name, meal_type, calories, protein, carbs, fat, notes, instructions FROM meal_combos ORDER BY id`,
  )) as Array<Record<string, unknown>>
  const foods = (await sql.query(
    `SELECT id, name, calories, protein, carbs, fat, serving_amount, serving_unit, weight_grams,
            source_type, source_external_id, metadata
     FROM foods ORDER BY id`,
  )) as Array<Record<string, unknown>>
  const logs = (await sql.query(
    `SELECT id, logged_at, display_name, source_type, source_id, nutrition_source, quantity,
            serving_description, weight_grams, calories, protein, carbs, fat, original_input, metadata
     FROM food_logs ORDER BY id`,
  )) as Array<Record<string, unknown>>

  return {
    ingredients: ingredients.map(
      (row): LegacyIngredient => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        calories: requireNumber(row.calories),
        protein: requireNumber(row.protein),
        carbs: requireNumber(row.carbs),
        fat: requireNumber(row.fat),
        unit: String(row.unit ?? ''),
        is_staple: Boolean(row.is_staple),
      }),
    ),
    mealCombos: mealCombos.map(
      (row): LegacyMealCombo => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        meal_type: row.meal_type == null ? null : String(row.meal_type),
        calories: requireNumber(row.calories),
        protein: requireNumber(row.protein),
        carbs: requireNumber(row.carbs),
        fat: requireNumber(row.fat),
        notes: row.notes == null ? null : String(row.notes),
        instructions: row.instructions == null ? null : String(row.instructions),
      }),
    ),
    foods: foods.map(
      (row): LegacyPackagedFood => ({
        id: Number(row.id),
        name: String(row.name ?? ''),
        calories: requireNumber(row.calories),
        protein: asNumber(row.protein),
        carbs: asNumber(row.carbs),
        fat: asNumber(row.fat),
        serving_amount: asNumber(row.serving_amount),
        serving_unit: row.serving_unit == null ? null : String(row.serving_unit),
        weight_grams: asNumber(row.weight_grams),
        source_type: row.source_type == null ? null : String(row.source_type),
        source_external_id: row.source_external_id == null ? null : String(row.source_external_id),
        metadata: asRecord(row.metadata),
      }),
    ),
    logs: logs.map(
      (row): LegacyFoodLog => ({
        id: Number(row.id),
        logged_at: asIso(row.logged_at),
        display_name: String(row.display_name ?? ''),
        source_type: String(row.source_type ?? ''),
        source_id: asNumber(row.source_id),
        nutrition_source: String(row.nutrition_source ?? ''),
        quantity: requireNumber(row.quantity),
        serving_description: row.serving_description == null ? null : String(row.serving_description),
        weight_grams: asNumber(row.weight_grams),
        calories: requireNumber(row.calories),
        protein: asNumber(row.protein),
        carbs: asNumber(row.carbs),
        fat: asNumber(row.fat),
        original_input: row.original_input == null ? null : String(row.original_input),
        metadata: asRecord(row.metadata),
      }),
    ),
  }
}
