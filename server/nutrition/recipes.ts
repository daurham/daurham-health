import { randomUUID } from 'node:crypto'
import {
  parseRecipeDraft,
  previewRecipeVersion,
  RECIPE_ARCHIVED,
  RECIPE_MISSING_FOOD,
  RECIPE_NO_CHANGES,
  RECIPE_STALE_PREVIEW,
  RECIPE_STALE_VERSION,
  type RecipeVersionSnapshot,
} from '../../src/domain/nutrition/recipe-versions.js'
import {
  parseRecipeCreate,
  recipeFoodIds,
  supportedDisplayUnits,
  type RecipeFoodBasis,
  type RecipeLine,
} from '../../src/domain/nutrition/recipes.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'

export type RecipeIngredientView = RecipeLine & {
  id: string
  supportedUnits: string[]
}

export type RecipeVersionView = {
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
  ingredients: RecipeIngredientView[]
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
  version: RecipeVersionView
  history: RecipeHistoryItem[]
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

const FOOD_BASIS_SQL = `SELECT id::text AS id, name, barcode, serving_quantity, serving_unit, serving_grams,
  calories, protein, carbs, fat, fiber, sodium_mg, source_kind, archived
  FROM nutrition_foods
  WHERE id = ANY($1::uuid[])`

export async function listRecipes(): Promise<{ recipes: RecipeListItem[] }> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT recipes.id::text AS id, versions.version, versions.name, versions.is_current,
            versions.calories_kcal, versions.yield_servings, versions.finished_weight_g
     FROM recipes
     JOIN recipe_versions versions ON versions.recipe_id = recipes.id AND versions.is_current
     WHERE recipes.is_active
     ORDER BY versions.name ASC, recipes.id ASC`,
    [],
  )) as RecipeListRow[]
  return { recipes: rows.map(mapListItem) }
}

export async function getRecipe(id: string): Promise<RecipeDetail> {
  const sql = await getSql()
  const detail = await readRecipe(sql, id)
  if (!detail) throw new HttpError(404, 'Recipe not found')
  return detail
}

export async function getRecipeVersion(id: string, version: number): Promise<RecipeDetail> {
  const sql = await getSql()
  const detail = await readRecipe(sql, id, version)
  if (!detail) throw new HttpError(404, 'Recipe not found')
  return detail
}

export async function previewRecipeEdit(id: string, body: unknown) {
  const preview = await buildRecipePreview(id, body, false)
  const { candidate, expectedFoods, ...response } = preview
  void candidate
  void expectedFoods
  return response
}

export async function commitRecipeVersion(id: string, body: unknown): Promise<RecipeDetail> {
  const preview = await buildRecipePreview(id, body, true)
  if (!preview.canCommit || !preview.candidate || !preview.previewFingerprint) {
    if (preview.status === 'no_changes') throw new HttpError(409, 'No recipe changes to save.', undefined, RECIPE_NO_CHANGES)
    throw new HttpError(422, preview.warnings[0] ?? 'Replace or remove the ingredient whose food is no longer available.', undefined, RECIPE_MISSING_FOOD)
  }
  const draft = parseRecipeDraft(body, true)
  if ('error' in draft) throw recipeInputError(draft)
  if (draft.previewFingerprint !== preview.previewFingerprint) {
    throw new HttpError(409, 'Recipe ingredients changed since preview.', undefined, RECIPE_STALE_PREVIEW)
  }
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const versionId = randomUUID()
  const now = new Date().toISOString()
  const ingredientIds = preview.candidate.ingredients.map(() => randomUUID())
  const lines = preview.candidate.ingredients.map((line, index) => ({
    id: ingredientIds[index],
    position: line.position,
    food_id: line.foodId,
    amount: line.amount,
    unit: line.unit,
    scale_factor: line.scaleFactor,
    food_name_snapshot: line.foodNameSnapshot,
    food_source_type_snapshot: line.foodSourceTypeSnapshot,
    food_source_external_id_snapshot: line.foodSourceExternalIdSnapshot,
    base_serving_amount_snapshot: line.baseServingAmountSnapshot,
    base_serving_unit_snapshot: line.baseServingUnitSnapshot,
    base_weight_grams_snapshot: line.baseWeightGramsSnapshot,
    base_calories_kcal_snapshot: line.baseCaloriesKcalSnapshot,
    base_protein_g_snapshot: line.baseProteinGSnapshot,
    base_carbs_g_snapshot: line.baseCarbsGSnapshot,
    base_fat_g_snapshot: line.baseFatGSnapshot,
    base_fiber_g_snapshot: line.baseFiberGSnapshot,
    base_sodium_mg_snapshot: line.baseSodiumMgSnapshot,
    line_calories_kcal: line.lineCaloriesKcal,
    line_protein_g: line.lineProteinG,
    line_carbs_g: line.lineCarbsG,
    line_fat_g: line.lineFatG,
    line_fiber_g: line.lineFiberG,
    line_sodium_mg: line.lineSodiumMg,
  }))
  let results: [
    unknown,
    Array<{ version?: number }>,
    Array<{ id?: string }>,
    unknown,
    Array<{ id?: string }>,
    Array<{ status?: string }>,
    unknown,
  ]
  try {
    results = (await sql.transaction([
    sql.query(
      `SELECT recipes.id::text AS id
       FROM recipes
       JOIN recipe_versions ON recipe_versions.recipe_id = recipes.id AND recipe_versions.is_current
       WHERE recipes.id = $1::uuid
       FOR UPDATE OF recipes, recipe_versions`,
      [id],
    ),
    sql.query(
      `UPDATE recipe_versions
       SET is_current = false
       WHERE recipe_id = $1::uuid
         AND id = $2::uuid
         AND is_current
         AND EXISTS (SELECT 1 FROM recipes WHERE id = $1::uuid AND is_active)
         AND NOT EXISTS (${FOOD_MISMATCH_SQL})
       RETURNING version`,
      [id, preview.sourceVersionId, JSON.stringify(preview.expectedFoods)],
    ),
    sql.query(
      `INSERT INTO recipe_versions (
         id, recipe_id, version, is_current, name, notes, yield_servings, finished_weight_g,
         calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, calculation_version, source_id, created_at
       )
       SELECT $2::uuid, $1::uuid, version + 1, true, $4, $5, $6::numeric, $7::numeric,
              $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::numeric, $13::numeric, $14, $15::uuid, $16::timestamptz
       FROM recipe_versions
       WHERE id = $3::uuid
         AND recipe_id = $1::uuid
         AND is_current = false
         AND NOT EXISTS (SELECT 1 FROM recipe_versions WHERE recipe_id = $1::uuid AND is_current)
       RETURNING id::text AS id, version, created_at`,
      [
        id,
        versionId,
        preview.sourceVersionId,
        preview.candidate.name,
        preview.candidate.notes,
        preview.candidate.yieldServings,
        preview.candidate.finishedWeightG,
        preview.candidate.caloriesKcal,
        preview.candidate.proteinG,
        preview.candidate.carbsG,
        preview.candidate.fatG,
        preview.candidate.fiberG,
        preview.candidate.sodiumMg,
        preview.candidate.calculationVersion,
        sourceId,
        now,
      ],
    ),
    sql.query(
      `INSERT INTO recipe_version_ingredients (
         id, recipe_version_id, position, food_id, amount, unit, scale_factor,
         food_name_snapshot, food_source_type_snapshot, food_source_external_id_snapshot,
         base_serving_amount_snapshot, base_serving_unit_snapshot, base_weight_grams_snapshot,
         base_calories_kcal_snapshot, base_protein_g_snapshot, base_carbs_g_snapshot, base_fat_g_snapshot, base_fiber_g_snapshot, base_sodium_mg_snapshot,
         line_calories_kcal, line_protein_g, line_carbs_g, line_fat_g, line_fiber_g, line_sodium_mg, created_at
       )
       SELECT line.id::uuid, $2::uuid, line.position, line.food_id::uuid, line.amount, line.unit, line.scale_factor,
              line.food_name_snapshot, line.food_source_type_snapshot, line.food_source_external_id_snapshot,
              line.base_serving_amount_snapshot, line.base_serving_unit_snapshot, line.base_weight_grams_snapshot,
              line.base_calories_kcal_snapshot, line.base_protein_g_snapshot, line.base_carbs_g_snapshot, line.base_fat_g_snapshot, line.base_fiber_g_snapshot, line.base_sodium_mg_snapshot,
              line.line_calories_kcal, line.line_protein_g, line.line_carbs_g, line.line_fat_g, line.line_fiber_g, line.line_sodium_mg, $3::timestamptz
       FROM jsonb_to_recordset($1::jsonb) AS line(
         id text, position integer, food_id text, amount numeric, unit text, scale_factor numeric,
         food_name_snapshot text, food_source_type_snapshot text, food_source_external_id_snapshot text,
         base_serving_amount_snapshot numeric, base_serving_unit_snapshot text, base_weight_grams_snapshot numeric,
         base_calories_kcal_snapshot numeric, base_protein_g_snapshot numeric, base_carbs_g_snapshot numeric, base_fat_g_snapshot numeric, base_fiber_g_snapshot numeric, base_sodium_mg_snapshot numeric,
         line_calories_kcal numeric, line_protein_g numeric, line_carbs_g numeric, line_fat_g numeric, line_fiber_g numeric, line_sodium_mg numeric
       )
       WHERE EXISTS (SELECT 1 FROM recipe_versions WHERE id = $2::uuid)`,
      [JSON.stringify(lines), versionId, now],
    ),
    sql.query(
      `UPDATE recipes SET updated_at = $2::timestamptz
       WHERE id = $1::uuid AND EXISTS (SELECT 1 FROM recipe_versions WHERE id = $3::uuid)
       RETURNING id::text AS id`,
      [id, now, versionId],
    ),
    sql.query(
      `SELECT CASE
         WHEN NOT EXISTS (SELECT 1 FROM recipes WHERE id = $1::uuid) THEN 'missing'
         WHEN NOT EXISTS (SELECT 1 FROM recipes WHERE id = $1::uuid AND is_active) THEN 'archived'
         WHEN NOT EXISTS (
           SELECT 1 FROM recipe_versions WHERE recipe_id = $1::uuid AND is_current AND id = $2::uuid
         ) THEN 'stale_version'
         WHEN EXISTS (${FOOD_MISMATCH_SQL}) THEN 'stale_preview'
         ELSE 'ok'
       END AS status`,
      [id, preview.sourceVersionId, JSON.stringify(preview.expectedFoods)],
    ),
    sql.query(
      `SELECT CASE
         WHEN EXISTS (
           SELECT 1 FROM recipe_versions
           WHERE id = $2::uuid AND recipe_id = $1::uuid AND is_current = false
         )
         AND NOT EXISTS (SELECT 1 FROM recipe_versions WHERE id = $3::uuid)
         THEN 1 / 0
         ELSE 1
       END AS version_guard`,
      [id, preview.sourceVersionId, versionId],
    ),
  ])) as [
    unknown,
    Array<{ version?: number }>,
    Array<{ id?: string }>,
    unknown,
    Array<{ id?: string }>,
    Array<{ status?: string }>,
    unknown,
  ]
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('division by zero') || message.includes('22012')) {
      throw new HttpError(409, 'Recipe changed since editing began.', undefined, RECIPE_STALE_VERSION)
    }
    throw error
  }
  if (!results[2]?.[0]?.id || !results[4]?.[0]?.id) {
    const status = results[5]?.[0]?.status
    if (status === 'archived') throw new HttpError(409, 'Restore this Recipe before editing.', undefined, RECIPE_ARCHIVED)
    if (status === 'stale_preview') throw new HttpError(409, 'Recipe ingredients changed since preview.', undefined, RECIPE_STALE_PREVIEW)
    if (status === 'missing') throw new HttpError(404, 'Recipe not found')
    throw new HttpError(409, 'Recipe changed since editing began.', undefined, RECIPE_STALE_VERSION)
  }
  return getRecipe(id)
}

async function buildRecipePreview(id: string, body: unknown, committing: boolean) {
  const draft = parseRecipeDraft(body, committing)
  if ('error' in draft) throw recipeInputError(draft)
  const sql = await getSql()
  const detail = await readRecipe(sql, id)
  if (!detail) throw new HttpError(404, 'Recipe not found')
  if (!detail.isActive) throw new HttpError(409, 'Restore this Recipe before editing.', undefined, RECIPE_ARCHIVED)
  if (draft.sourceVersionId !== detail.version.id) {
    throw new HttpError(409, 'Recipe changed since editing began.', undefined, RECIPE_STALE_VERSION)
  }
  const ids = draft.ingredients.flatMap((line) => (line.foodId ? [line.foodId] : []))
  const loaded = await loadFoodBasis(sql, ids)
  const preview = previewRecipeVersion({
    recipeId: id,
    current: snapshotFromView(detail.version),
    draft,
    foods: loaded.foods,
  })
  if ('error' in preview) throw new HttpError(422, preview.error)
  return { ...preview, expectedFoods: loaded.expected }
}

function snapshotFromView(version: RecipeVersionView): RecipeVersionSnapshot {
  return {
    id: version.id,
    version: version.version,
    name: version.name,
    notes: version.notes,
    yieldServings: version.yieldServings,
    finishedWeightG: version.finishedWeightG,
    caloriesKcal: version.caloriesKcal,
    proteinG: version.proteinG,
    carbsG: version.carbsG,
    fatG: version.fatG,
    fiberG: version.fiberG,
    sodiumMg: version.sodiumMg,
    calculationVersion: version.calculationVersion,
    ingredients: version.ingredients,
  }
}

function recipeInputError(result: { error: string; code?: string }): HttpError {
  const status = result.code === RECIPE_STALE_VERSION || result.code === RECIPE_STALE_PREVIEW ? 409 : 422
  return new HttpError(status, result.error, undefined, result.code)
}

const FOOD_MISMATCH_SQL = `SELECT 1
  FROM jsonb_to_recordset($3::jsonb) AS expected(
    id uuid, name text, serving_quantity text, serving_unit text, serving_grams text,
    calories text, protein text, carbs text, fat text, fiber text, sodium_mg text, archived boolean
  )
  LEFT JOIN nutrition_foods foods ON foods.id = expected.id
  WHERE foods.id IS NULL
     OR foods.archived IS DISTINCT FROM expected.archived
     OR foods.name IS DISTINCT FROM expected.name
     OR foods.serving_unit IS DISTINCT FROM expected.serving_unit
     OR foods.serving_quantity IS DISTINCT FROM NULLIF(expected.serving_quantity, '')::numeric
     OR foods.serving_grams IS DISTINCT FROM NULLIF(expected.serving_grams, '')::numeric
     OR foods.calories IS DISTINCT FROM NULLIF(expected.calories, '')::numeric
     OR foods.protein IS DISTINCT FROM NULLIF(expected.protein, '')::numeric
     OR foods.carbs IS DISTINCT FROM NULLIF(expected.carbs, '')::numeric
     OR foods.fat IS DISTINCT FROM NULLIF(expected.fat, '')::numeric
     OR foods.fiber IS DISTINCT FROM NULLIF(expected.fiber, '')::numeric
     OR foods.sodium_mg IS DISTINCT FROM NULLIF(expected.sodium_mg, '')::numeric`

export async function createRecipe(body: unknown): Promise<RecipeDetail> {
  const ids = recipeFoodIds(body)
  if ('error' in ids) throw new HttpError(422, ids.error)
  const sql = await getSql()
  const foods = (await loadFoodBasis(sql, ids)).foods
  const composed = parseRecipeCreate(body, foods)
  if ('error' in composed) throw new HttpError(422, composed.error)
  const sourceId = await manualSourceId(sql)
  const recipeId = randomUUID()
  const versionId = randomUUID()
  const now = new Date().toISOString()
  const ingredientIds = composed.ingredients.map(() => randomUUID())
  const results = (await sql.transaction([
    sql.query(
      `INSERT INTO recipes (id, is_active, source_id, created_at, updated_at)
       VALUES ($1::uuid, true, $2::uuid, $3::timestamptz, $3::timestamptz)
       RETURNING id::text AS id, created_at, updated_at`,
      [recipeId, sourceId, now],
    ),
    sql.query(
      `INSERT INTO recipe_versions (
         id, recipe_id, version, is_current, name, notes, yield_servings, finished_weight_g,
         calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, calculation_version, source_id, created_at
       ) VALUES (
         $1::uuid, $2::uuid, 1, true, $3, $4, $5::numeric, $6::numeric,
         $7::numeric, $8::numeric, $9::numeric, $10::numeric, $11::numeric, $12::numeric, $13, $14::uuid, $15::timestamptz
       )
       RETURNING id::text AS id, created_at`,
      [
        versionId,
        recipeId,
        composed.name,
        composed.notes,
        composed.yieldServings,
        composed.finishedWeightG,
        composed.caloriesKcal,
        composed.proteinG,
        composed.carbsG,
        composed.fatG,
        composed.fiberG,
        composed.sodiumMg,
        composed.calculationVersion,
        sourceId,
        now,
      ],
    ),
    ...composed.ingredients.map((line, index) =>
      sql.query(
        `INSERT INTO recipe_version_ingredients (
           id, recipe_version_id, position, food_id, amount, unit, scale_factor,
           food_name_snapshot, food_source_type_snapshot, food_source_external_id_snapshot,
           base_serving_amount_snapshot, base_serving_unit_snapshot, base_weight_grams_snapshot,
           base_calories_kcal_snapshot, base_protein_g_snapshot, base_carbs_g_snapshot, base_fat_g_snapshot, base_fiber_g_snapshot, base_sodium_mg_snapshot,
           line_calories_kcal, line_protein_g, line_carbs_g, line_fat_g, line_fiber_g, line_sodium_mg, created_at
         ) VALUES (
           $1::uuid, $2::uuid, $3::integer, $4::uuid, $5::numeric, $6, $7::numeric,
           $8, $9, $10,
           $11::numeric, $12, $13::numeric,
           $14::numeric, $15::numeric, $16::numeric, $17::numeric, $18::numeric, $19::numeric,
           $20::numeric, $21::numeric, $22::numeric, $23::numeric, $24::numeric, $25::numeric, $26::timestamptz
         )`,
        [
          ingredientIds[index],
          versionId,
          line.position,
          line.foodId,
          line.amount,
          line.unit,
          line.scaleFactor,
          line.foodNameSnapshot,
          line.foodSourceTypeSnapshot,
          line.foodSourceExternalIdSnapshot,
          line.baseServingAmountSnapshot,
          line.baseServingUnitSnapshot,
          line.baseWeightGramsSnapshot,
          line.baseCaloriesKcalSnapshot,
          line.baseProteinGSnapshot,
          line.baseCarbsGSnapshot,
          line.baseFatGSnapshot,
          line.baseFiberGSnapshot,
          line.baseSodiumMgSnapshot,
          line.lineCaloriesKcal,
          line.lineProteinG,
          line.lineCarbsG,
          line.lineFatG,
          line.lineFiberG,
          line.lineSodiumMg,
          now,
        ],
      ),
    ),
  ])) as Array<Array<{ id?: string; created_at?: string; updated_at?: string }>>
  const created = results[0]?.[0]
  const version = results[1]?.[0]
  if (!created?.id || !version?.id) throw new HttpError(500, 'Recipe insert failed')
  return {
    id: created.id,
    isActive: true,
    createdAt: instant(created.created_at) ?? now,
    updatedAt: instant(created.updated_at) ?? now,
    version: {
      id: version.id,
      version: 1,
      isCurrent: true,
      name: composed.name,
      notes: composed.notes,
      yieldServings: composed.yieldServings,
      finishedWeightG: composed.finishedWeightG,
      caloriesKcal: composed.caloriesKcal,
      proteinG: composed.proteinG,
      carbsG: composed.carbsG,
      fatG: composed.fatG,
      calculationVersion: composed.calculationVersion,
      createdAt: instant(version.created_at) ?? now,
      ingredients: composed.ingredients.map((line, index) => ({
        ...line,
        id: ingredientIds[index] ?? '',
        supportedUnits: supportedDisplayUnits(line),
      })),
    },
    history: [
      {
        id: version.id,
        version: 1,
        isCurrent: true,
        name: composed.name,
        createdAt: instant(version.created_at) ?? now,
      },
    ],
  }
}

export async function archiveRecipe(id: string): Promise<RecipeDetail> {
  return setActive(id, false)
}

export async function restoreRecipe(id: string): Promise<RecipeDetail> {
  return setActive(id, true)
}

async function setActive(id: string, isActive: boolean): Promise<RecipeDetail> {
  const sql = await getSql()
  const rows = (await sql.query(
    `UPDATE recipes SET is_active = $2, updated_at = now() WHERE id = $1::uuid RETURNING id::text AS id`,
    [id, isActive],
  )) as Array<{ id?: string }>
  if (!rows[0]?.id) throw new HttpError(404, 'Recipe not found')
  return getRecipe(id)
}

async function loadFoodBasis(sql: Sql, ids: string[]): Promise<{ foods: Map<string, RecipeFoodBasis>; expected: ExpectedFood[] }> {
  const unique = [...new Set(ids)]
  const rows = unique.length === 0 ? [] : ((await sql.query(FOOD_BASIS_SQL, [unique])) as FoodBasisRow[])
  const foods = new Map<string, RecipeFoodBasis>()
  const expected: ExpectedFood[] = []
  for (const row of rows) {
    foods.set(row.id, {
      id: row.id,
      name: row.name,
      servingQuantity: numberValue(row.serving_quantity),
      servingUnit: row.serving_unit,
      servingGrams: optionalNumber(row.serving_grams),
      calories: numberValue(row.calories),
      protein: optionalNumber(row.protein),
      carbs: optionalNumber(row.carbs),
      fat: optionalNumber(row.fat),
      fiber: optionalNumber(row.fiber),
      sodiumMg: optionalNumber(row.sodium_mg),
      sourceKind: row.source_kind,
      barcode: row.barcode,
      archived: row.archived,
    })
    expected.push({
      id: row.id,
      name: row.name,
      serving_quantity: rawText(row.serving_quantity),
      serving_unit: row.serving_unit,
      serving_grams: rawText(row.serving_grams),
      calories: rawText(row.calories),
      protein: rawText(row.protein),
      carbs: rawText(row.carbs),
      fat: rawText(row.fat),
      fiber: rawText(row.fiber),
      sodium_mg: rawText(row.sodium_mg),
      archived: row.archived,
    })
  }
  return { foods, expected }
}

async function readRecipe(sql: Sql, id: string, versionNumber?: number): Promise<RecipeDetail | null> {
  const recipes = (await sql.query(
    `SELECT id::text AS id, is_active, created_at, updated_at
     FROM recipes WHERE id = $1::uuid`,
    [id],
  )) as RecipeRow[]
  const recipe = recipes[0]
  if (!recipe) return null
  const historyRows = (await sql.query(
    `SELECT id::text AS id, version, is_current, name, created_at
     FROM recipe_versions
     WHERE recipe_id = $1::uuid
     ORDER BY version DESC`,
    [id],
  )) as HistoryRow[]
  const versions = (await sql.query(
    `SELECT id::text AS id, version, is_current, name, notes, yield_servings, finished_weight_g,
            calories_kcal, protein_g, carbs_g, fat_g, fiber_g, sodium_mg, calculation_version, created_at
     FROM recipe_versions
     WHERE recipe_id = $1::uuid AND ${versionNumber == null ? 'is_current' : 'version = $2::integer'}
     LIMIT 1`,
    versionNumber == null ? [id] : [id, versionNumber],
  )) as VersionRow[]
  const version = versions[0]
  if (!version) throw new HttpError(404, 'Recipe version not found')
  const ingredients = (await sql.query(
    `SELECT id::text AS id, position, food_id::text AS food_id, amount, unit, scale_factor,
            food_name_snapshot, food_source_type_snapshot, food_source_external_id_snapshot,
            base_serving_amount_snapshot, base_serving_unit_snapshot, base_weight_grams_snapshot,
            base_calories_kcal_snapshot, base_protein_g_snapshot, base_carbs_g_snapshot, base_fat_g_snapshot, base_fiber_g_snapshot, base_sodium_mg_snapshot,
            line_calories_kcal, line_protein_g, line_carbs_g, line_fat_g, line_fiber_g, line_sodium_mg
     FROM recipe_version_ingredients
     WHERE recipe_version_id = $1::uuid
     ORDER BY position ASC`,
    [version.id],
  )) as IngredientRow[]
  return {
    id: recipe.id,
    isActive: recipe.is_active,
    createdAt: instant(recipe.created_at) ?? '',
    updatedAt: instant(recipe.updated_at) ?? '',
    version: {
      id: version.id,
      version: version.version,
      isCurrent: version.is_current,
      name: version.name,
      notes: version.notes,
      yieldServings: optionalNumber(version.yield_servings),
      finishedWeightG: optionalNumber(version.finished_weight_g),
      caloriesKcal: numberValue(version.calories_kcal),
      proteinG: optionalNumber(version.protein_g),
      carbsG: optionalNumber(version.carbs_g),
      fatG: optionalNumber(version.fat_g),
      fiberG: optionalNumber(version.fiber_g),
      sodiumMg: optionalNumber(version.sodium_mg),
      calculationVersion: version.calculation_version,
      createdAt: instant(version.created_at) ?? '',
      ingredients: ingredients.map(mapIngredient),
    },
    history: historyRows.map((item) => ({
      id: item.id,
      version: item.version,
      isCurrent: item.is_current,
      name: item.name,
      createdAt: instant(item.created_at) ?? '',
    })),
  }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual' LIMIT 1`, [])) as Array<{
    id?: string
  }>
  const id = rows[0]?.id
  if (!id) throw new HttpError(500, 'Manual data source is missing')
  return id
}

function mapListItem(row: RecipeListRow): RecipeListItem {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    isCurrent: row.is_current,
    caloriesKcal: numberValue(row.calories_kcal),
    yieldServings: optionalNumber(row.yield_servings),
    finishedWeightG: optionalNumber(row.finished_weight_g),
  }
}

function mapIngredient(row: IngredientRow): RecipeIngredientView {
  const line: RecipeLine = {
    position: row.position,
    foodId: row.food_id,
    amount: numberValue(row.amount),
    unit: row.unit,
    scaleFactor: numberValue(row.scale_factor),
    foodNameSnapshot: row.food_name_snapshot,
    foodSourceTypeSnapshot: row.food_source_type_snapshot,
    foodSourceExternalIdSnapshot: row.food_source_external_id_snapshot,
    baseServingAmountSnapshot: optionalNumber(row.base_serving_amount_snapshot),
    baseServingUnitSnapshot: row.base_serving_unit_snapshot,
    baseWeightGramsSnapshot: optionalNumber(row.base_weight_grams_snapshot),
    baseCaloriesKcalSnapshot: numberValue(row.base_calories_kcal_snapshot),
    baseProteinGSnapshot: optionalNumber(row.base_protein_g_snapshot),
    baseCarbsGSnapshot: optionalNumber(row.base_carbs_g_snapshot),
    baseFatGSnapshot: optionalNumber(row.base_fat_g_snapshot),
    baseFiberGSnapshot: optionalNumber(row.base_fiber_g_snapshot),
    baseSodiumMgSnapshot: optionalNumber(row.base_sodium_mg_snapshot),
    lineCaloriesKcal: numberValue(row.line_calories_kcal),
    lineProteinG: optionalNumber(row.line_protein_g),
    lineCarbsG: optionalNumber(row.line_carbs_g),
    lineFatG: optionalNumber(row.line_fat_g),
    lineFiberG: optionalNumber(row.line_fiber_g),
    lineSodiumMg: optionalNumber(row.line_sodium_mg),
  }
  return { ...line, id: row.id, supportedUnits: supportedDisplayUnits(line) }
}

function rawText(value: unknown): string | null {
  if (value == null) return null
  return String(value)
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

function instant(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' && value.trim()) return value
  return null
}

type ExpectedFood = {
  id: string
  name: string
  serving_quantity: string | null
  serving_unit: string
  serving_grams: string | null
  calories: string | null
  protein: string | null
  carbs: string | null
  fat: string | null
  fiber: string | null
  sodium_mg: string | null
  archived: boolean
}
type FoodBasisRow = {
  id: string
  name: string
  barcode: string | null
  serving_quantity: unknown
  serving_unit: string
  serving_grams: unknown
  calories: unknown
  protein: unknown
  carbs: unknown
  fat: unknown
  fiber: unknown
  sodium_mg: unknown
  source_kind: string | null
  archived: boolean
}

type RecipeRow = { id: string; is_active: boolean; created_at: unknown; updated_at: unknown }
type RecipeListRow = {
  id: string
  version: number
  name: string
  is_current: boolean
  calories_kcal: unknown
  yield_servings: unknown
  finished_weight_g: unknown
}
type HistoryRow = { id: string; version: number; is_current: boolean; name: string; created_at: unknown }
type VersionRow = {
  id: string
  version: number
  is_current: boolean
  name: string
  notes: string | null
  yield_servings: unknown
  finished_weight_g: unknown
  calories_kcal: unknown
  protein_g: unknown
  carbs_g: unknown
  fat_g: unknown
  fiber_g: unknown
  sodium_mg: unknown
  calculation_version: string
  created_at: unknown
}
type IngredientRow = {
  id: string
  position: number
  food_id: string | null
  amount: unknown
  unit: string
  scale_factor: unknown
  food_name_snapshot: string
  food_source_type_snapshot: string | null
  food_source_external_id_snapshot: string | null
  base_serving_amount_snapshot: unknown
  base_serving_unit_snapshot: string | null
  base_weight_grams_snapshot: unknown
  base_calories_kcal_snapshot: unknown
  base_protein_g_snapshot: unknown
  base_carbs_g_snapshot: unknown
  base_fat_g_snapshot: unknown
  base_fiber_g_snapshot: unknown
  base_sodium_mg_snapshot: unknown
  line_calories_kcal: unknown
  line_protein_g: unknown
  line_carbs_g: unknown
  line_fat_g: unknown
  line_fiber_g: unknown
  line_sodium_mg: unknown
}
