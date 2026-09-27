import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { nutritionFoodCreateSchema } from '../src/domain/nutrition/types.ts'
import {
  COMPOSITE_FOOD_GUIDANCE,
  aiReusableFoodNotes,
  appendIngredientFood,
  looksLikeCompositeFoodDescription,
  scalePer100Grams,
  usdaReusableFoodNotes,
  type RecipeIngredientDraft,
} from '../src/domain/nutrition/recipe-ingredients.ts'
import { usdaCandidateFromFood } from '../server/nutrition/providers/usda-fdc.ts'
import { HttpError } from '../server/http.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'

const state = vi.hoisted(() => ({
  texts: [] as string[],
  params: [] as unknown[][],
  rows: [] as Array<Record<string, unknown>>,
  inserts: 0,
}))

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string, params: unknown[] = []) => {
      state.texts.push(text)
      state.params.push(params)
      if (text.includes('INSERT INTO nutrition_foods')) {
        state.inserts += 1
        return [foodRow(`food-${state.inserts}`, params)]
      }
      if (text.includes("source_kind = 'usda'")) {
        return state.rows
      }
      return []
    },
  }),
}))

const { saveAiReusableFood, saveUsdaReusableFood, searchUsdaFoods } = await import('../server/nutrition/recipe-ingredients.ts')

const turkey = {
  fdcId: 171477,
  name: 'Turkey, ground, 93% lean',
  servingQuantity: 100,
  servingUnit: 'g' as const,
  servingGrams: 100,
  calories: 150,
  protein: 20,
  carbs: 0,
  fat: 8,
  fiber: 0,
  portions: [
    { label: '100 g', amount: 100, unit: 'g', grams: 100 },
    { label: '1 cup (156 g)', amount: 1, unit: 'cup', grams: 156 },
  ],
}

const leaner = {
  ...turkey,
  fdcId: 171796,
  name: 'Turkey, ground, 85% lean',
}

const provider = {
  search: async () => ({ status: 'found' as const, candidates: [turkey] }),
  getFood: async (fdcId: number) => {
    if (fdcId === turkey.fdcId) return turkey
    if (fdcId === leaner.fdcId) return leaner
    return null
  },
}

function foodRow(id: string, params: unknown[]) {
  return {
    id,
    name: params[0],
    brand: params[1],
    barcode: params[2],
    catalog_kind: params[3],
    serving_quantity: params[4],
    serving_unit: params[5],
    serving_grams: params[6],
    calories: params[7],
    protein: params[8],
    carbs: params[9],
    fat: params[10],
    fiber: params[11],
    source_kind: params[12],
    is_staple: false,
    archived: false,
    notes: params[14],
    created_at: '2026-09-27T16:00:00.000Z',
    updated_at: '2026-09-27T16:00:00.000Z',
  }
}

function draft(): RecipeIngredientDraft {
  return {
    name: 'Chili',
    notes: 'Sunday batch',
    yieldServings: '6',
    finishedWeightG: '2400',
    lines: [
      { key: 'a', foodId: 'food-a', name: 'Onion', amount: '1', unit: 'serving' },
      { key: 'b', foodId: 'food-b', name: 'Beans', amount: '2', unit: 'serving' },
      { key: 'c', foodId: 'food-c', name: 'Tomato', amount: '400', unit: 'g' },
    ],
  }
}

function aiBody(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Homemade turkey meatball',
    text: 'one homemade turkey meatball, about 45 g',
    servingQuantity: 1,
    servingUnit: 'meatball',
    servingGrams: 45,
    calories: 80,
    protein: 7,
    carbs: 2,
    fat: 4,
    provider: 'gemini',
    model: 'gemini-test',
    originalCalories: 80,
    adjusted: false,
    ...overrides,
  }
}

describe('recipe ingredient creation', () => {
  beforeEach(() => {
    state.texts = []
    state.params = []
    state.rows = []
    state.inserts = 0
  })

  it('keeps the recipe draft when a source flow is cancelled', () => {
    const current = draft()
    const cancelled = { ...current, lines: [...current.lines] }
    expect(cancelled).toEqual(current)
    expect(current.lines).toHaveLength(3)
  })

  it('returns the explicit food id and keeps the earlier draft', () => {
    const current = draft()
    const next = appendIngredientFood(current, { id: 'food-new', name: 'Turkey' }, 'd')
    expect(current.lines).toHaveLength(3)
    expect(next.name).toBe('Chili')
    expect(next.notes).toBe('Sunday batch')
    expect(next.yieldServings).toBe('6')
    expect(next.finishedWeightG).toBe('2400')
    expect(next.lines[3]).toEqual({ key: 'd', foodId: 'food-new', name: 'Turkey', amount: '1', unit: 'serving' })
  })

  it('selects an existing food without creating another', () => {
    const current = draft()
    const next = appendIngredientFood(current, { id: 'food-a', name: 'Onion' }, 'again')
    expect(next.lines.filter((line) => line.foodId === 'food-a')).toHaveLength(2)
    expect(state.inserts).toBe(0)
  })

  it('does not persist a USDA search', async () => {
    const result = await searchUsdaFoods('ground turkey', provider)
    expect(result.foods).toHaveLength(1)
    expect(state.texts.some((text) => text.includes('INSERT'))).toBe(false)
    expect(state.inserts).toBe(0)
  })

  it('does not persist USDA when the serving is not a provider portion', async () => {
    await expect(
      saveUsdaReusableFood({ fdcId: 171477, amount: 1, unit: 'cup', grams: 50 }, provider),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(state.inserts).toBe(0)
    expect(state.texts.some((text) => text.includes('nutrition_entries'))).toBe(false)
  })

  it('saves a reviewed USDA portion as a reusable food and reuses that identity', async () => {
    const saved = await saveUsdaReusableFood({ fdcId: 171477, amount: 1, unit: 'cup', grams: 156 }, provider)
    expect(saved.reused).toBe(false)
    expect(saved.food.id).toBe('food-1')
    expect(saved.food.sourceKind).toBe('usda')
    expect(saved.food.servingQuantity).toBe(1)
    expect(saved.food.servingUnit).toBe('cup')
    expect(saved.food.servingGrams).toBe(156)
    expect(saved.food.calories).toBeCloseTo(234)
    expect(saved.food.notes?.startsWith('fdc:171477')).toBe(true)
    expect(saved.food.barcode).toBeNull()
    expect(state.texts.some((text) => text.includes('nutrition_entries'))).toBe(false)

    state.rows = [
      foodRow('food-1', [
        'Turkey, ground, 93% lean',
        '1 cup (156 g)',
        null,
        'ingredient',
        1,
        'cup',
        156,
        234,
        31.2,
        0,
        12.48,
        0,
        'usda',
        false,
        usdaReusableFoodNotes(171477, '1 cup (156 g)'),
      ]),
    ]
    const again = await saveUsdaReusableFood({ fdcId: 171477, amount: 1, unit: 'cup', grams: 156 }, provider)
    expect(again.reused).toBe(true)
    expect(again.food.id).toBe('food-1')
    expect(state.inserts).toBe(1)
  })

  it('does not merge different USDA foods because their names are similar', async () => {
    await saveUsdaReusableFood({ fdcId: 171477, amount: 100, unit: 'g', grams: 100 }, provider)
    await saveUsdaReusableFood({ fdcId: 171796, amount: 100, unit: 'g', grams: 100 }, provider)
    expect(state.inserts).toBe(2)
    const notes = state.params.map((params) => String(params[params.length - 1] ?? ''))
    expect(notes.some((note) => note.startsWith('fdc:171477'))).toBe(true)
    expect(notes.some((note) => note.startsWith('fdc:171796'))).toBe(true)
  })

  it('uses only provider portions that include a gram weight', () => {
    const candidate = usdaCandidateFromFood({
      fdcId: 1,
      description: 'Chicken broth',
      foodNutrients: [{ nutrientId: 1008, value: 10 }, { nutrientId: 1003, value: 1 }],
      foodPortions: [
        { amount: 1, portionDescription: '1 cup', gramWeight: 240, measureUnit: { abbreviation: 'cup' } },
        { amount: 1, portionDescription: '1 bowl' },
      ],
    })
    expect(candidate?.portions.map((portion) => portion.label)).toEqual(['100 g', '1 cup'])
    expect(candidate?.servingGrams).toBe(100)
    expect(scalePer100Grams({ calories: 10, protein: 1, carbs: null, fat: null, fiber: null }, 240).calories).toBe(24)
  })

  it('saves one reviewed AI food and ignores an estimate that was not accepted', async () => {
    expect(state.inserts).toBe(0)
    const saved = await saveAiReusableFood(aiBody({ calories: 90, adjusted: true }))
    expect(saved.food.id).toBe('food-1')
    expect(saved.food.sourceKind).toBe('photo_ai')
    expect(saved.food.notes).toContain('AI-assisted estimate')
    expect(saved.food.notes).toContain('provider: gemini')
    expect(saved.food.notes).toContain('adjusted: yes')
    expect(saved.food.notes).not.toContain('candidates')
    expect(state.texts.some((text) => text.includes('nutrition_entries'))).toBe(false)
    expect(state.inserts).toBe(1)
  })

  it('rejects an invalid reusable food and leaves the draft unchanged', async () => {
    const current = draft()
    await expect(saveAiReusableFood(aiBody({ name: ' ' }))).rejects.toBeInstanceOf(HttpError)
    expect(appendIngredientFood(current, { id: 'unused', name: 'Unused' }, 'z').lines).toHaveLength(4)
    expect(current.lines).toHaveLength(3)
    expect(state.inserts).toBe(0)
    const parsed = nutritionFoodCreateSchema.safeParse({
      name: '',
      servingUnit: 'serving',
      calories: -1,
    })
    expect(parsed.success).toBe(false)
  })

  it('guides composite descriptions back toward recipe ingredients', () => {
    expect(looksLikeCompositeFoodDescription('one homemade turkey meatball, about 45 g', 1)).toBe(false)
    expect(looksLikeCompositeFoodDescription('a cup of homemade chicken broth', 1)).toBe(false)
    expect(looksLikeCompositeFoodDescription('turkey, rice, broccoli and avocado bowl', 1)).toBe(true)
    expect(looksLikeCompositeFoodDescription('full pot of chili with six ingredients', 1)).toBe(true)
    expect(looksLikeCompositeFoodDescription('one meatball', 3)).toBe(true)
    expect(COMPOSITE_FOOD_GUIDANCE).toContain('ingredients')
  })

  it('keeps AI provenance bounded', () => {
    const notes = aiReusableFoodNotes({
      text: 'x'.repeat(2000),
      provider: 'gemini',
      model: 'gemini-test',
      originalCalories: 80,
      adjusted: false,
    })
    expect(notes.length).toBeLessThanOrEqual(2000)
    expect(notes.startsWith('AI-assisted estimate')).toBe(true)
  })

  it('keeps recipe calculation and stale-food protection authoritative', () => {
    const recipes = readFileSync('server/nutrition/recipes.ts', 'utf8')
    const foods = readFileSync('server/nutrition/recipe-ingredients.ts', 'utf8')
    const describe = readFileSync('server/nutrition/describe.ts', 'utf8')
    const label = readFileSync('server/nutrition/label.ts', 'utf8')
    const barcode = readFileSync('server/nutrition/service.ts', 'utf8')
    const sheet = readFileSync('src/features/nutrition/RecipeIngredientSheet.tsx', 'utf8')
    const capture = readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')
    const handler = readFileSync('server/handlers/nutrition-recipe-foods.ts', 'utf8')
    const meal = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    expect(recipes).toContain('loadFoodBasis')
    expect(recipes).toContain('Recipe ingredients changed since preview.')
    expect(foods).not.toContain('nutrition_entries')
    expect(foods).not.toContain('createGeminiNutritionInterpreter')
    expect(describe).toContain('insertEntryWithId')
    expect(label).toContain('if (!shouldLog)')
    expect(barcode).toContain('const shouldLog = record.log !== false')
    expect(sheet).toContain('describeFoodText')
    expect(sheet).toContain('Search My Foods')
    expect(sheet).toContain('Search USDA')
    expect(sheet).toContain('Scan barcode')
    expect(sheet).toContain('Nutrition label')
    expect(sheet).toContain('Add manually')
    expect(sheet).toContain('Describe a food')
    expect(sheet).toContain('Save & add to recipe')
    expect(sheet).toContain('log: false')
    expect(sheet).not.toContain('Add to Today')
    expect(sheet).not.toContain('commitFoodDescription')
    expect(capture).toContain('Save & add to recipe')
    expect(capture).toContain('CatalogCommitFooter')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).toContain('405')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(meal).not.toContain('searchUsdaFoods')
    expect(matchHealthApiRoute('/api/nutrition/usda/search')).toBe('nutrition-recipe-foods')
    expect(matchHealthApiRoute('/api/nutrition/recipe-foods')).toBe('nutrition-recipe-foods')
    const migration = readFileSync('migrations/0026_nutrition_food_usda_source.sql', 'utf8')
    expect(migration).toContain("'usda'")
    expect(migration).not.toContain('nutrition_entries')
  })
})
