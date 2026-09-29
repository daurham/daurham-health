import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addToDateLabel } from '../src/features/nutrition/catalog-actions.ts'
import { remainingHeadline } from '../src/features/nutrition/format.ts'
import { matchCurrentRecipes, resolveRecipePortion, type RecipePortionBasis } from '../src/domain/nutrition/recipe-consumption.ts'
import { nutritionDayTotals } from '../src/domain/nutrition/totals.ts'
import { nutritionDailyObservations } from '../src/domain/progress/nutrition.ts'
import { HttpError } from '../server/http.ts'
import { LIST_RECIPES_SQL, UPDATE_ENTRY_SQL } from '../server/nutrition/queries.ts'

const calls = vi.hoisted(() => ({
  texts: [] as string[],
  inserts: 0,
}))

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string, params: unknown[] = []) => {
      calls.texts.push(text)
      if (text.includes('INSERT INTO nutrition_entries')) {
        calls.inserts += 1
        return [
          {
            id: `entry-${calls.inserts}`,
            log_date: params[0],
            consumed_at: null,
            timezone: params[2],
            meal: null,
            food_id: null,
            food_name: params[5],
            brand: null,
            serving_quantity: params[7],
            serving_unit: params[8],
            grams: params[9],
            calories: params[10],
            protein: params[11],
            carbs: params[12],
            fat: params[13],
            fiber: params[14],
            sodium: params[15],
            source_kind: params[16],
            notes: null,
            meal_group_id: null,
            recipe_version_id: params[18],
            recipe_portion_kind: params[19],
            recipe_portion_amount: params[20],
            recipe_fraction: params[21],
            created_at: '2026-09-27T15:00:00.000Z',
            updated_at: '2026-09-27T15:00:00.000Z',
          },
        ]
      }
      if (text.includes('FROM recipe_versions versions') && text.includes('WHERE versions.id')) {
        const id = String(params[0])
        if (id === 'missing') return []
        if (id === '22222222-2222-4222-8222-222222222222') return [versionRow(id, 2, 1500, 'Spicy Sundubu-jjigae')]
        return [versionRow(id, 1, 1200, 'Sundubu-jjigae')]
      }
      return []
    },
  }),
}))

const { logRecipeConsumption } = await import('../server/nutrition/recipe-consumption.ts')

const V1 = '11111111-1111-4111-8111-111111111111'
const V2 = '22222222-2222-4222-8222-222222222222'

function basis(overrides: Partial<RecipePortionBasis> = {}): RecipePortionBasis {
  return {
    version: 2,
    name: 'Sundubu-jjigae',
    caloriesKcal: 1420.5,
    proteinG: 120,
    carbsG: 80,
    fatG: 40,
    fiberG: null,
    sodiumMg: null,
    yieldServings: 6,
    finishedWeightG: 2850,
    ...overrides,
  }
}

function versionRow(id: string, version: number, calories: number, name: string) {
  return {
    recipe_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    recipe_version_id: id,
    version,
    name,
    calories_kcal: calories,
    protein_g: null,
    carbs_g: 100,
    fat_g: 50,
    fiber_g: null,
    sodium_mg: null,
    yield_servings: 6,
    finished_weight_g: 2850,
  }
}

describe('recipe portion resolver', () => {
  it('scales servings and grams from the whole recipe without per-serving rounding', () => {
    const serving = resolveRecipePortion(basis(), 'servings', 1)
    const weighed = resolveRecipePortion(basis(), 'grams', 475)
    expect('error' in serving).toBe(false)
    expect('error' in weighed).toBe(false)
    if ('error' in serving || 'error' in weighed) return
    expect(serving.fraction).toBe(1 / 6)
    expect(weighed.fraction).toBe(475 / 2850)
    expect(serving.calories).toBe(1420.5 * (1 / 6))
    expect(weighed.calories).toBe(serving.calories)
    expect(serving.description).toBe('1 serving · Recipe v2')
    expect(weighed.description).toBe('475 g · Recipe v2')
    const two = resolveRecipePortion(basis({ caloriesKcal: 1200 }), 'servings', 2.5)
    if ('error' in two) throw new Error(two.error)
    expect(two.fraction).toBe(2.5 / 6)
    expect(two.calories).toBe(1200 * (2.5 / 6))
  })

  it('accepts fractions above one recipe and keeps unknown macros null', () => {
    const half = resolveRecipePortion(basis({ caloriesKcal: 1400, proteinG: null, carbsG: 120, fatG: 55, yieldServings: null, finishedWeightG: null }), 'fraction', 0.5)
    const extra = resolveRecipePortion(basis({ yieldServings: null, finishedWeightG: null }), 'fraction', 1.5)
    if ('error' in half || 'error' in extra) throw new Error('fraction should be available')
    expect(half.protein).toBeNull()
    expect(half.carbs).toBe(60)
    expect(half.fat).toBe(27.5)
    expect(extra.fraction).toBe(1.5)
    expect(resolveRecipePortion(basis({ yieldServings: null }), 'servings', 1)).toMatchObject({ code: 'unavailable_servings' })
    expect(resolveRecipePortion(basis({ finishedWeightG: null }), 'grams', 100)).toMatchObject({ code: 'unavailable_grams' })
    expect(resolveRecipePortion(basis(), 'fraction', 0)).toMatchObject({ code: 'invalid_amount' })
    expect(resolveRecipePortion(basis(), 'cups', 1)).toMatchObject({ code: 'unknown_kind' })
  })

  it('searches only the supplied current recipes and sums recipe entries with foods', () => {
    const current = [{ name: 'Sundubu-jjigae', recipeVersionId: 'v3' }]
    expect(matchCurrentRecipes(current, 'sundubu')).toEqual(current)
    expect(matchCurrentRecipes(current, 'rice')).toEqual([])
    const food = { calories: 100, protein: 10, carbs: 5, fat: 2, fiber: null, sodium: null }
    const recipe = { calories: 236.75, protein: 20, carbs: null, fat: 6, fiber: null, sodium: null }
    const totals = nutritionDayTotals([food, recipe])
    expect(totals.calories.value).toBe(336.75)
    expect(totals.protein.value).toBe(30)
    expect(totals.carbs.status).toBe('insufficient_data')
    expect(remainingHeadline(totals.calories, 400, 'kcal')).toBe('63 remaining')
    const day = nutritionDailyObservations({
      entries: [
        entry('food', '2026-09-20', 100),
        entry('recipe', '2026-09-20', 236.75),
        entry('other-day', '2026-09-21', 50),
      ],
      targets: [],
      start: '2026-09-20',
      end: '2026-09-20',
    })
    expect(day[0]?.calories.value).toBe(336.75)
    expect(day[0]?.entryCount).toBe(2)
  })

  it('keeps legacy catalog recipe foods distinct from recipe version entries', () => {
    expect(addToDateLabel('2026-09-20', '2026-09-27')).toBe('Add to Sep 20')
    expect(addToDateLabel('2026-09-27', '2026-09-27')).toBe('Add to Today')
    expect(LIST_RECIPES_SQL).toContain("catalog_kind = 'recipe'")
    expect(UPDATE_ENTRY_SQL).not.toContain('recipe_version_id =')
    const migration = readFileSync('migrations/0025_recipe_consumption.sql', 'utf8')
    expect(migration).toContain('recipe_version_id UUID NULL REFERENCES recipe_versions')
    expect(migration).toContain('nutrition_entries_recipe_provenance_coherent')
    const source = readFileSync('server/nutrition/recipe-consumption.ts', 'utf8')
    expect(source).toContain('versions.is_current')
    expect(source).toContain('recipes.is_active')
    expect(source).not.toContain('nutrition_foods')
    expect(source).not.toContain('UPDATE recipe')
  })
})

describe('recipe consumption commit', () => {
  beforeEach(() => {
    calls.texts = []
    calls.inserts = 0
  })

  it('logs the requested version, including after a later version exists', async () => {
    const logged = await logRecipeConsumption({
      recipeVersionId: V1,
      logDate: '2026-09-20',
      portionKind: 'fraction',
      amount: 0.5,
      timezone: 'America/Phoenix',
    })
    expect(logged.recipeVersionId).toBe(V1)
    expect(logged.logDate).toBe('2026-09-20')
    expect(logged.foodName).toBe('Sundubu-jjigae')
    expect(logged.calories).toBe(600)
    expect(logged.protein).toBeNull()
    expect(logged.carbs).toBe(50)
    expect(logged.fat).toBe(25)
    expect(calls.inserts).toBe(1)
    expect(calls.texts.join('\n')).not.toContain('nutrition_foods')
    const later = await logRecipeConsumption({
      recipeVersionId: V1,
      logDate: '2026-09-27',
      portionKind: 'fraction',
      amount: 0.5,
      timezone: 'America/Phoenix',
    })
    expect(later.recipeVersionId).toBe(V1)
    expect(later.calories).toBe(600)
    const current = await logRecipeConsumption({
      recipeVersionId: V2,
      logDate: '2026-09-27',
      portionKind: 'fraction',
      amount: 0.5,
      timezone: 'America/Phoenix',
    })
    expect(current.foodName).toBe('Spicy Sundubu-jjigae')
    expect(current.calories).toBe(750)
    expect(calls.inserts).toBe(3)
  })

  it('rejects invalid portions and a missing version without writing', async () => {
    await expect(
      logRecipeConsumption({ recipeVersionId: 'not-a-uuid', logDate: '2026-09-27', portionKind: 'fraction', amount: 1 }),
    ).rejects.toMatchObject({ statusCode: 400, code: 'invalid_id' })
    await expect(
      logRecipeConsumption({ recipeVersionId: V1, logDate: '2026-09-27', portionKind: 'servings', amount: 0 }),
    ).rejects.toBeInstanceOf(HttpError)
    expect(calls.inserts).toBe(0)
  })
})

function entry(id: string, logDate: string, calories: number) {
  return {
    id,
    logDate,
    consumedAt: null,
    timezone: 'America/Phoenix',
    meal: null,
    foodId: id === 'recipe' ? null : 'food-1',
    foodName: id,
    brand: null,
    servingQuantity: 1,
    servingUnit: 'serving',
    grams: null,
    calories,
    protein: 1,
    carbs: 1,
    fat: 1,
    fiber: null,
    sourceKind: 'manual' as const,
    notes: null,
    mealGroupId: null,
    recipeVersionId: id === 'recipe' ? V1 : null,
    createdAt: '2026-09-20T12:00:00.000Z',
    updatedAt: '2026-09-20T12:00:00.000Z',
  }
}
