import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  canScaleDescriptionItem,
  dropInterpreterNutrients,
  foodDescriptionOffer,
  formatDescriptionItemPortion,
  hasStrongCatalogMatch,
  interpretFoodDescriptionResponse,
  parseFoodDescription,
  reconstructDescriptionText,
  sanitizeDescriptionEstimate,
  scaleDescriptionItem,
  shouldOfferFoodDescription,
  sumDescriptionEstimateItems,
} from '../src/domain/nutrition/index.ts'
import { nutritionDayTotals } from '../src/domain/nutrition/index.ts'
import { descriptionEstimateFingerprint, previewFoodDescription } from '../server/nutrition/describe.ts'
import { descriptionMealFingerprint } from '../server/nutrition/meal.ts'

const WAGYU_TEXT = 'half a lb of ground wagyu beef, a quarter of diced onion and a cup of broccoli'
const PIZZA_TEXT = '2 slices of supreme pizza'
const PIZZA_MEAL_TEXT = '2 slices supreme pizza with a side salad and 2 tbsp ranch'

const wagyuItems = [
  {
    name: 'ground wagyu beef',
    quantity: 0.5,
    unit: 'lb',
    estimatedGrams: 227,
    calories: 650,
    proteinGrams: 45,
    carbsGrams: 0,
    fatGrams: 50,
    fiberGrams: 0,
    assumption: null,
  },
  {
    name: 'diced onion',
    quantity: 0.25,
    unit: 'medium onion',
    estimatedGrams: 28,
    calories: 12,
    proteinGrams: 0,
    carbsGrams: 3,
    fatGrams: 0,
    fiberGrams: 1,
    assumption: 'quarter medium onion',
  },
  {
    name: 'broccoli',
    quantity: 1,
    unit: 'cup',
    estimatedGrams: 90,
    calories: 31,
    proteinGrams: 3,
    carbsGrams: 6,
    fatGrams: 0,
    fiberGrams: 2,
    assumption: null,
  },
]

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
  })

  it('drops interpreter nutrition numbers from the leftover catalog candidate', () => {
    const candidate = dropInterpreterNutrients({
      original: 'beef',
      components: [{ proposedName: 'beef', quantity: 100, unit: 'g', calories: 9999, protein: 80 }],
    })
    expect(candidate.components[0]).not.toHaveProperty('calories')
    expect(candidate.components[0]).not.toHaveProperty('protein')
  })

  it('keeps the old grouped-meal fingerprint helper for leftover infrastructure', () => {
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

describe('food description estimate review', () => {
  it('shows natural quantities, Health-summed totals, and no catalog matching', async () => {
    const candidate = interpretFoodDescriptionResponse(JSON.stringify({ name: 'Wagyu beef with onion and broccoli', items: wagyuItems }), WAGYU_TEXT)
    expect(formatDescriptionItemPortion(candidate.items[0]!)).toMatch(/½ lb \(~227g\)/)
    expect(formatDescriptionItemPortion(candidate.items[2]!)).toMatch(/1 cup \(~90g estimated\)/)
    expect(candidate.calories).toBe(695)
    expect(candidate.proteinGrams).toBe(48)
    const preview = await previewFoodDescription(WAGYU_TEXT, {
      interpret: { interpret: async () => candidate },
    })
    expect(preview.items).toHaveLength(3)
    expect(preview).not.toHaveProperty('matches')
    expect(preview).not.toHaveProperty('selectedFoodId')
    expect(JSON.stringify(preview)).not.toContain('foodId')
    const describe = readFileSync('server/nutrition/describe.ts', 'utf8')
    expect(describe).not.toContain('matchMealComponent')
    expect(describe).not.toContain('createUsdaFdcProvider')
    expect(describe).not.toContain('listFoods')
    const ui = readFileSync('src/features/nutrition/DescribeFood.tsx', 'utf8')
    expect(ui).toContain('What AI understood')
    expect(ui).toContain('As estimated')
    expect(ui).toContain('inputMode="decimal"')
    expect(ui).not.toContain('Matched food')
    expect(ui).not.toContain('Create missing food')
    expect(ui).not.toContain('USDA')
    expect(ui).not.toContain('foodId')
  })

  it('keeps supreme pizza as one composite food and splits only named sides', () => {
    const pizza = sanitizeDescriptionEstimate({
      name: 'Supreme pizza',
      items: [
        {
          name: 'supreme pizza',
          quantity: 2,
          unit: 'slices',
          estimatedGrams: 220,
          calories: 640,
          proteinGrams: 28,
          carbsGrams: 64,
          fatGrams: 28,
          fiberGrams: 4,
        },
      ],
    })
    expect(pizza.items).toHaveLength(1)
    expect(pizza.items[0]?.name).toMatch(/supreme pizza/i)
    expect(pizza.items.map((item) => item.name).join(' ')).not.toMatch(/pepperoni|crust|mozzarella/i)
    expect(foodDescriptionPromptHasCompositeGuidance())

    const meal = sanitizeDescriptionEstimate({
      name: 'Pizza with salad and ranch',
      items: [
        { name: 'supreme pizza', quantity: 2, unit: 'slices', calories: 640, proteinGrams: 28, carbsGrams: 64, fatGrams: 28, fiberGrams: 4 },
        { name: 'side salad', quantity: 1, unit: 'serving', calories: 40, proteinGrams: 2, carbsGrams: 6, fatGrams: 1, fiberGrams: 2 },
        { name: 'ranch', quantity: 2, unit: 'tbsp', estimatedGrams: 30, calories: 140, proteinGrams: 1, carbsGrams: 2, fatGrams: 14, fiberGrams: 0 },
      ],
    })
    expect(meal.items.map((item) => item.name)).toEqual(['supreme pizza', 'side salad', 'ranch'])
    expect(sumDescriptionEstimateItems(meal.items).calories).toBe(820)
    expect(reconstructDescriptionText(meal.items)).toContain('2 slices supreme pizza')
    expect(PIZZA_TEXT).toMatch(/supreme pizza/)
    expect(PIZZA_MEAL_TEXT).toMatch(/ranch/)
  })

  it('scales a component quantity from the original item and portion chips from the Health sum', () => {
    const candidate = sanitizeDescriptionEstimate({ name: 'Wagyu plate', items: wagyuItems, original: WAGYU_TEXT })
    const beef = candidate.items[0]!
    expect(canScaleDescriptionItem(beef, 1, 'lb')).toBe(true)
    expect(canScaleDescriptionItem(beef, 1, 'cup')).toBe(false)
    const doubled = scaleDescriptionItem(beef, 1, 'lb')
    expect(doubled.calories).toBe(1300)
    expect(doubled.proteinGrams).toBe(90)
    expect(scaleDescriptionItem(beef, 0.5, 'lb').calories).toBe(650)
    expect(scaleDescriptionItem(doubled, 0.5, 'lb').calories).toBe(650)
    const totals = nutritionDayTotals([
      { calories: 680, protein: 38, carbs: 9, fat: 50, fiber: 3 },
    ])
    expect(totals.calories).toMatchObject({ status: 'available', value: 680 })
    expect(totals.protein).toMatchObject({ status: 'available', value: 38 })
  })

  it('saves one reviewed snapshot and keeps the AI estimate in provenance', () => {
    const describe = readFileSync('server/nutrition/describe.ts', 'utf8')
    expect(describe).toContain("source: 'description_ai'")
    expect(describe).toContain("provider: 'gemini'")
    expect(describe).toContain('estimated: true')
    expect(describe).toContain('reviewed: true')
    expect(describe).toContain('originalDescription')
    expect(describe).toContain('interpretedItems')
    expect(describe).toContain('aiEstimate')
    expect(describe).toContain('reviewedValues')
    expect(describe).toContain('return { entries: [entry] }')
    expect(describe).toContain("'meal'")
    expect(describe).not.toContain('meal_group_id')
    expect(describe).not.toContain('commitNutritionMeal(')
    const fingerprint = descriptionEstimateFingerprint({
      text: WAGYU_TEXT,
      logDate: '2026-09-22',
      name: 'Wagyu plate',
      calories: 680,
      proteinGrams: 38,
      carbsGrams: 9,
      fatGrams: 50,
      fiberGrams: 3,
    })
    expect(fingerprint).toBe(
      descriptionEstimateFingerprint({
        text: WAGYU_TEXT,
        logDate: '2026-09-22',
        name: 'Wagyu plate',
        calories: 680,
        proteinGrams: 38,
        carbsGrams: 9,
        fatGrams: 50,
        fiberGrams: 3,
      }),
    )
    expect(readFileSync('src/features/nutrition/DescribeFood.tsx', 'utf8')).toContain('Recalculate')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('What AI saw')
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).toContain('Analyze label')
    expect(readFileSync('src/features/nutrition/BarcodeScanner.tsx', 'utf8')).toContain('Enter barcode manually')
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

function foodDescriptionPromptHasCompositeGuidance(): boolean {
  const prompt = readFileSync('src/domain/nutrition/interpret.ts', 'utf8')
  return prompt.includes('Keep recognizable composite foods intact') && prompt.includes('2 slices supreme pizza')
}
