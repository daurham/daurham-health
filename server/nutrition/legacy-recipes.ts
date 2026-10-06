import { randomUUID } from 'node:crypto'
import { NUTRITION_FOOD_ENTITY } from '../../src/domain/nutrition/config.js'
import { ingredientFingerprint } from '../../src/domain/nutrition/legacy.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { loadLegacyMealComboRecipe, type LegacyMealComboRecipe } from './legacy-source.js'
import {
  createRecipeWithId,
  getRecipe,
  type RecipeDetail,
} from './recipes.js'

const PROMOTED_RECIPE_ENTITY = 'recipe'
const PROMOTION_SUFFIX = ':first_class_recipe'

export type LegacyRecipeListItem = {
  foodId: string
  name: string
  archived: boolean
  mealType: string | null
  caloriesKcal: number
  proteinG: number | null
  carbsG: number | null
  fatG: number | null
  fiberG: number | null
  sodiumMg: number | null
  promotedRecipeId: string | null
  canUpgrade: boolean
}

type LegacyRecipeRow = {
  food_id: string
  name: string
  archived: boolean
  calories: unknown
  protein: unknown
  carbs: unknown
  fat: unknown
  fiber: unknown
  sodium: unknown
  source_id: string
  external_id: string | null
  external_fingerprint: string
  meal_type: string | null
  promoted_recipe_id: string | null
}

export type LegacyPromotionFood = {
  foodId: string
  name: string
  servingUnit: string
  archived: boolean
}

export type LegacyRecipeDraft = {
  name: string
  notes: string | null
  yieldServings: number
  finishedWeightG: null
  ingredients: Array<{ foodId: string; amount: number; unit: string }>
}

const LEGACY_RECIPE_SQL = `SELECT
    foods.id::text AS food_id,
    foods.name,
    foods.archived,
    foods.calories,
    foods.protein,
    foods.carbs,
    foods.fat,
    foods.fiber,
    foods.sodium,
    links.source_id::text AS source_id,
    links.external_id,
    links.external_fingerprint,
    links.source_payload->>'meal_type' AS meal_type,
    promoted.entity_id::text AS promoted_recipe_id
  FROM nutrition_foods foods
  JOIN source_record_links links
    ON links.entity_type = '${NUTRITION_FOOD_ENTITY}'
   AND links.entity_id = foods.id
  JOIN data_sources source
    ON source.id = links.source_id
   AND source.key = 'legacy_nutrition'
  LEFT JOIN source_record_links promoted
    ON promoted.source_id = links.source_id
   AND promoted.external_fingerprint = links.external_fingerprint || '${PROMOTION_SUFFIX}'
   AND promoted.entity_type = '${PROMOTED_RECIPE_ENTITY}'
  WHERE foods.catalog_kind = 'recipe'
    AND foods.source_kind = 'migrated'
    AND links.external_fingerprint LIKE 'legacy:meal_combo:%'`

export async function listLegacyRecipes(): Promise<{ recipes: LegacyRecipeListItem[] }> {
  const sql = await getSql()
  const rows = (await sql.query(
    `${LEGACY_RECIPE_SQL}
     ORDER BY foods.archived ASC, lower(foods.name) ASC, foods.id ASC`,
    [],
  )) as LegacyRecipeRow[]
  return { recipes: rows.map(mapLegacyRecipe) }
}

export function buildLegacyRecipeDraft(
  combo: LegacyMealComboRecipe,
  foodsByLegacyIngredientId: ReadonlyMap<number, LegacyPromotionFood>,
): LegacyRecipeDraft | { error: string } {
  if (combo.mealType !== 'composed') {
    return { error: 'This imported item was stored as a standalone food, so there is no ingredient list to upgrade automatically.' }
  }
  if (combo.ingredients.length === 0) {
    return { error: 'The old recipe has no ingredient links to recover. Rebuild it as a new Recipe instead.' }
  }

  const missing = combo.ingredients.filter((ingredient) => {
    const food = foodsByLegacyIngredientId.get(ingredient.ingredientId)
    return !food || food.archived
  })
  if (missing.length > 0) {
    const names = missing.slice(0, 4).map((item) => item.name).join(', ')
    const more = missing.length > 4 ? ` and ${missing.length - 4} more` : ''
    return {
      error: `Cannot upgrade until the imported ingredient${missing.length === 1 ? '' : 's'} are available: ${names}${more}. Restore or replace those foods, then try again.`,
    }
  }

  return {
    name: combo.name,
    notes: legacyNotes(combo),
    yieldServings: 1,
    finishedWeightG: null,
    ingredients: combo.ingredients.map((ingredient) => {
      const food = foodsByLegacyIngredientId.get(ingredient.ingredientId)
      if (!food) {
        throw new Error('Legacy ingredient resolution changed while building the recipe draft.')
      }
      return {
        foodId: food.foodId,
        amount: ingredient.quantity,
        unit: food.servingUnit || ingredient.unit || 'serving',
      }
    }),
  }
}

export async function promoteLegacyRecipe(
  foodId: string,
): Promise<{ legacyFoodId: string; alreadyPromoted: boolean; recipe: RecipeDetail }> {
  const sql = await getSql()
  const legacy = await getLegacyRecipeRow(sql, foodId)
  if (!legacy) {
    throw new HttpError(404, 'Imported legacy recipe not found.')
  }

  if (legacy.promoted_recipe_id) {
    if (!legacy.archived) {
      await sql.query('UPDATE nutrition_foods SET archived = true, updated_at = now() WHERE id = $1::uuid', [foodId])
    }
    return {
      legacyFoodId: foodId,
      alreadyPromoted: true,
      recipe: await getRecipe(legacy.promoted_recipe_id),
    }
  }

  const comboId = Number(legacy.external_id)
  if (!Number.isInteger(comboId) || comboId <= 0) {
    throw new HttpError(422, 'This imported recipe is missing its original legacy identifier.')
  }

  const combo = await loadLegacyMealComboRecipe(comboId)
  if (!combo) {
    throw new HttpError(404, 'The original recipe could not be found in the legacy nutrition database.')
  }

  const foodsByLegacyIngredientId = await resolveLegacyIngredients(sql, legacy.source_id, combo)
  const draft = buildLegacyRecipeDraft(combo, foodsByLegacyIngredientId)
  if ('error' in draft) {
    throw new HttpError(422, draft.error)
  }

  const promotionFingerprint = `${legacy.external_fingerprint}${PROMOTION_SUFFIX}`
  const recipeId = randomUUID()
  const now = new Date().toISOString()
  const reserved = (await sql.query(
    `INSERT INTO source_record_links (
       source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload, created_at
     ) VALUES (
       $1::uuid, NULL, $2, $3, $4, $5::uuid, $6::jsonb, $7::timestamptz
     )
     ON CONFLICT (source_id, external_fingerprint) DO NOTHING
     RETURNING entity_id::text AS recipe_id`,
    [
      legacy.source_id,
      legacy.external_id,
      promotionFingerprint,
      PROMOTED_RECIPE_ENTITY,
      recipeId,
      JSON.stringify({
        promoted_from_food_id: foodId,
        legacy_meal_combo_id: combo.id,
      }),
      now,
    ],
  )) as Array<{ recipe_id?: string }>

  if (!reserved[0]?.recipe_id) {
    const existing = await findPromotedRecipeId(sql, legacy.source_id, promotionFingerprint)
    if (!existing) {
      throw new HttpError(409, 'This imported recipe is already being upgraded. Try again.')
    }
    await sql.query('UPDATE nutrition_foods SET archived = true, updated_at = now() WHERE id = $1::uuid', [foodId])
    return {
      legacyFoodId: foodId,
      alreadyPromoted: true,
      recipe: await getRecipe(existing),
    }
  }

  try {
    const recipe = await createRecipeWithId(draft, recipeId)
    await sql.query('UPDATE nutrition_foods SET archived = true, updated_at = now() WHERE id = $1::uuid', [foodId])
    return { legacyFoodId: foodId, alreadyPromoted: false, recipe }
  } catch (error) {
    await sql.query(
      `DELETE FROM source_record_links
       WHERE source_id = $1::uuid
         AND external_fingerprint = $2
         AND entity_type = $3
         AND entity_id = $4::uuid`,
      [legacy.source_id, promotionFingerprint, PROMOTED_RECIPE_ENTITY, recipeId],
    )
    throw error
  }
}

async function getLegacyRecipeRow(sql: Sql, foodId: string): Promise<LegacyRecipeRow | null> {
  const rows = (await sql.query(
    `${LEGACY_RECIPE_SQL}
     AND foods.id = $1::uuid
     LIMIT 1`,
    [foodId],
  )) as LegacyRecipeRow[]
  return rows[0] ?? null
}

async function resolveLegacyIngredients(
  sql: Sql,
  sourceId: string,
  combo: LegacyMealComboRecipe,
): Promise<Map<number, LegacyPromotionFood>> {
  const fingerprints = combo.ingredients.map((ingredient) => ingredientFingerprint(ingredient.ingredientId))
  if (fingerprints.length === 0) {
    return new Map()
  }
  const rows = (await sql.query(
    `SELECT
       links.external_fingerprint,
       foods.id::text AS food_id,
       foods.name,
       foods.serving_unit,
       foods.archived
     FROM source_record_links links
     JOIN nutrition_foods foods ON foods.id = links.entity_id
     WHERE links.source_id = $1::uuid
       AND links.entity_type = $2
       AND links.external_fingerprint = ANY($3::text[])`,
    [sourceId, NUTRITION_FOOD_ENTITY, fingerprints],
  )) as Array<{
    external_fingerprint: string
    food_id: string
    name: string
    serving_unit: string
    archived: boolean
  }>

  const result = new Map<number, LegacyPromotionFood>()
  for (const row of rows) {
    const match = /^legacy:ingredient:(\d+)$/.exec(row.external_fingerprint)
    if (!match?.[1]) continue
    result.set(Number(match[1]), {
      foodId: row.food_id,
      name: row.name,
      servingUnit: row.serving_unit,
      archived: row.archived,
    })
  }
  return result
}

async function findPromotedRecipeId(sql: Sql, sourceId: string, fingerprint: string): Promise<string | null> {
  const rows = (await sql.query(
    `SELECT entity_id::text AS recipe_id
     FROM source_record_links
     WHERE source_id = $1::uuid
       AND external_fingerprint = $2
       AND entity_type = $3
     LIMIT 1`,
    [sourceId, fingerprint, PROMOTED_RECIPE_ENTITY],
  )) as Array<{ recipe_id?: string }>
  return rows[0]?.recipe_id ?? null
}

function mapLegacyRecipe(row: LegacyRecipeRow): LegacyRecipeListItem {
  return {
    foodId: row.food_id,
    name: row.name,
    archived: row.archived,
    mealType: row.meal_type,
    caloriesKcal: numberValue(row.calories),
    proteinG: optionalNumber(row.protein),
    carbsG: optionalNumber(row.carbs),
    fatG: optionalNumber(row.fat),
    fiberG: optionalNumber(row.fiber),
    sodiumMg: optionalNumber(row.sodium),
    promotedRecipeId: row.promoted_recipe_id,
    canUpgrade: row.meal_type === 'composed' && row.promoted_recipe_id == null,
  }
}

function legacyNotes(combo: LegacyMealComboRecipe): string | null {
  const parts: string[] = []
  if (combo.notes?.trim()) parts.push(combo.notes.trim())
  if (combo.instructions?.trim()) parts.push(`Instructions\n${combo.instructions.trim()}`)
  if (parts.length === 0) return null
  const combined = parts.join('\n\n')
  return combined.length <= 2000 ? combined : `${combined.slice(0, 1999).trimEnd()}…`
}

function numberValue(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function optionalNumber(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
