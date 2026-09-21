import { calendarDateFromInstant } from '../progress/dates.js'
import { NUTRITION_CONFIG, NUTRITION_ENTRY_ENTITY, NUTRITION_FOOD_ENTITY } from './config.js'
import { parseOptionalGramsFromServingText } from './servings.js'
import type { NutritionCatalogKind, NutritionSourceKind } from './config.js'

export type LegacyIngredient = {
  id: number
  name: string
  calories: number
  protein: number
  carbs: number
  fat: number
  unit: string
  is_staple?: boolean | null
  notes?: string | null
}

export type LegacyMealCombo = {
  id: number
  name: string
  meal_type?: string | null
  calories: number
  protein: number
  carbs: number
  fat: number
  notes?: string | null
  instructions?: string | null
}

export type LegacyPackagedFood = {
  id: number
  name: string
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  serving_amount?: number | null
  serving_unit?: string | null
  weight_grams?: number | null
  source_type?: string | null
  source_external_id?: string | null
  metadata?: Record<string, unknown> | null
}

export type LegacyFoodLog = {
  id: number
  logged_at: string
  display_name: string
  source_type: string
  source_id: number | null
  nutrition_source: string
  quantity: number
  serving_description: string | null
  weight_grams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  original_input?: string | null
  metadata?: Record<string, unknown> | null
}

export type LegacyNutritionDump = {
  ingredients: readonly LegacyIngredient[]
  mealCombos: readonly LegacyMealCombo[]
  foods: readonly LegacyPackagedFood[]
  logs: readonly LegacyFoodLog[]
}

export type PlannedFood = {
  fingerprint: string
  externalId: string
  name: string
  brand: string | null
  barcode: string | null
  catalogKind: NutritionCatalogKind
  servingQuantity: number
  servingUnit: string
  servingGrams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sourceKind: NutritionSourceKind
  isStaple: boolean
  notes: string | null
  sourcePayload: Record<string, unknown>
}

export type PlannedEntry = {
  fingerprint: string
  externalId: string
  foodFingerprint: string | null
  logDate: string
  consumedAt: string
  timezone: string
  meal: null
  foodName: string
  brand: string | null
  servingQuantity: number
  servingUnit: string
  grams: number | null
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
  sourceKind: NutritionSourceKind
  notes: string | null
  sourcePayload: Record<string, unknown>
}

export type InvalidLegacyRow = {
  entityType: typeof NUTRITION_FOOD_ENTITY | typeof NUTRITION_ENTRY_ENTITY
  externalId: string
  reason: string
}

export function ingredientFingerprint(id: number): string {
  return `legacy:ingredient:${id}`
}

export function mealComboFingerprint(id: number): string {
  return `legacy:meal_combo:${id}`
}

export function packagedFoodFingerprint(id: number): string {
  return `legacy:food:${id}`
}

export function foodLogFingerprint(id: number): string {
  return `legacy:food_log:${id}`
}

function finiteOrNull(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function requireFinite(value: unknown, label: string): number {
  const parsed = finiteOrNull(value)
  if (parsed == null) {
    throw new Error(`${label} is not a number`)
  }
  return parsed
}

export function mapLegacySourceKind(sourceType: string): NutritionSourceKind {
  switch (sourceType) {
    case 'open_food_facts':
      return 'barcode'
    case 'nutrition_label':
      return 'ocr'
    case 'ai_estimate':
      return 'photo_ai'
    default:
      return 'migrated'
  }
}

function barcodeFromPackaged(food: LegacyPackagedFood): string | null {
  if (typeof food.source_external_id === 'string' && food.source_external_id.trim() !== '') {
    return food.source_external_id.trim()
  }
  const meta = food.metadata
  if (meta && typeof meta.barcode === 'string' && meta.barcode.trim() !== '') {
    return meta.barcode.trim()
  }
  return null
}

function brandFromPackaged(food: LegacyPackagedFood): string | null {
  const meta = food.metadata
  if (meta && typeof meta.brand === 'string' && meta.brand.trim() !== '') {
    return meta.brand.trim()
  }
  return null
}

export function mapLegacyFoods(dump: LegacyNutritionDump): {
  foods: PlannedFood[]
  invalid: InvalidLegacyRow[]
} {
  const foods: PlannedFood[] = []
  const invalid: InvalidLegacyRow[] = []

  for (const ingredient of dump.ingredients) {
    try {
      const name = ingredient.name.trim()
      if (name.length === 0) {
        throw new Error('blank name')
      }
      const unit = ingredient.unit.trim() || 'serving'
      foods.push({
        fingerprint: ingredientFingerprint(ingredient.id),
        externalId: String(ingredient.id),
        name,
        brand: null,
        barcode: null,
        catalogKind: 'ingredient',
        servingQuantity: 1,
        servingUnit: unit,
        servingGrams: parseOptionalGramsFromServingText(unit),
        calories: requireFinite(ingredient.calories, 'calories'),
        protein: requireFinite(ingredient.protein, 'protein'),
        carbs: requireFinite(ingredient.carbs, 'carbs'),
        fat: requireFinite(ingredient.fat, 'fat'),
        fiber: null,
        sourceKind: 'migrated',
        isStaple: Boolean(ingredient.is_staple),
        notes: ingredient.notes?.trim() || null,
        sourcePayload: { table: 'ingredients', id: ingredient.id },
      })
    } catch (error) {
      invalid.push({
        entityType: NUTRITION_FOOD_ENTITY,
        externalId: String(ingredient.id),
        reason: error instanceof Error ? error.message : 'invalid ingredient',
      })
    }
  }

  for (const combo of dump.mealCombos) {
    try {
      const name = combo.name.trim()
      if (name.length === 0) {
        throw new Error('blank name')
      }
      const notes = [combo.notes, combo.instructions].filter((item) => item && item.trim()).join('\n\n') || null
      foods.push({
        fingerprint: mealComboFingerprint(combo.id),
        externalId: String(combo.id),
        name,
        brand: null,
        barcode: null,
        catalogKind: 'recipe',
        servingQuantity: 1,
        servingUnit: 'serving',
        servingGrams: null,
        calories: requireFinite(combo.calories, 'calories'),
        protein: requireFinite(combo.protein, 'protein'),
        carbs: requireFinite(combo.carbs, 'carbs'),
        fat: requireFinite(combo.fat, 'fat'),
        fiber: null,
        sourceKind: 'migrated',
        isStaple: false,
        notes,
        sourcePayload: { table: 'meal_combos', id: combo.id, meal_type: combo.meal_type ?? null },
      })
    } catch (error) {
      invalid.push({
        entityType: NUTRITION_FOOD_ENTITY,
        externalId: String(combo.id),
        reason: error instanceof Error ? error.message : 'invalid meal combo',
      })
    }
  }

  for (const food of dump.foods) {
    try {
      const name = food.name.trim()
      if (name.length === 0) {
        throw new Error('blank name')
      }
      const servingUnit = (food.serving_unit ?? 'serving').trim() || 'serving'
      foods.push({
        fingerprint: packagedFoodFingerprint(food.id),
        externalId: String(food.id),
        name,
        brand: brandFromPackaged(food),
        barcode: barcodeFromPackaged(food),
        catalogKind: 'packaged',
        servingQuantity: food.serving_amount && food.serving_amount > 0 ? food.serving_amount : 1,
        servingUnit,
        servingGrams: food.weight_grams && food.weight_grams > 0 ? food.weight_grams : parseOptionalGramsFromServingText(servingUnit),
        calories: requireFinite(food.calories, 'calories'),
        protein: finiteOrNull(food.protein),
        carbs: finiteOrNull(food.carbs),
        fat: finiteOrNull(food.fat),
        fiber: null,
        sourceKind: food.source_type === 'open_food_facts' ? 'barcode' : 'migrated',
        isStaple: false,
        notes: null,
        sourcePayload: { table: 'foods', id: food.id, source_type: food.source_type ?? null },
      })
    } catch (error) {
      invalid.push({
        entityType: NUTRITION_FOOD_ENTITY,
        externalId: String(food.id),
        reason: error instanceof Error ? error.message : 'invalid packaged food',
      })
    }
  }

  return { foods, invalid }
}

export function catalogFingerprintForLog(log: LegacyFoodLog): string | null {
  if (log.source_id == null) {
    return null
  }
  if (log.source_type === 'ingredient') {
    return ingredientFingerprint(log.source_id)
  }
  if (log.source_type === 'meal_combo') {
    return mealComboFingerprint(log.source_id)
  }
  if (log.source_type === 'food' || log.source_type === 'open_food_facts' || log.source_type === 'nutrition_label') {
    return packagedFoodFingerprint(log.source_id)
  }
  return null
}

export function mapLegacyEntries(
  logs: readonly LegacyFoodLog[],
  timeZone = NUTRITION_CONFIG.calendarTimeZone,
): { entries: PlannedEntry[]; invalid: InvalidLegacyRow[] } {
  const entries: PlannedEntry[] = []
  const invalid: InvalidLegacyRow[] = []
  for (const log of logs) {
    try {
      const name = log.display_name.trim()
      if (name.length === 0) {
        throw new Error('blank display_name')
      }
      const instant = new Date(log.logged_at)
      if (Number.isNaN(instant.getTime())) {
        throw new Error('invalid logged_at')
      }
      const calories = requireFinite(log.calories, 'calories')
      const quantity = requireFinite(log.quantity, 'quantity')
      if (quantity <= 0) {
        throw new Error('quantity must be > 0')
      }
      const servingUnit = (log.serving_description ?? 'serving').trim() || 'serving'
      entries.push({
        fingerprint: foodLogFingerprint(log.id),
        externalId: String(log.id),
        foodFingerprint: catalogFingerprintForLog(log),
        logDate: calendarDateFromInstant(instant, timeZone),
        consumedAt: instant.toISOString(),
        timezone: timeZone,
        meal: null,
        foodName: name,
        brand: null,
        servingQuantity: quantity,
        servingUnit,
        grams: log.weight_grams != null && log.weight_grams > 0 ? log.weight_grams : null,
        calories,
        protein: finiteOrNull(log.protein),
        carbs: finiteOrNull(log.carbs),
        fat: finiteOrNull(log.fat),
        fiber: null,
        sourceKind: mapLegacySourceKind(log.source_type),
        notes: log.original_input?.trim() || null,
        sourcePayload: {
          table: 'food_logs',
          id: log.id,
          source_type: log.source_type,
          nutrition_source: log.nutrition_source,
          source_id: log.source_id,
        },
      })
    } catch (error) {
      invalid.push({
        entityType: NUTRITION_ENTRY_ENTITY,
        externalId: String(log.id),
        reason: error instanceof Error ? error.message : 'invalid food log',
      })
    }
  }
  return { entries, invalid }
}

export type LegacyImportPlan = {
  foodsToInsert: PlannedFood[]
  foodsSkipped: PlannedFood[]
  entriesToInsert: PlannedEntry[]
  entriesSkipped: PlannedEntry[]
  entriesExcluded: Array<{ externalId: string; reason: string }>
  invalid: InvalidLegacyRow[]
  summary: {
    foodsFound: number
    entriesFound: number
    dateRange: { start: string | null; end: string | null }
    barcodeCount: number
    foodsCreated: number
    entriesImported: number
    duplicatesSkipped: number
    entriesExcluded: number
    unsupportedRows: number
    validationFailures: number
  }
}

export function planLegacyImport(
  dump: LegacyNutritionDump,
  existingFingerprints: ReadonlySet<string>,
  timeZone = NUTRITION_CONFIG.calendarTimeZone,
  options: { excludeFoodLogIds?: readonly number[] } = {},
): LegacyImportPlan {
  const excludedIds = new Set((options.excludeFoodLogIds ?? []).map((id) => String(id)))
  const mappedFoods = mapLegacyFoods(dump)
  const mappedEntries = mapLegacyEntries(dump.logs, timeZone)
  const foodsToInsert: PlannedFood[] = []
  const foodsSkipped: PlannedFood[] = []
  for (const food of mappedFoods.foods) {
    if (existingFingerprints.has(food.fingerprint)) {
      foodsSkipped.push(food)
    } else {
      foodsToInsert.push(food)
    }
  }
  const entriesToInsert: PlannedEntry[] = []
  const entriesSkipped: PlannedEntry[] = []
  const entriesExcluded: Array<{ externalId: string; reason: string }> = []
  for (const entry of mappedEntries.entries) {
    if (excludedIds.has(entry.externalId)) {
      entriesExcluded.push({
        externalId: entry.externalId,
        reason: 'explicit_source_row_exclusion',
      })
      continue
    }
    if (existingFingerprints.has(entry.fingerprint)) {
      entriesSkipped.push(entry)
    } else {
      entriesToInsert.push(entry)
    }
  }
  const dates = mappedEntries.entries
    .filter((entry) => !excludedIds.has(entry.externalId))
    .map((entry) => entry.logDate)
    .sort()
  return {
    foodsToInsert,
    foodsSkipped,
    entriesToInsert,
    entriesSkipped,
    entriesExcluded,
    invalid: [...mappedFoods.invalid, ...mappedEntries.invalid],
    summary: {
      foodsFound: mappedFoods.foods.length,
      entriesFound: mappedEntries.entries.length,
      dateRange: {
        start: dates[0] ?? null,
        end: dates[dates.length - 1] ?? null,
      },
      barcodeCount: mappedFoods.foods.filter((food) => food.barcode != null).length,
      foodsCreated: foodsToInsert.length,
      entriesImported: entriesToInsert.length,
      duplicatesSkipped: foodsSkipped.length + entriesSkipped.length,
      entriesExcluded: entriesExcluded.length,
      unsupportedRows: 0,
      validationFailures: mappedFoods.invalid.length + mappedEntries.invalid.length,
    },
  }
}
