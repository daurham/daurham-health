import { describe, expect, it } from 'vitest'
import { previewRecipeVersion, type RecipeDraft, type RecipeVersionSnapshot } from '../src/domain/nutrition/recipe-versions.ts'
import { composeRecipe, type RecipeFoodBasis, type RecipeLine } from '../src/domain/nutrition/recipes.ts'

function food(overrides: Partial<RecipeFoodBasis> = {}): RecipeFoodBasis {
  return {
    id: 'food-a',
    name: 'Food A',
    servingQuantity: 1,
    servingUnit: 'serving',
    servingGrams: null,
    calories: 100,
    protein: 10,
    carbs: 3,
    fat: 2,
    sourceKind: 'manual',
    barcode: null,
    ...overrides,
  }
}

function line(foodBasis: RecipeFoodBasis, amount: number, unit: string, position = 1): RecipeLine {
  const composed = composeRecipe({
    name: 'Recipe',
    notes: null,
    yieldServings: null,
    finishedWeightG: null,
    ingredients: [{ food: foodBasis, amount, unit }],
  })
  if ('error' in composed) throw new Error(composed.error)
  return { ...composed.ingredients[0], position }
}

function snapshot(ingredients: RecipeLine[], overrides: Partial<RecipeVersionSnapshot> = {}): RecipeVersionSnapshot {
  const calories = ingredients.reduce((sum, item) => sum + item.lineCaloriesKcal, 0)
  return {
    id: 'version-1',
    version: 1,
    name: 'Turkey tofu stew',
    notes: null,
    yieldServings: null,
    finishedWeightG: null,
    caloriesKcal: calories,
    proteinG: ingredients.every((item) => item.lineProteinG != null) ? ingredients.reduce((sum, item) => sum + (item.lineProteinG ?? 0), 0) : null,
    carbsG: ingredients.every((item) => item.lineCarbsG != null) ? ingredients.reduce((sum, item) => sum + (item.lineCarbsG ?? 0), 0) : null,
    fatG: ingredients.every((item) => item.lineFatG != null) ? ingredients.reduce((sum, item) => sum + (item.lineFatG ?? 0), 0) : null,
    calculationVersion: 'recipe-v1',
    ingredients,
    ...overrides,
  }
}

function draft(ingredients: RecipeDraft['ingredients'], extras: Partial<RecipeDraft> = {}): RecipeDraft {
  return {
    sourceVersionId: 'version-1',
    previewFingerprint: null,
    name: 'Turkey tofu stew',
    notes: null,
    yieldServings: null,
    finishedWeightG: null,
    ingredients,
    ...extras,
  }
}

describe('recipe version preview', () => {
  it('creates no version when the formulation and food basis are unchanged', () => {
    const basis = food()
    const current = snapshot([line(basis, 2, 'serving')])
    const preview = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([{ foodId: 'food-a', amount: 2, unit: 'serving' }]),
      foods: new Map([[basis.id, basis]]),
    })
    if ('error' in preview) throw new Error(preview.error)
    expect(preview.status).toBe('no_changes')
    expect(preview.canCommit).toBe(false)
    expect(preview.previewFingerprint).toBeNull()
  })

  it('shows a live food correction before a refresh version', () => {
    const original = food({ calories: 100, protein: 20 })
    const current = snapshot([line(original, 2, 'serving')])
    const updated = food({ calories: 120, protein: 22, name: 'Kirkland Ground Turkey 93/7' })
    const preview = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([{ foodId: 'food-a', amount: 2, unit: 'serving' }]),
      foods: new Map([[updated.id, updated]]),
    })
    if ('error' in preview) throw new Error(preview.error)
    expect(preview.status).toBe('ready')
    expect(preview.candidateVersionNumber).toBe(2)
    expect(preview.ingredientBasisChanges[0]?.categories).toContain('food_basis_changed')
    expect(preview.candidateWholeNutrition?.caloriesKcal).toBe(240)
    expect(preview.currentWholeNutrition.caloriesKcal).toBe(200)
    expect(preview.nutritionDelta.caloriesKcal).toBe(40)
    expect(current.caloriesKcal).toBe(200)
    expect(current.ingredients[0]?.foodNameSnapshot).toBe('Food A')
  })

  it('leaves an unknown macro delta unavailable', () => {
    const original = food({ protein: 10, carbs: 3, fat: null })
    const current = snapshot([line(original, 1, 'serving'), line(food({ id: 'food-b', name: 'B', protein: null, carbs: 5, fat: 1 }), 1, 'serving', 2)])
    const preview = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([
        { foodId: 'food-a', amount: 2, unit: 'serving' },
        { foodId: 'food-b', amount: 1, unit: 'serving' },
      ]),
      foods: new Map([
        ['food-a', food({ protein: 10, carbs: 3, fat: null })],
        ['food-b', food({ id: 'food-b', name: 'B', protein: null, carbs: 5, fat: 1 })],
      ]),
    })
    if ('error' in preview) throw new Error(preview.error)
    expect(preview.candidateWholeNutrition?.proteinG).toBeNull()
    expect(preview.candidateWholeNutrition?.carbsG).toBe(11)
    expect(preview.nutritionDelta.proteinG).toBeNull()
    expect(preview.nutritionDelta.carbsG).toBe(3)
  })

  it('blocks a missing food until it is removed or replaced', () => {
    const kept = food()
    const missing = line(food({ id: 'gone', name: 'Old turkey' }), 1, 'serving', 1)
    missing.foodId = null
    const current = snapshot([missing, line(kept, 1, 'serving', 2)])
    const blocked = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([
        { foodId: null, amount: 1, unit: 'serving' },
        { foodId: 'food-a', amount: 1, unit: 'serving' },
      ]),
      foods: new Map([[kept.id, kept]]),
    })
    if ('error' in blocked) throw new Error(blocked.error)
    expect(blocked.canCommit).toBe(false)
    expect(blocked.ingredientChanges.some((change) => change.categories.includes('unresolved'))).toBe(true)
    const replaced = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([{ foodId: 'food-a', amount: 1, unit: 'serving' }]),
      foods: new Map([[kept.id, kept]]),
    })
    if ('error' in replaced) throw new Error(replaced.error)
    expect(replaced.canCommit).toBe(true)
    expect(replaced.ingredientChanges.some((change) => change.categories.includes('removed'))).toBe(true)
  })

  it('versions yield, order, and calculation without a second calculator', () => {
    const basis = food({ servingQuantity: 2, servingUnit: 'tbsp', servingGrams: 100, calories: 173 })
    const current = snapshot([line(basis, 1, 'tbsp'), line(food({ id: 'food-b', name: 'Onion' }), 1, 'serving', 2)], {
      yieldServings: 4,
      finishedWeightG: null,
    })
    const foods = new Map<string, RecipeFoodBasis>([
      [basis.id, basis],
      ['food-b', food({ id: 'food-b', name: 'Onion' })],
    ])
    const reordered = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft(
        [
          { foodId: 'food-b', amount: 1, unit: 'serving' },
          { foodId: 'food-a', amount: 1, unit: 'tbsp' },
        ],
        { yieldServings: 4 },
      ),
      foods,
    })
    if ('error' in reordered) throw new Error(reordered.error)
    expect(reordered.canCommit).toBe(true)
    expect(reordered.ingredientChanges.some((change) => change.categories.includes('reordered'))).toBe(true)
    const yielded = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft(
        [
          { foodId: 'food-a', amount: 1, unit: 'tbsp' },
          { foodId: 'food-b', amount: 1, unit: 'serving' },
        ],
        { yieldServings: 6, finishedWeightG: 900 },
      ),
      foods,
    })
    if ('error' in yielded) throw new Error(yielded.error)
    expect(yielded.yieldChanges.map((change) => change.field)).toEqual(['yieldServings', 'finishedWeightG'])
    expect(yielded.candidate?.calculationVersion).toBe('recipe-v1')
    expect(yielded.candidate?.ingredients[0]?.scaleFactor).toBe(0.5)
    expect(yielded.candidate?.ingredients[0]?.lineCaloriesKcal).toBe(86.5)
  })

  it('changes the fingerprint when the resolved food basis changes', () => {
    const current = snapshot([line(food(), 1, 'serving')])
    const first = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([{ foodId: 'food-a', amount: 2, unit: 'serving' }]),
      foods: new Map([['food-a', food({ calories: 100 })]]),
    })
    const second = previewRecipeVersion({
      recipeId: 'recipe-1',
      current,
      draft: draft([{ foodId: 'food-a', amount: 2, unit: 'serving' }]),
      foods: new Map([['food-a', food({ calories: 120 })]]),
    })
    if ('error' in first || 'error' in second) throw new Error('preview failed')
    expect(first.previewFingerprint).not.toBe(second.previewFingerprint)
  })
})
