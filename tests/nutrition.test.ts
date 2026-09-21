import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  catalogFingerprintForLog,
  foodLogFingerprint,
  mapLegacyEntries,
  mapLegacyFoods,
  mapLegacySourceKind,
  nutritionDayTotals,
  nutritionEntryCreateSchema,
  nutritionFoodCreateSchema,
  nutritionTargetCreateSchema,
  parseOptionalGramsFromServingText,
  planLegacyImport,
  rankFoodsForQuery,
  recentsFromEntries,
  rescaleLoggedSnapshot,
  resolveEntryLogDate,
  scaleNutrients,
  servingMultiplier,
  snapshotFromDefinition,
  type LegacyNutritionDump,
  type NutritionEntry,
  type NutritionFood,
} from '../src/domain/nutrition/index.ts'
import {
  DELETE_ENTRY_SQL,
  INSERT_ENTRY_SQL,
  INSERT_FOOD_SQL,
  LIST_FOODS_SQL,
  LIST_RECENTS_SQL,
  UPDATE_FOOD_SQL,
  UPSERT_TARGET_SQL,
} from '../server/nutrition/queries.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'

function dump(partial?: Partial<LegacyNutritionDump>): LegacyNutritionDump {
  return {
    ingredients: [
      {
        id: 1,
        name: 'Chicken Breast',
        calories: 165,
        protein: 31,
        carbs: 0,
        fat: 3.6,
        unit: '100g',
        is_staple: true,
      },
    ],
    mealCombos: [
      {
        id: 21,
        name: 'PB&J (Half)',
        meal_type: 'composed',
        calories: 340,
        protein: 12,
        carbs: 36,
        fat: 16,
        notes: 'half sandwich',
      },
    ],
    foods: [
      {
        id: 9,
        name: 'Kind Bar',
        calories: 200,
        protein: 6,
        carbs: 16,
        fat: 12,
        serving_amount: 1,
        serving_unit: 'bar',
        weight_grams: 40,
        source_type: 'open_food_facts',
        source_external_id: '0123456789012',
        metadata: { barcode: '0123456789012', brand: 'KIND' },
      },
    ],
    logs: [
      {
        id: 5,
        logged_at: '2026-09-21T06:30:00.000Z',
        display_name: 'BANANA',
        source_type: 'usda',
        source_id: 2012128,
        nutrition_source: 'usda',
        quantity: 1,
        serving_description: '2 Tbsp',
        weight_grams: 32,
        calories: 312,
        protein: 12.5,
        carbs: 40.6,
        fat: 6.2,
        original_input: 'banana',
      },
      {
        id: 10,
        logged_at: '2026-09-20T18:00:00.000Z',
        display_name: 'Chicken Breast',
        source_type: 'ingredient',
        source_id: 1,
        nutrition_source: 'catalog',
        quantity: 1.5,
        serving_description: '100g',
        weight_grams: 150,
        calories: 248,
        protein: 46.5,
        carbs: 0,
        fat: 5.4,
      },
    ],
    ...partial,
  }
}

describe('nutrition foods', () => {
  it('accepts branded custom foods and optional barcodes', () => {
    const branded = nutritionFoodCreateSchema.parse({
      name: 'Kind Bar',
      brand: 'KIND',
      barcode: '0123456789012',
      servingUnit: 'bar',
      servingGrams: 40,
      calories: 200,
      protein: 6,
    })
    expect(branded.brand).toBe('KIND')
    expect(branded.barcode).toBe('0123456789012')
    expect(nutritionFoodCreateSchema.safeParse({ name: '   ', servingUnit: 'g', calories: 10 }).success).toBe(false)
  })

  it('does not treat capitalization-only names as distinct creates', () => {
    const lower = nutritionFoodCreateSchema.parse({ name: 'chicken breast', servingUnit: '100g', calories: 165 })
    const upper = nutritionFoodCreateSchema.parse({ name: 'Chicken Breast', servingUnit: '100g', calories: 165 })
    expect(lower.name.toLowerCase()).toBe(upper.name.toLowerCase())
  })
})

describe('nutrition servings', () => {
  const base = { calories: 200, protein: 20, carbs: 10, fat: 8, fiber: 2 }

  it('scales 1 serving and fractional servings deterministically', () => {
    expect(scaleNutrients(base, 1)).toEqual(base)
    expect(scaleNutrients(base, 1.5)).toEqual({
      calories: 300,
      protein: 30,
      carbs: 15,
      fat: 12,
      fiber: 3,
    })
  })

  it('uses grams when both logged grams and food serving grams are known', () => {
    expect(servingMultiplier({ quantity: 1, grams: 150, foodServingGrams: 100 })).toBe(1.5)
    const snapshot = snapshotFromDefinition({ ...base, servingGrams: 100 }, { quantity: 1, grams: 50 })
    expect(snapshot.calories).toBe(100)
    expect(snapshot.grams).toBe(50)
  })

  it('does not fabricate grams from a unit like 2 slices', () => {
    expect(parseOptionalGramsFromServingText('2 slices')).toBeNull()
    expect(parseOptionalGramsFromServingText('100g')).toBe(100)
    expect(parseOptionalGramsFromServingText('1 container (128 g)')).toBe(128)
    expect(snapshotFromDefinition(base, { quantity: 2 }).grams).toBeNull()
  })
})

describe('nutrition logs and snapshots', () => {
  it('keeps unknown macros unknown and requires calories', () => {
    expect(nutritionEntryCreateSchema.safeParse({ foodName: 'Chili', servingUnit: 'bowl' }).success).toBe(false)
    const partial = nutritionEntryCreateSchema.parse({
      logDate: '2026-09-20',
      foodName: 'Homemade chili',
      servingUnit: 'bowl',
      calories: 620,
      protein: 38,
    })
    expect(partial.carbs).toBeNull()
    expect(partial.fat).toBeNull()
    expect(partial.fiber).toBeNull()
  })

  it('food definition SQL updates do not rewrite entries', () => {
    expect(UPDATE_FOOD_SQL).toContain('UPDATE nutrition_foods')
    expect(UPDATE_FOOD_SQL).not.toContain('nutrition_entries')
    expect(INSERT_ENTRY_SQL).toContain('calories')
    expect(DELETE_ENTRY_SQL).toBe('DELETE FROM nutrition_entries WHERE id = $1 RETURNING id')
    expect(DELETE_ENTRY_SQL).not.toContain('food_logs')
    expect(INSERT_FOOD_SQL).not.toContain('food_logs')
  })
})

describe('nutrition daily totals', () => {
  it('sums calories and known macros across multiple entries and ignores deleted rows by omission', () => {
    const totals = nutritionDayTotals([
      { calories: 300, protein: 20, carbs: 10, fat: 8, fiber: 2 },
      { calories: 150, protein: 10, carbs: 5, fat: 4, fiber: 1 },
    ])
    expect(totals.calories).toEqual({ status: 'available', value: 450, observations: 2, missing: 0 })
    expect(totals.protein.value).toBe(30)
    const afterDelete = nutritionDayTotals([{ calories: 300, protein: 20, carbs: 10, fat: 8, fiber: 2 }])
    expect(afterDelete.calories.value).toBe(300)
  })

  it('does not treat unknown macros as zero', () => {
    const totals = nutritionDayTotals([
      { calories: 620, protein: 38, carbs: null, fat: null, fiber: null },
    ])
    expect(totals.calories.value).toBe(620)
    expect(totals.protein.status).toBe('available')
    expect(totals.carbs.status).toBe('insufficient_data')
    expect(totals.carbs.value).toBeNull()
    expect(totals.fat.status).toBe('insufficient_data')
  })
})

describe('nutrition dates', () => {
  it('derives Health calendar days in America/Los_Angeles without UTC shifting', () => {
    const resolved = resolveEntryLogDate({
      consumedAt: '2026-09-21T06:30:00.000Z',
      timezone: 'America/Los_Angeles',
    })
    expect(resolved.logDate).toBe('2026-09-20')
    expect(resolved.consumedAt).toBe('2026-09-21T06:30:00.000Z')
    expect(() =>
      resolveEntryLogDate({
        logDate: '2026-09-21',
        consumedAt: '2026-09-21T06:30:00.000Z',
        timezone: 'America/Los_Angeles',
      }),
    ).toThrow(/must match consumedAt/)
    expect(resolveEntryLogDate({ logDate: '2026-09-20', timezone: 'America/Los_Angeles' }).consumedAt).toBeNull()
  })
})

describe('legacy nutrition mapping', () => {
  it('maps catalog rows, barcodes, and exact historical snapshots', () => {
    const foods = mapLegacyFoods(dump())
    expect(foods.foods).toHaveLength(3)
    expect(foods.foods.find((item) => item.catalogKind === 'ingredient')?.servingGrams).toBe(100)
    expect(foods.foods.find((item) => item.barcode === '0123456789012')?.sourceKind).toBe('barcode')
    const entries = mapLegacyEntries(dump().logs)
    const banana = entries.entries.find((item) => item.externalId === '5')
    expect(banana?.calories).toBe(312)
    expect(banana?.logDate).toBe('2026-09-20')
    expect(banana?.foodFingerprint).toBeNull()
    expect(mapLegacySourceKind('nutrition_label')).toBe('ocr')
    expect(catalogFingerprintForLog(dump().logs[1]!)).toBe('legacy:ingredient:1')
  })

  it('previews without writing and skips fingerprints on rerun', () => {
    const first = planLegacyImport(dump(), new Set())
    expect(first.summary.foodsCreated).toBe(3)
    expect(first.summary.entriesImported).toBe(2)
    const second = planLegacyImport(
      dump(),
      new Set(first.foodsToInsert.map((item) => item.fingerprint).concat(first.entriesToInsert.map((item) => item.fingerprint))),
    )
    expect(second.summary.foodsCreated).toBe(0)
    expect(second.summary.entriesImported).toBe(0)
    expect(second.summary.duplicatesSkipped).toBe(5)
    expect(foodLogFingerprint(5)).toBe('legacy:food_log:5')
  })

  it('reports invalid rows instead of dropping calories to zero', () => {
    const planned = planLegacyImport(
      dump({
        logs: [
          {
            id: 99,
            logged_at: 'not-a-date',
            display_name: 'Mystery',
            source_type: 'usda',
            source_id: null,
            nutrition_source: 'usda',
            quantity: 1,
            serving_description: '1',
            weight_grams: null,
            calories: 10,
            protein: null,
            carbs: null,
            fat: null,
          },
        ],
      }),
      new Set(),
    )
    expect(planned.summary.validationFailures).toBe(1)
    expect(planned.invalid[0]?.externalId).toBe('99')
  })
})

describe('nutrition API routing', () => {
  it('owns nutrition routes on the existing dispatcher', () => {
    expect(matchHealthApiRoute('/api/nutrition/day')).toBe('nutrition-day')
    expect(matchHealthApiRoute('/api/nutrition/entries')).toBe('nutrition-entries')
    expect(matchHealthApiRoute('/api/nutrition/entries/11111111-1111-4111-8111-111111111111')).toBe(
      'nutrition-entry-detail',
    )
    expect(matchHealthApiRoute('/api/nutrition/foods')).toBe('nutrition-foods')
    expect(matchHealthApiRoute('/api/nutrition/targets')).toBe('nutrition-targets')
    expect(matchHealthApiRoute('/api/nutrition/barcode/034000470693')).toBe('nutrition-barcode')
    expect(matchHealthApiRoute('/api/nutrition/barcode/save')).toBe('nutrition-barcode')
    expect(matchHealthApiRoute('/api/nutrition/label/jobs')).toBe('nutrition-label-jobs')
    expect(matchHealthApiRoute('/api/nutrition/label/commit')).toBe('nutrition-label-commit')
    expect(matchHealthApiRoute('/api/nutrition/label/jobs/11111111-1111-4111-8111-111111111111')).toBe(
      'nutrition-label-job-detail',
    )
    expect(matchHealthApiRoute('/api/nutrition/import/legacy/preview')).toBe('nutrition-legacy-import')
    expect(matchHealthApiRoute('/api/nutrition/import/legacy/commit')).toBe('nutrition-legacy-import')
    const sql = readFileSync('migrations/0008_nutrition.sql', 'utf8')
    expect(sql).toContain('CREATE TABLE nutrition_foods')
    expect(sql).toContain('CREATE TABLE nutrition_entries')
    expect(sql).not.toMatch(/\buser_id\b/)
  })
})

function food(partial: Partial<NutritionFood> & Pick<NutritionFood, 'id' | 'name'>): NutritionFood {
  return {
    brand: null,
    barcode: null,
    catalogKind: 'ingredient',
    servingQuantity: 1,
    servingUnit: 'serving',
    servingGrams: null,
    calories: 100,
    protein: 10,
    carbs: 5,
    fat: 2,
    fiber: null,
    sourceKind: 'manual',
    isStaple: false,
    archived: false,
    notes: null,
    createdAt: '2026-09-20T00:00:00.000Z',
    updatedAt: '2026-09-20T00:00:00.000Z',
    ...partial,
  }
}

function entry(partial: Partial<NutritionEntry> & Pick<NutritionEntry, 'id' | 'foodName'>): NutritionEntry {
  return {
    logDate: '2026-09-21',
    consumedAt: null,
    timezone: 'America/Los_Angeles',
    meal: null,
    foodId: null,
    brand: null,
    servingQuantity: 1,
    servingUnit: 'serving',
    grams: null,
    calories: 100,
    protein: 10,
    carbs: 5,
    fat: 2,
    fiber: null,
    sourceKind: 'manual',
    notes: null,
    createdAt: '2026-09-21T00:00:00.000Z',
    updatedAt: '2026-09-21T00:00:00.000Z',
    ...partial,
  }
}

describe('nutrition recents, staples, search', () => {
  it('derives recents from entries, dedupes by food_id, and skips manual rows without food_id', () => {
    const chicken = food({ id: '11111111-1111-4111-8111-111111111111', name: 'Chicken & rice', catalogKind: 'recipe' })
    const egg = food({ id: '22222222-2222-4222-8222-222222222222', name: 'Egg', isStaple: true })
    const recents = recentsFromEntries(
      [
        entry({
          id: 'a',
          foodName: 'Homemade chili',
          foodId: null,
          createdAt: '2026-09-21T18:00:00.000Z',
        }),
        entry({
          id: 'b',
          foodName: 'Chicken & rice',
          foodId: chicken.id,
          createdAt: '2026-09-21T17:00:00.000Z',
        }),
        entry({
          id: 'c',
          foodName: 'Chicken & rice again',
          foodId: chicken.id,
          createdAt: '2026-09-21T12:00:00.000Z',
        }),
        entry({
          id: 'd',
          foodName: 'Egg',
          foodId: egg.id,
          createdAt: '2026-09-21T08:00:00.000Z',
        }),
      ],
      [chicken, egg],
    )
    expect(recents.map((item) => item.name)).toEqual(['Chicken & rice', 'Egg'])
    expect(LIST_RECENTS_SQL).toContain('FROM nutrition_entries')
    expect(LIST_RECENTS_SQL).not.toContain('CREATE TABLE')
  })

  it('ranks exact and prefix name matches ahead of contains', () => {
    const ranked = rankFoodsForQuery(
      [
        food({ id: '11111111-1111-4111-8111-111111111111', name: 'Chicken rice bowl', catalogKind: 'recipe' }),
        food({ id: '22222222-2222-4222-8222-222222222222', name: 'Chicken' }),
        food({ id: '33333333-3333-4333-8333-333333333333', name: 'Broth', brand: 'Chicken' }),
      ],
      'chicken',
    )
    expect(ranked.map((item) => item.name)).toEqual(['Chicken', 'Chicken rice bowl', 'Broth'])
    expect(LIST_FOODS_SQL).toContain("lower(name) = lower($1)")
    expect(LIST_FOODS_SQL).toContain("lower(name) LIKE lower($1) || '%'")
  })

  it('boosts recent usage after strong name matches without inventing a type filter', () => {
    const chickenRice = food({
      id: '11111111-1111-4111-8111-111111111111',
      name: 'Chicken rice',
      catalogKind: 'recipe',
    })
    const beefRice = food({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Beef rice',
      catalogKind: 'custom',
    })
    const yogurt = food({
      id: '33333333-3333-4333-8333-333333333333',
      name: 'Greek yogurt',
      catalogKind: 'packaged',
      isStaple: true,
    })
    const ranked = rankFoodsForQuery([beefRice, chickenRice, yogurt], 'rice', {
      recentIds: [chickenRice.id],
    })
    expect(ranked.map((item) => item.name)).toEqual(['Chicken rice', 'Beef rice', 'Greek yogurt'])
    expect(yogurt.isStaple).toBe(true)
  })
})

describe('nutrition targets', () => {
  it('accepts calorie and protein targets with optional macros', () => {
    const first = nutritionTargetCreateSchema.parse({
      effectiveFrom: '2026-09-21',
      caloriesTarget: 2100,
      proteinTarget: 160,
    })
    expect(first.carbsTarget).toBeNull()
    const later = nutritionTargetCreateSchema.parse({
      effectiveFrom: '2026-09-22',
      caloriesTarget: 2000,
      proteinTarget: 150,
      fiberTarget: 30,
    })
    expect(later.effectiveFrom).toBe('2026-09-22')
    expect(UPSERT_TARGET_SQL).toContain('ON CONFLICT (effective_from)')
    expect(UPSERT_TARGET_SQL).toContain('INSERT INTO nutrition_targets')
  })
})

describe('legacy source-row exclusion', () => {
  it('excludes explicit food_log ids and remains idempotent', () => {
    const first = planLegacyImport(dump(), new Set(), 'America/Los_Angeles', { excludeFoodLogIds: [5] })
    expect(first.summary.entriesExcluded).toBe(1)
    expect(first.entriesExcluded).toEqual([{ externalId: '5', reason: 'explicit_source_row_exclusion' }])
    expect(first.summary.entriesImported).toBe(1)
    expect(first.summary.entriesFound).toBe(2)
    const fingerprints = new Set(
      first.foodsToInsert.map((item) => item.fingerprint).concat(first.entriesToInsert.map((item) => item.fingerprint)),
    )
    const second = planLegacyImport(dump(), fingerprints, 'America/Los_Angeles', { excludeFoodLogIds: [5] })
    expect(second.summary.foodsCreated).toBe(0)
    expect(second.summary.entriesImported).toBe(0)
    expect(second.summary.entriesExcluded).toBe(1)
  })
})

describe('logged snapshot rescale', () => {
  it('scales an existing log to a fractional quantity without using a later food definition', () => {
    const next = rescaleLoggedSnapshot(
      { calories: 540, protein: 42, carbs: 40, fat: 12, fiber: null, servingQuantity: 1, grams: 300 },
      { quantity: 1.5 },
    )
    expect(next.calories).toBe(810)
    expect(next.protein).toBe(63)
    expect(next.grams).toBe(450)
  })
})

