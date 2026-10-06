import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError } from '../server/http.ts'

const calls = vi.hoisted(() => ({
  texts: [] as string[],
  transactions: 0,
  active: true,
  calories: 100,
  fiber: null as number | null,
  sodium: null as number | null,
  linkedIngredient: false,
  versionId: 'version-1',
  versionNumber: 1,
}))

vi.mock('../server/db.ts', () => ({
  getSql: async () => ({
    query: async (text: string, params: unknown[] = []) => {
      calls.texts.push(text)
      if (text.includes('FROM nutrition_foods')) {
        const ids = params[0] as string[]
        return ids
          .filter((id) => id !== 'missing' && id !== 'third')
          .map((id) => ({
            id,
            name: id === 'turkey' ? 'Ground Turkey' : `Food ${id}`,
            barcode: null,
            serving_quantity: 1,
            serving_unit: 'serving',
            serving_grams: id === 'weight' ? 100 : null,
            calories: id === 'turkey' ? calls.calories : 100,
            protein: id === 'unknown' ? null : 10,
            carbs: 3,
            fat: 2,
            fiber: id === 'turkey' ? calls.fiber : null,
            sodium: id === 'turkey' ? calls.sodium : null,
            source_kind: 'manual',
            archived: false,
          }))
      }
      if (text.includes("key = 'manual'")) return [{ id: '11111111-1111-4111-8111-111111111111' }]
      if (text.startsWith('INSERT INTO recipes')) return [{ id: params[0], created_at: params[2], updated_at: params[2] }]
      if (text.startsWith('INSERT INTO recipe_versions')) return [{ id: params[0], created_at: params[12] }]
      if (text.startsWith('UPDATE recipes')) return [{ id: params[0] }]
      if (text.includes('FROM recipes WHERE')) {
        return [{ id: 'recipe-1', is_active: calls.active, created_at: '2026-09-27T07:00:00.000Z', updated_at: '2026-09-27T07:00:00.000Z' }]
      }
      if (text.includes('FROM recipe_versions')) {
        return [{
          id: calls.versionId,
          version: calls.versionNumber,
          is_current: true,
          name: 'Sundubu-jjigae',
          notes: null,
          yield_servings: '6',
          finished_weight_g: null,
          calories_kcal: '200',
          protein_g: calls.linkedIngredient ? '20' : null,
          carbs_g: '8',
          fat_g: '4',
          fiber_g: null,
          sodium_mg: null,
          calculation_version: 'recipe-v1',
          created_at: '2026-09-27T07:00:00.000Z',
        }]
      }
      if (text.includes('FROM recipe_version_ingredients')) {
        return [{
          id: 'line-1',
          position: 1,
          food_id: calls.linkedIngredient ? 'turkey' : null,
          amount: '2',
          unit: 'serving',
          scale_factor: '2',
          food_name_snapshot: 'Ground Turkey',
          food_source_type_snapshot: 'manual',
          food_source_external_id_snapshot: null,
          base_serving_amount_snapshot: '1',
          base_serving_unit_snapshot: 'serving',
          base_weight_grams_snapshot: null,
          base_calories_kcal_snapshot: '100',
          base_protein_g_snapshot: calls.linkedIngredient ? '10' : null,
          base_carbs_g_snapshot: '3',
          base_fat_g_snapshot: '2',
          base_fiber_g_snapshot: null,
          base_sodium_mg_snapshot: null,
          line_calories_kcal: '200',
          line_protein_g: calls.linkedIngredient ? '20' : null,
          line_carbs_g: '6',
          line_fat_g: '4',
          line_fiber_g: null,
          line_sodium_mg: null,
        }]
      }
      if (text.includes('FROM recipes')) {
        return [{ id: 'recipe-1', version: 1, name: 'Sundubu-jjigae', is_current: true, calories_kcal: '200', yield_servings: '6', finished_weight_g: null }]
      }
      return []
    },
    transaction: async (queries: Array<Promise<unknown>>) => {
      calls.transactions += 1
      return Promise.all(queries)
    },
  }),
}))

import { archiveRecipe, commitRecipeVersion, createRecipe, getRecipe, listRecipes, previewRecipeEdit } from '../server/nutrition/recipes.ts'

const turkey = { foodId: 'turkey', amount: 2, unit: 'serving' }

describe('recipe creation', () => {
  beforeEach(() => {
    calls.texts = []
    calls.transactions = 0
    calls.active = true
    calls.calories = 100
    calls.fiber = null
    calls.sodium = null
    calls.linkedIngredient = false
    calls.versionId = 'version-1'
    calls.versionNumber = 1
  })

  it('commits identity, v1, and every line together', async () => {
    const created = await createRecipe({
      name: 'Sundubu-jjigae',
      notes: 'Weeknight',
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [turkey, { foodId: 'weight', amount: 50, unit: 'g' }, { foodId: 'unknown', amount: 1, unit: 'serving' }],
    })
    expect(created.version.version).toBe(1)
    expect(created.version.isCurrent).toBe(true)
    expect(created.version.caloriesKcal).toBe(350)
    expect(created.version.proteinG).toBeNull()
    expect(created.version.carbsG).toBe(10.5)
    expect(created.version.fatG).toBe(7)
    expect(created.version.ingredients.map((line) => line.foodNameSnapshot)).toEqual(['Ground Turkey', 'Food weight', 'Food unknown'])
    expect(created.version.ingredients[0]?.lineCaloriesKcal).toBe(200)
    const inserts = calls.texts.filter((text) => text.startsWith('INSERT INTO'))
    expect(inserts).toHaveLength(5)
    expect(inserts[1]).toContain('1, true')
    expect(calls.texts.join('\n')).not.toContain('nutrition_entries')
    expect(calls.transactions).toBe(1)
  })

  it('creates nothing when a later ingredient is invalid', async () => {
    await expect(
      createRecipe({
        name: 'Sundubu-jjigae',
        ingredients: [
          turkey,
          { foodId: 'weight', amount: 1, unit: 'serving' },
          { foodId: 'third', amount: 1, unit: 'serving' },
          { foodId: 'unknown', amount: 1, unit: 'serving' },
          { foodId: 'turkey', amount: 1, unit: 'cup' },
        ],
      }),
    ).rejects.toMatchObject({ statusCode: 422 })
    expect(calls.transactions).toBe(0)
    expect(calls.texts.some((text) => text.startsWith('INSERT INTO'))).toBe(false)
  })

  it('reads the snapshot after the food row is gone and archives without changing v1', async () => {
    const detail = await getRecipe('recipe-1')
    expect(detail.version.ingredients[0]).toMatchObject({ foodId: null, foodNameSnapshot: 'Ground Turkey', lineCaloriesKcal: 200, lineProteinG: null })
    expect(calls.texts.some((text) => text.includes('JOIN nutrition_foods'))).toBe(false)
    const archived = await archiveRecipe('recipe-1')
    expect(archived.version.caloriesKcal).toBe(200)
    expect(archived.version.name).toBe('Sundubu-jjigae')
    expect(calls.texts.some((text) => text.startsWith('UPDATE recipe_versions'))).toBe(false)
    expect(calls.texts.some((text) => text.startsWith('UPDATE recipes SET is_active'))).toBe(true)
    const listed = await listRecipes()
    expect(listed.recipes[0]?.caloriesKcal).toBe(200)
    expect(calls.texts.some((text) => text.includes('WHERE recipes.is_active'))).toBe(true)
  })

  it('rejects calculated client fields before writing', async () => {
    await expect(createRecipe({ name: 'Stew', calories: 1, ingredients: [turkey] })).rejects.toBeInstanceOf(HttpError)
    expect(calls.texts).toEqual([])
  })

  it('commits the next version from the locked current version', async () => {
    const preview = await previewRecipeEdit('recipe-1', {
      sourceVersionId: 'version-1',
      name: 'Sundubu-jjigae',
      notes: 'Updated',
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [turkey],
    })
    expect(preview.canCommit).toBe(true)
    expect(preview.candidateVersionNumber).toBe(2)
    calls.transactions = 0
    const saved = await commitRecipeVersion('recipe-1', { ...previewBody(), previewFingerprint: preview.previewFingerprint, notes: 'Updated' })
    expect(saved.id).toBe('recipe-1')
    const versionSql = calls.texts.find((text) => text.includes('version + 1')) ?? ''
    expect(versionSql).toContain('version + 1')
    expect(versionSql).not.toContain('MAX(version)')
    expect(calls.texts.some((text) => text.includes('FOR UPDATE'))).toBe(true)
    expect(calls.texts.some((text) => text.includes('version_guard'))).toBe(false)
    expect(calls.texts.some((text) => text.startsWith('UPDATE recipe_versions') && text.includes('is_current = false'))).toBe(true)
    expect(calls.texts.some((text) => text.includes('SET name'))).toBe(false)
    expect(calls.texts.join('\n')).not.toContain('nutrition_entries')
    expect(calls.transactions).toBe(1)
    calls.versionId = 'version-2'
    calls.versionNumber = 2
    const again = await previewRecipeEdit('recipe-1', {
      sourceVersionId: 'version-2',
      name: 'Sundubu-jjigae spicy',
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [turkey],
    })
    expect(again.currentVersion).toBe(2)
    expect(again.candidateVersionNumber).toBe(3)
    expect(again.canCommit).toBe(true)
  })

  it('saves a refreshed recipe version when linked foods gain fiber and sodium', async () => {
    calls.linkedIngredient = true
    calls.fiber = 3
    calls.sodium = 75
    const preview = await previewRecipeEdit('recipe-1', {
      sourceVersionId: 'version-1',
      name: 'Sundubu-jjigae',
      notes: null,
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [turkey],
    })
    expect(preview.canCommit).toBe(true)
    expect(preview.ingredientBasisChanges).toHaveLength(1)
    expect(preview.ingredientBasisChanges[0]?.to?.basis.fiberG).toBe(3)
    expect(preview.ingredientBasisChanges[0]?.to?.basis.sodiumMg).toBe(75)
    expect(preview.candidateWholeNutrition?.fiberG).toBe(6)
    expect(preview.candidateWholeNutrition?.sodiumMg).toBe(150)

    calls.transactions = 0
    const saved = await commitRecipeVersion('recipe-1', {
      ...previewBody(),
      previewFingerprint: preview.previewFingerprint,
    })
    expect(saved.id).toBe('recipe-1')
    expect(calls.transactions).toBe(1)
  })

  it('rejects a stale food preview and a stale recipe version before writing', async () => {
    const preview = await previewRecipeEdit('recipe-1', {
      sourceVersionId: 'version-1',
      name: 'Sundubu-jjigae',
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [turkey],
    })
    calls.calories = 120
    calls.transactions = 0
    await expect(commitRecipeVersion('recipe-1', { ...previewBody(), previewFingerprint: preview.previewFingerprint })).rejects.toMatchObject({
      statusCode: 409,
      code: 'stale_preview',
    })
    calls.calories = 100
    calls.versionId = 'version-2'
    await expect(commitRecipeVersion('recipe-1', { ...previewBody(), previewFingerprint: preview.previewFingerprint })).rejects.toMatchObject({
      statusCode: 409,
      code: 'stale_version',
    })
    expect(calls.transactions).toBe(0)
  })

  it('rejects archived edits and identical drafts', async () => {
    calls.active = false
    await expect(previewRecipeEdit('recipe-1', { ...previewBody(), sourceVersionId: 'version-1' })).rejects.toMatchObject({ statusCode: 409, code: 'archived' })
    calls.active = true
    const unchanged = await previewRecipeEdit('recipe-1', {
      sourceVersionId: 'version-1',
      name: 'Sundubu-jjigae',
      notes: null,
      yieldServings: 6,
      finishedWeightG: null,
      ingredients: [{ foodId: null, amount: 2, unit: 'serving' }],
    })
    expect(unchanged.canCommit).toBe(false)
    await expect(
      commitRecipeVersion('recipe-1', {
        sourceVersionId: 'version-1',
        previewFingerprint: 'fingerprint',
        name: 'Sundubu-jjigae',
        notes: null,
        yieldServings: 6,
        finishedWeightG: null,
        ingredients: [{ foodId: null, amount: 2, unit: 'serving' }],
      }),
    ).rejects.toMatchObject({ statusCode: 422, code: 'missing_food' })
  })
})

function previewBody() {
  return {
    sourceVersionId: 'version-1',
    name: 'Sundubu-jjigae',
    notes: null as string | null,
    yieldServings: 6,
    finishedWeightG: null,
    ingredients: [{ foodId: 'turkey', amount: 2, unit: 'serving' }],
  }
}
