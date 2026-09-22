import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  descriptionComponentTotals,
  dropInterpreterNutrients,
  foodDescriptionOffer,
  hasStrongCatalogMatch,
  parseFoodDescription,
  shouldOfferFoodDescription,
} from '../src/domain/nutrition/describe.ts'
import type { NutritionFood } from '../src/domain/nutrition/types.ts'
import { descriptionMealFingerprint } from '../server/nutrition/meal.ts'
import { previewFoodDescription } from '../server/nutrition/describe.ts'

function food(patch: Partial<NutritionFood> & Pick<NutritionFood, 'id' | 'name'>): NutritionFood {
  return {
    brand: null,
    barcode: null,
    catalogKind: 'ingredient',
    servingQuantity: 100,
    servingUnit: 'g',
    servingGrams: 100,
    calories: 34,
    protein: 2.8,
    carbs: 7,
    fat: 0.4,
    fiber: 2.6,
    sourceKind: 'manual',
    isStaple: false,
    archived: false,
    notes: null,
    createdAt: '2026-09-22T00:00:00.000Z',
    updatedAt: '2026-09-22T00:00:00.000Z',
    ...patch,
  }
}

describe('food description detection', () => {
  it('keeps short catalog queries as search and offers a sentence', () => {
    expect(foodDescriptionOffer('egg')).toBe(false)
    expect(foodDescriptionOffer('banana')).toBe(false)
    expect(foodDescriptionOffer('chicken')).toBe(false)
    expect(foodDescriptionOffer('beef rice broccoli bowl')).toBe(false)
    expect(foodDescriptionOffer('half a lb wagyu beef, quarter onion and a cup broccoli')).toBe(true)
    expect(foodDescriptionOffer('2 eggs with cheese and toast')).toBe(true)
    expect(foodDescriptionOffer('chicken rice bowl with about 6 oz chicken')).toBe(true)
    expect(shouldOfferFoodDescription('egg', [], false)).toBe(true)
    expect(shouldOfferFoodDescription('egg', [{ name: 'Egg' }], false)).toBe(false)
    expect(hasStrongCatalogMatch('chicken', [{ name: 'Chicken breast' }])).toBe(true)
  })

  it('does not call description while the search effect is typing', () => {
    const panels = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    const effect = panels.slice(panels.indexOf('useEffect(() => {'), panels.indexOf('async function onBarcode'))
    expect(effect).toContain('searchNutritionFoods')
    expect(effect).not.toContain('describeFoodText')
    expect(panels).toContain('Use this description')
  })
})

describe('food description parsing and totals', () => {
  it('extracts the reviewed example and leaves a fractional onion unresolved', () => {
    const parsed = parseFoodDescription('half a lb of wagyu beef, a quarter of diced onion and a cup of broccoli')
    expect(parsed.components.map((item) => [item.proposedName, item.quantity, item.unit, item.preparation])).toEqual([
      ['wagyu beef', 0.5, 'lb', null],
      ['onion', 0.25, 'whole', 'diced'],
      ['broccoli', 1, 'cup', null],
    ])
    expect(parsed.components[1]?.ambiguity).toMatch(/size of onion/i)
    const broccoli = food({ id: 'broccoli', name: 'Broccoli' })
    const beef = food({ id: 'beef', name: 'Beef', calories: 250, servingGrams: 100 })
    const totals = descriptionComponentTotals([
      { included: true, quantity: 0.5, unit: 'lb', food: beef },
      { included: true, quantity: 0.25, unit: 'whole', food: food({ id: 'onion', name: 'Onion', servingUnit: 'whole' }) },
      { included: true, quantity: 100, unit: 'g', food: broccoli },
    ])
    expect(totals?.calories).toBeCloseTo(250 * (226.796185 / 100) + 34, 4)
    expect(totals?.calories).not.toBe(9999)
  })

  it('drops interpreter nutrition numbers', () => {
    const candidate = dropInterpreterNutrients({
      original: 'beef',
      components: [{ proposedName: 'beef', quantity: 100, unit: 'g', calories: 9999, protein: 80 }],
    })
    expect(candidate.components[0]).not.toHaveProperty('calories')
    expect(candidate.components[0]).not.toHaveProperty('protein')
  })

  it('matches local foods before USDA and keeps the commit fingerprint stable', async () => {
    const usda = { search: vi.fn(async () => ({ status: 'found' as const, candidates: [] })), getFood: vi.fn() }
    const local = await previewFoodDescription('broccoli', {
      foods: [food({ id: '11111111-1111-4111-8111-111111111111', name: 'Broccoli' })],
      usda,
    })
    expect(local.components[0]?.selectedFoodId).toBe('11111111-1111-4111-8111-111111111111')
    expect(usda.search).not.toHaveBeenCalled()

    usda.search.mockResolvedValue({
      status: 'found',
      candidates: [
        {
          fdcId: 10,
          name: 'Beef, raw',
          servingQuantity: 100,
          servingUnit: 'g',
          servingGrams: 100,
          calories: 250,
          protein: 20,
          carbs: 0,
          fat: 15,
          fiber: 0,
        },
      ],
    })
    const fallback = await previewFoodDescription('wagyu beef', { foods: [], usda })
    expect(fallback.components[0]?.selectedFoodId).toBeNull()
    expect(fallback.components[0]?.usda[0]?.fdcId).toBe(10)
    expect(usda.search).toHaveBeenCalledWith('wagyu beef')

    const payload = {
      text: 'half a lb of wagyu beef',
      logDate: '2026-09-22',
      components: [{ foodId: 'beef', quantity: 0.5, unit: 'lb', grams: 226.8, included: true }],
    }
    expect(descriptionMealFingerprint(payload)).toBe(descriptionMealFingerprint(payload))
    expect(descriptionMealFingerprint({ ...payload, components: [{ ...payload.components[0]!, quantity: 1 }] })).not.toBe(
      descriptionMealFingerprint(payload),
    )
  })
})

describe('description and meal secrets', () => {
  it('keeps USDA and Home-AI keys on the server and uses one function', () => {
    const usda = readFileSync('server/nutrition/providers/usda-fdc.ts', 'utf8')
    const client = readFileSync('src/features/nutrition/api.ts', 'utf8')
    const review = readFileSync('src/features/nutrition/DescribeFood.tsx', 'utf8')
    expect(usda).toContain('USDA_FDC_API_KEY')
    expect(usda).not.toContain('VITE_')
    expect(client).not.toContain('USDA_FDC_API_KEY')
    expect(client).not.toContain('HOME_AI_API_KEY')
    expect(review).not.toContain('USDA_FDC_API_KEY')
    expect(readFileSync('server/nutrition/queries.ts', 'utf8')).toContain('meal_group_id')
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).toContain('descriptionMealFingerprint')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('Retry')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('Build meal manually')
    expect(readdirSync('api').filter((name) => name.endsWith('.ts'))).toEqual(['index.ts'])
  })
})
