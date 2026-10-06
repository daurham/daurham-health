import { describe, expect, it } from 'vitest'
import { buildLegacyRecipeDraft, type LegacyPromotionFood } from '../server/nutrition/legacy-recipes.ts'
import type { LegacyMealComboRecipe } from '../server/nutrition/legacy-source.ts'

function combo(overrides: Partial<LegacyMealComboRecipe> = {}): LegacyMealComboRecipe {
  return {
    id: 12,
    name: 'Old chili',
    mealType: 'composed',
    notes: 'Family batch',
    instructions: 'Simmer for 20 minutes.',
    ingredients: [
      { ingredientId: 1, name: 'Beans', unit: 'cup', quantity: 2 },
      { ingredientId: 2, name: 'Turkey', unit: 'serving', quantity: 1.5 },
    ],
    ...overrides,
  }
}

function food(foodId: string, name: string, servingUnit: string, archived = false): LegacyPromotionFood {
  return { foodId, name, servingUnit, archived }
}

describe('legacy recipe upgrade', () => {
  it('rebuilds a composed legacy meal with current Health food ids and serving units', () => {
    const draft = buildLegacyRecipeDraft(
      combo(),
      new Map([
        [1, food('11111111-1111-4111-8111-111111111111', 'Beans', 'cup')],
        [2, food('22222222-2222-4222-8222-222222222222', 'Turkey', 'serving')],
      ]),
    )
    if ('error' in draft) throw new Error(draft.error)
    expect(draft.name).toBe('Old chili')
    expect(draft.yieldServings).toBe(1)
    expect(draft.ingredients).toEqual([
      { foodId: '11111111-1111-4111-8111-111111111111', amount: 2, unit: 'cup' },
      { foodId: '22222222-2222-4222-8222-222222222222', amount: 1.5, unit: 'serving' },
    ])
    expect(draft.notes).toContain('Family batch')
    expect(draft.notes).toContain('Instructions')
    expect(draft.notes).toContain('Simmer for 20 minutes.')
  })

  it('blocks automatic upgrade when an imported ingredient is missing or archived', () => {
    const result = buildLegacyRecipeDraft(
      combo(),
      new Map([[1, food('11111111-1111-4111-8111-111111111111', 'Beans', 'cup', true)]]),
    )
    expect(result).toEqual({
      error: 'Cannot upgrade until the imported ingredients are available: Beans, Turkey. Restore or replace those foods, then try again.',
    })
  })

  it('does not pretend standalone legacy foods have recoverable ingredient recipes', () => {
    const result = buildLegacyRecipeDraft(combo({ mealType: 'standalone', ingredients: [] }), new Map())
    expect(result).toEqual({
      error: 'This imported item was stored as a standalone food, so there is no ingredient list to upgrade automatically.',
    })
  })
})
