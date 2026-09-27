import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  composeRecipe,
  parseRecipeCreate,
  resolveIngredientScale,
  type RecipeFoodBasis,
} from '../src/domain/nutrition/recipes.ts'

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

function composed(ingredients: Array<{ food: RecipeFoodBasis; amount: number; unit: string }>, extras: { yieldServings?: number | null; finishedWeightG?: number | null } = {}) {
  const result = composeRecipe({
    name: 'Sundubu-jjigae',
    notes: null,
    yieldServings: extras.yieldServings ?? null,
    finishedWeightG: extras.finishedWeightG ?? null,
    ingredients,
  })
  if ('error' in result) throw new Error(result.error)
  return result
}

describe('recipe unit resolution', () => {
  const basis = food({ servingQuantity: 2, servingUnit: 'tbsp', servingGrams: 56.69904625, calories: 173 })

  it('scales servings, matching food units, and weights', () => {
    expect(resolveIngredientScale(basis, 1, 'serving')).toEqual({ scaleFactor: 1 })
    expect(resolveIngredientScale(basis, 2, 'servings')).toEqual({ scaleFactor: 2 })
    expect(resolveIngredientScale(basis, 0.5, 'serving')).toEqual({ scaleFactor: 0.5 })
    expect(resolveIngredientScale(basis, 1, 'tbsp')).toEqual({ scaleFactor: 0.5 })
    expect(resolveIngredientScale(basis, 1, ' Tbsp ')).toEqual({ scaleFactor: 0.5 })
    expect(resolveIngredientScale(basis, 28.349523125, 'g')).toEqual({ scaleFactor: 0.5 })
    expect(resolveIngredientScale(basis, 1, 'oz')).toEqual({ scaleFactor: 0.5 })
    expect(resolveIngredientScale(food({ servingGrams: 453.59237 }), 1, 'pound')).toEqual({ scaleFactor: 1 })
    expect(resolveIngredientScale(food({ servingGrams: 453.59237 }), 2, 'pounds')).toEqual({ scaleFactor: 2 })
  })

  it('rejects missing weight basis, unsupported conversions, and non-positive amounts', () => {
    expect(resolveIngredientScale(food({ servingGrams: null }), 10, 'g')).toEqual({
      error: 'That food has no weight basis, so a weight amount cannot be used.',
    })
    expect(resolveIngredientScale(basis, 1, 'cup')).toEqual({ error: 'That unit cannot be converted for this food.' })
    expect(resolveIngredientScale(basis, 0, 'serving')).toEqual({ error: 'Ingredient amount must be greater than zero.' })
    expect(resolveIngredientScale(basis, -1, 'oz')).toEqual({ error: 'Ingredient amount must be greater than zero.' })
  })
})

describe('recipe nutrition snapshots', () => {
  it('keeps fractional calories and leaves an unknown macro unknown', () => {
    const recipe = composed([
      { food: food({ id: 'a', calories: 173, protein: 10, carbs: 3, fat: null }), amount: 0.5, unit: 'serving' },
      { food: food({ id: 'b', name: 'B', calories: 100, protein: null, carbs: 5, fat: 1 }), amount: 2, unit: 'servings' },
    ])
    expect(recipe.ingredients.map((line) => line.lineCaloriesKcal)).toEqual([86.5, 200])
    expect(recipe.caloriesKcal).toBe(286.5)
    expect(recipe.proteinG).toBeNull()
    expect(recipe.carbsG).toBe(11.5)
    expect(recipe.fatG).toBeNull()
    expect(recipe.calculationVersion).toBe('recipe-v1')
  })

  it('sums each known macro on its own', () => {
    const recipe = composed([
      { food: food({ id: 'a', protein: 10, carbs: 3, fat: 1 }), amount: 1, unit: 'serving' },
      { food: food({ id: 'b', name: 'B', protein: null, carbs: 5, fat: null }), amount: 1, unit: 'serving' },
    ])
    expect(recipe.proteinG).toBeNull()
    expect(recipe.carbsG).toBe(8)
    expect(recipe.fatG).toBeNull()
    expect(recipe.caloriesKcal).toBe(200)
  })

  it('keeps the food basis after the reusable food changes', () => {
    const turkey = food({ id: 'turkey', name: 'Ground Turkey', calories: 100, protein: 20, carbs: 0, fat: 4 })
    const recipe = composed([{ food: turkey, amount: 2, unit: 'serving' }])
    turkey.calories = 120
    turkey.name = 'Kirkland Ground Turkey 93/7'
    turkey.protein = null
    expect(recipe.caloriesKcal).toBe(200)
    expect(recipe.ingredients[0]?.foodNameSnapshot).toBe('Ground Turkey')
    expect(recipe.ingredients[0]?.baseCaloriesKcalSnapshot).toBe(100)
    expect(recipe.proteinG).toBe(40)
  })

  it('allows the same food twice and keeps owner order', () => {
    const oil = food({ id: 'oil', name: 'Olive oil', calories: 40 })
    const recipe = composed([
      { food: oil, amount: 1, unit: 'serving' },
      { food: food({ id: 'onion', name: 'White onion' }), amount: 1, unit: 'serving' },
      { food: oil, amount: 0.5, unit: 'serving' },
    ])
    expect(recipe.ingredients.map((line) => [line.position, line.foodId, line.amount])).toEqual([
      [1, 'oil', 1],
      [2, 'onion', 1],
      [3, 'oil', 0.5],
    ])
  })

  it('stores optional yield without inventing nutrition', () => {
    const recipe = composed([{ food: food(), amount: 1, unit: 'serving' }], { yieldServings: 6, finishedWeightG: 900 })
    expect(recipe.yieldServings).toBe(6)
    expect(recipe.finishedWeightG).toBe(900)
    expect(recipe.caloriesKcal).toBe(100)
  })

  it('rejects client-supplied nutrition and a missing ingredient', () => {
    const foods = new Map([['a', food({ id: 'a' })]])
    expect(parseRecipeCreate({ name: 'Stew', calories: 10, ingredients: [{ foodId: 'a', amount: 1, unit: 'serving' }] }, foods)).toEqual({
      error: 'Recipe nutrition comes from the foods, not the request.',
    })
    expect(parseRecipeCreate({ name: 'Stew', ingredients: [{ foodId: 'a', amount: 1, unit: 'serving', scaleFactor: 2 }] }, foods)).toEqual({
      error: 'Recipe nutrition comes from the foods, not the request.',
    })
    expect(parseRecipeCreate({ name: 'Stew', ingredients: [] }, foods)).toEqual({ error: 'A recipe needs at least one ingredient.' })
  })
})

describe('recipe schema', () => {
  const sql = readFileSync('migrations/0024_recipes.sql', 'utf8')

  it('keeps one current version and survives food deletion', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX recipe_versions_one_current')
    expect(sql).toContain('WHERE is_current')
    expect(sql).toContain('REFERENCES nutrition_foods (id) ON DELETE SET NULL')
    expect(sql).toContain("calculation_version = 'recipe-v1'")
    expect(sql).not.toContain('meal_combos')
    expect(sql).not.toContain('fiber')
  })

  it('stays off the demo routes', () => {
    const routes = readFileSync('src/routes/index.tsx', 'utf8')
    expect(routes).toContain("path: 'nutrition/recipes'")
    expect(routes).not.toContain('demo/nutrition/recipes')
  })
})
