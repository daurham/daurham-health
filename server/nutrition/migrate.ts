import { NUTRITION_CONFIG, NUTRITION_ENTRY_ENTITY, NUTRITION_FOOD_ENTITY, planLegacyImport } from '../../src/domain/nutrition/index.js'
import type { LegacyImportPlan, LegacyNutritionDump } from '../../src/domain/nutrition/legacy.js'
import { HttpError } from '../http.js'
import {
  existingLegacyLinks,
  insertImportJob,
  insertPlannedEntry,
  insertPlannedFood,
  insertSourceLink,
  legacySourceId,
  updateImportJob,
} from './queries.js'
import { loadLegacyNutritionDump } from './legacy-source.js'

export type LegacyImportOptions = {
  excludeFoodLogIds?: readonly number[]
}

export function parseLegacyImportOptions(body: unknown): LegacyImportOptions {
  if (body == null) {
    return {}
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalid import options')
  }
  const raw = (body as { excludeFoodLogIds?: unknown }).excludeFoodLogIds
  if (raw == null) {
    return {}
  }
  if (!Array.isArray(raw)) {
    throw new HttpError(400, 'excludeFoodLogIds must be an array of positive integers')
  }
  const excludeFoodLogIds: number[] = []
  for (const value of raw) {
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new HttpError(400, 'excludeFoodLogIds must be an array of positive integers')
    }
    excludeFoodLogIds.push(parsed)
  }
  return { excludeFoodLogIds }
}

export type NutritionLegacyPreview = {
  source: {
    ingredients: number
    mealCombos: number
    packagedFoods: number
    foodLogs: number
    barcodes: number
    mealCategories: null
    targets: null
    staples: number
  }
  plan: LegacyImportPlan['summary']
  invalid: LegacyImportPlan['invalid']
  notes: string[]
}

function previewNotes(dump: LegacyNutritionDump, plan: LegacyImportPlan): string[] {
  return [
    'Source tracker is not mutated. Preview does not write Health rows.',
    'food_logs snapshots are imported as-is; catalog edits will not rewrite them.',
    'Composed meal_combos flatten to a single recipe food using stored combo macros, not live ingredient recomputation.',
    'USDA / historical_log rows stay as entries without a catalog food_id.',
    'Tracker meal_type is composed/standalone, not breakfast/lunch/dinner; meal is left null.',
    'Fiber is not present in the source schema.',
    'Calorie/macro targets live in NutriTrack localStorage/settings.config and are not migrated.',
    'localStorage favorites (availableMealsFavorites) are not migrated; ingredients.is_staple is preserved.',
    `Calendar days use ${NUTRITION_CONFIG.calendarTimeZone}.`,
    `Duplicate names across catalog kinds are kept distinct (ingredient vs recipe).`,
    plan.summary.dateRange.start
      ? `Entry date range ${plan.summary.dateRange.start} → ${plan.summary.dateRange.end}`
      : 'No food_logs to date.',
    dump.logs.some((log) => log.display_name.toUpperCase() === 'BANANA' && log.calories > 200)
      ? 'Unusual: BANANA log is 312 kcal at 32 g — preserved exactly, not corrected.'
      : '',
    plan.entriesExcluded.length > 0
      ? `Explicit source-row exclusion: food_log ids ${plan.entriesExcluded.map((row) => row.externalId).join(', ')} (${plan.entriesExcluded[0]?.reason}). Recorded in import reporting; source DB is unchanged.`
      : '',
  ].filter((note) => note.length > 0)
}

function planFromDump(
  source: LegacyNutritionDump,
  fingerprints: ReadonlySet<string>,
  options: LegacyImportOptions = {},
): LegacyImportPlan {
  return planLegacyImport(source, fingerprints, NUTRITION_CONFIG.calendarTimeZone, {
    excludeFoodLogIds: options.excludeFoodLogIds,
  })
}

export async function previewLegacyNutrition(
  dump?: LegacyNutritionDump,
  options: LegacyImportOptions = {},
): Promise<NutritionLegacyPreview> {
  const source = dump ?? (await loadLegacyNutritionDump())
  const sourceId = await legacySourceId()
  const links = await existingLegacyLinks(sourceId)
  const plan = planFromDump(source, new Set(links.keys()), options)
  return {
    source: {
      ingredients: source.ingredients.length,
      mealCombos: source.mealCombos.length,
      packagedFoods: source.foods.length,
      foodLogs: source.logs.length,
      barcodes: source.foods.filter((food) => food.source_external_id || food.metadata?.barcode).length,
      mealCategories: null,
      targets: null,
      staples: source.ingredients.filter((item) => item.is_staple).length,
    },
    plan: plan.summary,
    invalid: plan.invalid,
    notes: previewNotes(source, plan),
  }
}

export async function commitLegacyNutrition(
  dump?: LegacyNutritionDump,
  options: LegacyImportOptions = {},
): Promise<NutritionLegacyPreview & { importJobId: string }> {
  const source = dump ?? (await loadLegacyNutritionDump())
  const sourceId = await legacySourceId()
  const links = await existingLegacyLinks(sourceId)
  const plan = planFromDump(source, new Set(links.keys()), options)
  const importJobId = await insertImportJob([
    sourceId,
    'calorie-tracker',
    'nutritrack-food-logs-v1',
    'committing',
    plan.summary.foodsFound + plan.summary.entriesFound,
    0,
    plan.foodsSkipped.length,
    plan.summary.duplicatesSkipped,
    plan.summary.validationFailures,
    JSON.stringify({ preview: plan.summary, entriesExcluded: plan.entriesExcluded }),
  ])

  const foodIdByFingerprint = new Map<string, string>()
  for (const [fingerprint, link] of links) {
    if (link.entityType === NUTRITION_FOOD_ENTITY) {
      foodIdByFingerprint.set(fingerprint, link.entityId)
    }
  }

  let inserted = 0
  for (const food of plan.foodsToInsert) {
    const created = await insertPlannedFood(food)
    foodIdByFingerprint.set(food.fingerprint, created.id)
    await insertSourceLink([
      sourceId,
      importJobId,
      food.externalId,
      food.fingerprint,
      NUTRITION_FOOD_ENTITY,
      created.id,
      JSON.stringify(food.sourcePayload),
    ])
    inserted += 1
  }

  for (const entry of plan.entriesToInsert) {
    const foodId = entry.foodFingerprint ? foodIdByFingerprint.get(entry.foodFingerprint) ?? null : null
    const created = await insertPlannedEntry(entry, foodId)
    await insertSourceLink([
      sourceId,
      importJobId,
      entry.externalId,
      entry.fingerprint,
      NUTRITION_ENTRY_ENTITY,
      created.id,
      JSON.stringify(entry.sourcePayload),
    ])
    inserted += 1
  }

  await updateImportJob([
    importJobId,
    'completed',
    inserted,
    plan.foodsSkipped.length,
    plan.summary.duplicatesSkipped,
    plan.summary.validationFailures,
    JSON.stringify({ summary: plan.summary, entriesExcluded: plan.entriesExcluded }),
  ])

  return {
    importJobId,
    source: {
      ingredients: source.ingredients.length,
      mealCombos: source.mealCombos.length,
      packagedFoods: source.foods.length,
      foodLogs: source.logs.length,
      barcodes: source.foods.filter((food) => food.source_external_id || food.metadata?.barcode).length,
      mealCategories: null,
      targets: null,
      staples: source.ingredients.filter((item) => item.is_staple).length,
    },
    plan: plan.summary,
    invalid: plan.invalid,
    notes: previewNotes(source, plan),
  }
}
