import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { NUTRITION_ENTRY_ENTITY, NUTRITION_FOOD_ENTITY } from '../../src/domain/nutrition/config.js'
import type { NutritionEntry, NutritionFood, NutritionTarget } from '../../src/domain/nutrition/types.js'
import type { PlannedEntry, PlannedFood } from '../../src/domain/nutrition/legacy.js'

const TABLES_UNAVAILABLE = 'Nutrition tables are not available. Apply pending migrations.'

function asMissingRelation(error: unknown): boolean {
  return formatDatabaseError(error).includes('does not exist')
}

async function queryOrUnavailable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw error
  }
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function asCalendarDate(value: unknown): string {
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value
  }
  if (value instanceof Date) {
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requireNumber(value: unknown, label: string): number {
  const parsed = asNumber(value)
  if (parsed == null) {
    throw new HttpError(500, `Nutrition row missing ${label}`)
  }
  return parsed
}

type FoodRow = Record<string, unknown>
type EntryRow = Record<string, unknown>
type TargetRow = Record<string, unknown>

export function mapFoodRow(row: FoodRow): NutritionFood {
  return {
    id: String(row.id),
    name: String(row.name),
    brand: row.brand == null || row.brand === '' ? null : String(row.brand),
    barcode: row.barcode == null || row.barcode === '' ? null : String(row.barcode),
    catalogKind: row.catalog_kind as NutritionFood['catalogKind'],
    servingQuantity: requireNumber(row.serving_quantity, 'serving_quantity'),
    servingUnit: String(row.serving_unit),
    servingGrams: asNumber(row.serving_grams),
    calories: requireNumber(row.calories, 'calories'),
    protein: asNumber(row.protein),
    carbs: asNumber(row.carbs),
    fat: asNumber(row.fat),
    fiber: asNumber(row.fiber),
    sourceKind: row.source_kind as NutritionFood['sourceKind'],
    isStaple: Boolean(row.is_staple),
    archived: Boolean(row.archived),
    notes: row.notes == null || row.notes === '' ? null : String(row.notes),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  }
}

export function mapEntryRow(row: EntryRow): NutritionEntry {
  return {
    id: String(row.id),
    logDate: asCalendarDate(row.log_date),
    consumedAt: row.consumed_at == null ? null : asIso(row.consumed_at),
    timezone: String(row.timezone),
    meal: row.meal == null || row.meal === '' ? null : (row.meal as NutritionEntry['meal']),
    foodId: row.food_id == null ? null : String(row.food_id),
    foodName: String(row.food_name),
    brand: row.brand == null || row.brand === '' ? null : String(row.brand),
    servingQuantity: requireNumber(row.serving_quantity, 'serving_quantity'),
    servingUnit: String(row.serving_unit),
    grams: asNumber(row.grams),
    calories: requireNumber(row.calories, 'calories'),
    protein: asNumber(row.protein),
    carbs: asNumber(row.carbs),
    fat: asNumber(row.fat),
    fiber: asNumber(row.fiber),
    sourceKind: row.source_kind as NutritionEntry['sourceKind'],
    notes: row.notes == null || row.notes === '' ? null : String(row.notes),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  }
}

export function mapTargetRow(row: TargetRow): NutritionTarget {
  return {
    id: String(row.id),
    effectiveFrom: asCalendarDate(row.effective_from),
    caloriesTarget: requireNumber(row.calories_target, 'calories_target'),
    proteinTarget: requireNumber(row.protein_target, 'protein_target'),
    carbsTarget: asNumber(row.carbs_target),
    fatTarget: asNumber(row.fat_target),
    fiberTarget: asNumber(row.fiber_target),
    createdAt: asIso(row.created_at),
    updatedAt: asIso(row.updated_at),
  }
}

const FOOD_COLUMNS = `id, name, brand, barcode, catalog_kind, serving_quantity, serving_unit, serving_grams,
         calories, protein, carbs, fat, fiber, source_kind, is_staple, archived, notes, created_at, updated_at`

const ENTRY_COLUMNS = `id, log_date, consumed_at, timezone, meal, food_id, food_name, brand, serving_quantity,
         serving_unit, grams, calories, protein, carbs, fat, fiber, source_kind, notes, created_at, updated_at`

export const LIST_FOODS_SQL = `SELECT ${FOOD_COLUMNS}
         FROM nutrition_foods
         WHERE archived = false
           AND ($1::text IS NULL OR lower(name) LIKE '%' || lower($1) || '%' OR (brand IS NOT NULL AND lower(brand) LIKE '%' || lower($1) || '%'))
         ORDER BY
           CASE
             WHEN $1::text IS NOT NULL AND lower(name) = lower($1) THEN 0
             WHEN $1::text IS NOT NULL AND lower(name) LIKE lower($1) || '%' THEN 1
             WHEN $1::text IS NOT NULL AND brand IS NOT NULL AND lower(brand) = lower($1) THEN 2
             WHEN $1::text IS NOT NULL AND brand IS NOT NULL AND lower(brand) LIKE lower($1) || '%' THEN 3
             ELSE 4
           END,
           name ASC, catalog_kind ASC, id ASC
         LIMIT $2`

export const GET_FOOD_SQL = `SELECT ${FOOD_COLUMNS} FROM nutrition_foods WHERE id = $1`

export const GET_FOOD_BY_BARCODES_SQL = `SELECT ${FOOD_COLUMNS}
         FROM nutrition_foods
         WHERE archived = false
           AND barcode IS NOT NULL
           AND (
             barcode = ANY($1::text[])
             OR regexp_replace(barcode, '[^0-9]', '', 'g') = ANY($1::text[])
             OR CASE
               WHEN length(regexp_replace(barcode, '[^0-9]', '', 'g')) = 12
                 THEN '0' || regexp_replace(barcode, '[^0-9]', '', 'g')
               ELSE regexp_replace(barcode, '[^0-9]', '', 'g')
             END = ANY($1::text[])
           )
         ORDER BY updated_at DESC, id ASC
         LIMIT 1`

export const INSERT_FOOD_SQL = `INSERT INTO nutrition_foods (
           name, brand, barcode, catalog_kind, serving_quantity, serving_unit, serving_grams,
           calories, protein, carbs, fat, fiber, source_kind, is_staple, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         RETURNING ${FOOD_COLUMNS}`

export const UPDATE_FOOD_SQL = `UPDATE nutrition_foods SET
           name = COALESCE($2, name),
           brand = CASE WHEN $3::boolean THEN $4 ELSE brand END,
           barcode = CASE WHEN $5::boolean THEN $6 ELSE barcode END,
           serving_quantity = COALESCE($7, serving_quantity),
           serving_unit = COALESCE($8, serving_unit),
           serving_grams = CASE WHEN $9::boolean THEN $10 ELSE serving_grams END,
           calories = COALESCE($11, calories),
           protein = CASE WHEN $12::boolean THEN $13 ELSE protein END,
           carbs = CASE WHEN $14::boolean THEN $15 ELSE carbs END,
           fat = CASE WHEN $16::boolean THEN $17 ELSE fat END,
           fiber = CASE WHEN $18::boolean THEN $19 ELSE fiber END,
           is_staple = COALESCE($20, is_staple),
           archived = COALESCE($21, archived),
           notes = CASE WHEN $22::boolean THEN $23 ELSE notes END,
           updated_at = now()
         WHERE id = $1
         RETURNING ${FOOD_COLUMNS}`

export const LIST_ENTRIES_FOR_DATE_SQL = `SELECT ${ENTRY_COLUMNS}
         FROM nutrition_entries
         WHERE log_date = $1
         ORDER BY consumed_at NULLS LAST, created_at ASC, id ASC`

export const GET_ENTRY_SQL = `SELECT ${ENTRY_COLUMNS} FROM nutrition_entries WHERE id = $1`

export const INSERT_ENTRY_SQL = `INSERT INTO nutrition_entries (
           log_date, consumed_at, timezone, meal, food_id, food_name, brand,
           serving_quantity, serving_unit, grams, calories, protein, carbs, fat, fiber,
           source_kind, notes
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING ${ENTRY_COLUMNS}`

export const UPDATE_ENTRY_SQL = `UPDATE nutrition_entries SET
           log_date = COALESCE($2, log_date),
           consumed_at = CASE WHEN $3::boolean THEN $4 ELSE consumed_at END,
           meal = CASE WHEN $5::boolean THEN $6 ELSE meal END,
           food_name = COALESCE($7, food_name),
           brand = CASE WHEN $8::boolean THEN $9 ELSE brand END,
           serving_quantity = COALESCE($10, serving_quantity),
           serving_unit = COALESCE($11, serving_unit),
           grams = CASE WHEN $12::boolean THEN $13 ELSE grams END,
           calories = COALESCE($14, calories),
           protein = CASE WHEN $15::boolean THEN $16 ELSE protein END,
           carbs = CASE WHEN $17::boolean THEN $18 ELSE carbs END,
           fat = CASE WHEN $19::boolean THEN $20 ELSE fat END,
           fiber = CASE WHEN $21::boolean THEN $22 ELSE fiber END,
           notes = CASE WHEN $23::boolean THEN $24 ELSE notes END,
           updated_at = now()
         WHERE id = $1
         RETURNING ${ENTRY_COLUMNS}`

export const DELETE_ENTRY_SQL = `DELETE FROM nutrition_entries WHERE id = $1 RETURNING id`

export const TARGET_FOR_DATE_SQL = `SELECT id, effective_from, calories_target, protein_target, carbs_target, fat_target, fiber_target, created_at, updated_at
         FROM nutrition_targets
         WHERE effective_from <= $1
         ORDER BY effective_from DESC
         LIMIT 1`

export const UPSERT_TARGET_SQL = `INSERT INTO nutrition_targets (
           effective_from, calories_target, protein_target, carbs_target, fat_target, fiber_target
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (effective_from) DO UPDATE SET
           calories_target = EXCLUDED.calories_target,
           protein_target = EXCLUDED.protein_target,
           carbs_target = EXCLUDED.carbs_target,
           fat_target = EXCLUDED.fat_target,
           fiber_target = EXCLUDED.fiber_target,
           updated_at = now()
         RETURNING id, effective_from, calories_target, protein_target, carbs_target, fat_target, fiber_target, created_at, updated_at`

export const LIST_STAPLES_SQL = `SELECT ${FOOD_COLUMNS}
         FROM nutrition_foods
         WHERE archived = false AND is_staple = true
         ORDER BY name ASC, id ASC
         LIMIT $1`

export const LIST_RECIPES_SQL = `SELECT ${FOOD_COLUMNS}
         FROM nutrition_foods
         WHERE archived = false AND catalog_kind = 'recipe'
         ORDER BY name ASC, id ASC
         LIMIT $1`

export const LIST_RECENTS_SQL = `SELECT ${FOOD_COLUMNS}
         FROM nutrition_foods f
         JOIN (
           SELECT food_id, MAX(COALESCE(consumed_at, created_at)) AS last_at
           FROM nutrition_entries
           WHERE food_id IS NOT NULL
           GROUP BY food_id
         ) r ON r.food_id = f.id
         WHERE f.archived = false
         ORDER BY r.last_at DESC
         LIMIT $1`

export const LEGACY_SOURCE_SQL = `SELECT id FROM data_sources WHERE key = 'legacy_nutrition' LIMIT 1`

export const EXISTING_FINGERPRINTS_SQL = `SELECT external_fingerprint, entity_type, entity_id
         FROM source_record_links
         WHERE source_id = $1
           AND entity_type = ANY($2::text[])`

export const INSERT_IMPORT_JOB_SQL = `INSERT INTO import_jobs (
           source_id, source_filename, format_version, status, record_count,
           inserted_count, matched_count, skipped_count, error_count, metadata
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
         RETURNING id`

export const UPDATE_IMPORT_JOB_SQL = `UPDATE import_jobs
         SET status = $2, inserted_count = $3, matched_count = $4, skipped_count = $5, error_count = $6, metadata = $7::jsonb
         WHERE id = $1`

export const INSERT_SOURCE_LINK_SQL = `INSERT INTO source_record_links (
           source_id, import_job_id, external_id, external_fingerprint, entity_type, entity_id, source_payload
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`

export async function listFoods(query: string | null, limit: number): Promise<NutritionFood[]> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LIST_FOODS_SQL, [query, limit])) as FoodRow[]
    return rows.map(mapFoodRow)
  })
}

export async function getFood(id: string): Promise<NutritionFood | null> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(GET_FOOD_SQL, [id])) as FoodRow[]
    return rows[0] ? mapFoodRow(rows[0]) : null
  })
}

export async function getFoodByBarcodeKeys(keys: string[]): Promise<NutritionFood | null> {
  if (keys.length === 0) {
    return null
  }
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(GET_FOOD_BY_BARCODES_SQL, [keys])) as FoodRow[]
    return rows[0] ? mapFoodRow(rows[0]) : null
  })
}

export async function insertFood(values: unknown[]): Promise<NutritionFood> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(INSERT_FOOD_SQL, values)) as FoodRow[]
    if (!rows[0]) {
      throw new HttpError(500, 'Food insert failed')
    }
    return mapFoodRow(rows[0])
  })
}

export async function updateFood(values: unknown[]): Promise<NutritionFood | null> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(UPDATE_FOOD_SQL, values)) as FoodRow[]
    return rows[0] ? mapFoodRow(rows[0]) : null
  })
}

export async function listEntriesForDate(date: string): Promise<NutritionEntry[]> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LIST_ENTRIES_FOR_DATE_SQL, [date])) as EntryRow[]
    return rows.map(mapEntryRow)
  })
}

export async function getEntry(id: string): Promise<NutritionEntry | null> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(GET_ENTRY_SQL, [id])) as EntryRow[]
    return rows[0] ? mapEntryRow(rows[0]) : null
  })
}

export async function insertEntry(values: unknown[]): Promise<NutritionEntry> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(INSERT_ENTRY_SQL, values)) as EntryRow[]
    if (!rows[0]) {
      throw new HttpError(500, 'Entry insert failed')
    }
    return mapEntryRow(rows[0])
  })
}

export async function updateEntry(values: unknown[]): Promise<NutritionEntry | null> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(UPDATE_ENTRY_SQL, values)) as EntryRow[]
    return rows[0] ? mapEntryRow(rows[0]) : null
  })
}

export async function deleteEntry(id: string): Promise<boolean> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(DELETE_ENTRY_SQL, [id])) as Array<{ id: string }>
    return Boolean(rows[0])
  })
}

export async function targetForDate(date: string): Promise<NutritionTarget | null> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(TARGET_FOR_DATE_SQL, [date])) as TargetRow[]
    return rows[0] ? mapTargetRow(rows[0]) : null
  })
}

export async function upsertTarget(values: unknown[]): Promise<NutritionTarget> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(UPSERT_TARGET_SQL, values)) as TargetRow[]
    if (!rows[0]) {
      throw new HttpError(500, 'Target save failed')
    }
    return mapTargetRow(rows[0])
  })
}

export async function listStapleFoods(limit: number): Promise<NutritionFood[]> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LIST_STAPLES_SQL, [limit])) as FoodRow[]
    return rows.map(mapFoodRow)
  })
}

export async function listRecipeFoods(limit: number): Promise<NutritionFood[]> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LIST_RECIPES_SQL, [limit])) as FoodRow[]
    return rows.map(mapFoodRow)
  })
}

export async function listRecentFoods(limit: number): Promise<NutritionFood[]> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LIST_RECENTS_SQL, [limit])) as FoodRow[]
    return rows.map(mapFoodRow)
  })
}

export async function legacySourceId(): Promise<string> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(LEGACY_SOURCE_SQL, [])) as Array<{ id: string }>
    const id = rows[0]?.id
    if (!id) {
      throw new HttpError(500, 'legacy_nutrition data source is not configured')
    }
    return id
  })
}

export async function existingLegacyLinks(sourceId: string): Promise<Map<string, { entityType: string; entityId: string }>> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(EXISTING_FINGERPRINTS_SQL, [
      sourceId,
      [NUTRITION_FOOD_ENTITY, NUTRITION_ENTRY_ENTITY],
    ])) as Array<{ external_fingerprint: string; entity_type: string; entity_id: string }>
    return new Map(rows.map((row) => [row.external_fingerprint, { entityType: row.entity_type, entityId: row.entity_id }]))
  })
}

export async function insertPlannedFood(food: PlannedFood): Promise<NutritionFood> {
  return insertFood([
    food.name,
    food.brand,
    food.barcode,
    food.catalogKind,
    food.servingQuantity,
    food.servingUnit,
    food.servingGrams,
    food.calories,
    food.protein,
    food.carbs,
    food.fat,
    food.fiber,
    food.sourceKind,
    food.isStaple,
    food.notes,
  ])
}

export async function insertPlannedEntry(entry: PlannedEntry, foodId: string | null): Promise<NutritionEntry> {
  return insertEntry([
    entry.logDate,
    entry.consumedAt,
    entry.timezone,
    entry.meal,
    foodId,
    entry.foodName,
    entry.brand,
    entry.servingQuantity,
    entry.servingUnit,
    entry.grams,
    entry.calories,
    entry.protein,
    entry.carbs,
    entry.fat,
    entry.fiber,
    entry.sourceKind,
    entry.notes,
  ])
}

export async function insertSourceLink(values: unknown[]): Promise<void> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    await sql.query(INSERT_SOURCE_LINK_SQL, values)
  })
}

export async function insertImportJob(values: unknown[]): Promise<string> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    const rows = (await sql.query(INSERT_IMPORT_JOB_SQL, values)) as Array<{ id: string }>
    const id = rows[0]?.id
    if (!id) {
      throw new HttpError(500, 'Import job insert failed')
    }
    return id
  })
}

export async function updateImportJob(values: unknown[]): Promise<void> {
  return queryOrUnavailable(async () => {
    const sql = await getSql()
    await sql.query(UPDATE_IMPORT_JOB_SQL, values)
  })
}
