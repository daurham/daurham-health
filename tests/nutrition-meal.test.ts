import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  applyRecipeSelection,
  draftFromMealCandidate,
  emptyMealCandidate,
  looksLikeHiddenFat,
  matchMealComponent,
  mealFailureMessage,
  mealReviewTotals,
  nutritionDayTotals,
  nutritionMealJobFingerprint,
  recipeCandidatesForComponents,
  roundVisualGrams,
  sanitizeMealCandidate,
  sanitizeMealEstimate,
  scaleMealEstimate,
  mealEstimateUserAdjusted,
  emptyMealEstimate,
  validateMealEstimateReview,
  validateMealReview,
  type NutritionFood,
} from '../src/domain/nutrition/index.ts'
import { CLAIM_MEAL_GROUP_SQL } from '../server/nutrition/meal.ts'
import { INSERT_ENTRY_WITH_ID_SQL } from '../server/nutrition/queries.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'

const JOB_ID = '33333333-3333-4333-8333-333333333333'
const CHICKEN_ID = '11111111-1111-4111-8111-111111111111'
const RICE_ID = '22222222-2222-4222-8222-222222222222'
const BROCCOLI_ID = '44444444-4444-4444-8444-444444444444'
const BOWL_ID = '55555555-5555-4555-8555-555555555555'
const OIL_ID = '66666666-6666-4666-8666-666666666666'

function food(partial: Partial<NutritionFood> & Pick<NutritionFood, 'id' | 'name'>): NutritionFood {
  return {
    brand: null,
    barcode: null,
    catalogKind: 'ingredient',
    servingQuantity: 1,
    servingUnit: 'serving',
    servingGrams: 100,
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

const catalog = [
  food({ id: CHICKEN_ID, name: 'Chicken Breast', protein: 31, carbs: 0, fat: 4, calories: 165, servingGrams: 100, isStaple: true }),
  food({ id: RICE_ID, name: 'White Rice', protein: 4, carbs: 45, fat: 0, calories: 200, servingGrams: 150 }),
  food({ id: BROCCOLI_ID, name: 'Broccoli', protein: 3, carbs: 6, fat: 0, calories: 30, servingGrams: 80 }),
  food({
    id: BOWL_ID,
    name: 'Beef Rice Broccoli Bowl',
    catalogKind: 'recipe',
    calories: 620,
    protein: 40,
    carbs: 55,
    fat: 18,
  }),
  food({ id: OIL_ID, name: 'Olive Oil', calories: 40, protein: 0, carbs: 0, fat: 4.5, servingUnit: 'tsp' }),
]

describe('meal photo candidate', () => {
  it('keeps one or many components and never stores model macros', () => {
    const one = sanitizeMealCandidate({
      components: [{ proposedName: 'plain yogurt', portionEstimate: { gramsEstimate: 147.382, confidence: 'medium' } }],
      calories: 312,
      protein: 18,
    })
    expect(one.status).toBe('review_required')
    expect(one.components).toHaveLength(1)
    expect(one.components[0]?.portionEstimate.gramsEstimate).toBe(150)
    expect(one.notes.some((note) => /Ignored model-generated nutrition totals/.test(note))).toBe(true)
    expect(one).not.toHaveProperty('calories')

    const many = sanitizeMealCandidate({
      components: [
        { proposedName: 'grilled chicken breast' },
        { proposedName: 'white rice' },
        { proposedName: 'steamed broccoli' },
      ],
      possibleUnaccountedItems: ['cooking oil'],
    })
    expect(many.components.map((item) => item.proposedName)).toEqual([
      'grilled chicken breast',
      'white rice',
      'steamed broccoli',
    ])
    expect(many.possibleUnaccountedItems).toEqual(['cooking oil'])
  })

  it('marks no food recognized as invalid and keeps incomplete estimates', () => {
    expect(sanitizeMealCandidate({ components: [] }).status).toBe('invalid')
    const incomplete = sanitizeMealCandidate({
      components: [{ proposedName: 'restaurant stir fry', portionEstimate: { description: 'a bowl', gramsEstimate: null } }],
    })
    expect(incomplete.components[0]?.portionEstimate.gramsEstimate).toBeNull()
    expect(incomplete.components[0]?.portionEstimate.description).toBe('a bowl')
  })

  it('rounds visual grams conservatively', () => {
    expect(roundVisualGrams(147.382)).toBe(150)
    expect(roundVisualGrams(12.4)).toBe(12)
    expect(roundVisualGrams(null)).toBeNull()
  })
})

describe('meal catalog matching', () => {
  it('ranks exact, recent, staple, and recipe matches without inventing ids', () => {
    const exact = matchMealComponent('white rice', catalog)
    expect(exact[0]?.food.id).toBe(RICE_ID)
    expect(exact[0]?.reason).toBe('exact')
    expect(exact.every((item) => catalog.some((food) => food.id === item.food.id))).toBe(true)

    const recent = matchMealComponent('chicken', catalog, { recentIds: [CHICKEN_ID] })
    expect(recent[0]?.food.id).toBe(CHICKEN_ID)

    const recipes = recipeCandidatesForComponents(
      catalog.filter((item) => item.catalogKind === 'recipe'),
      ['rice', 'beef', 'broccoli'],
    )
    expect(recipes.map((item) => item.id)).toContain(BOWL_ID)
    expect(recipeCandidatesForComponents(catalog, ['yogurt'])).toEqual([])
  })

  it('leaves unknown components unmatched', () => {
    const matches = matchMealComponent('dragonfruit foam clouds', catalog)
    expect(matches).toEqual([])
    const draft = draftFromMealCandidate(
      sanitizeMealCandidate({ components: [{ proposedName: 'dragonfruit foam clouds' }] }),
      catalog,
    )
    expect(draft.components[0]?.foodId).toBeNull()
    expect(validateMealReview(draft)[0]?.message).toMatch(/Choose a Health food/)
  })
})

describe('meal portions, totals, and grouping', () => {
  it('keeps estimated grams editable and does not use AI macros for totals', () => {
    const candidate = sanitizeMealCandidate({
      components: [
        { proposedName: 'chicken breast', portionEstimate: { gramsEstimate: 150, confidence: 'medium' } },
        { proposedName: 'white rice', portionEstimate: { description: '~1 cup' } },
      ],
    })
    const draft = draftFromMealCandidate(candidate, catalog)
    expect(draft.components[0]?.grams).toBe(150)
    expect(draft.components[0]?.estimated).toBe(true)
    draft.components[0]!.grams = 180
    draft.components[0]!.estimated = false
    const foods = new Map(catalog.map((item) => [item.id, item]))
    const withoutOil = mealReviewTotals(draft.components, foods)
    expect(withoutOil.calories).toBeGreaterThan(0)
    const withOil = mealReviewTotals(
      [
        ...draft.components,
        {
          id: 'oil',
          included: false,
          proposedName: 'olive oil',
          foodId: OIL_ID,
          quantity: 1,
          unit: 'tbsp',
          grams: null,
          portionDescription: null,
          portionConfidence: null,
          identificationUncertain: false,
          estimated: false,
          collapsedByRecipe: false,
        },
      ],
      foods,
    )
    expect(withOil.calories).toBe(withoutOil.calories)
    expect(looksLikeHiddenFat('cooking oil')).toBe(true)
  })

  it('collapses overlapping components when a recipe is selected', () => {
    const draft = draftFromMealCandidate(
      sanitizeMealCandidate({
        components: [{ proposedName: 'rice' }, { proposedName: 'broccoli' }, { proposedName: 'chicken breast' }],
      }),
      catalog,
    )
    const recipe = catalog.find((item) => item.id === BOWL_ID)!
    const next = applyRecipeSelection(draft, recipe, ['rice', 'broccoli', 'chicken breast'])
    expect(next.recipeFoodId).toBe(BOWL_ID)
    expect(next.components.find((item) => item.proposedName === 'rice')?.collapsedByRecipe).toBe(true)
    expect(next.components.find((item) => item.proposedName === 'broccoli')?.collapsedByRecipe).toBe(true)
    expect(next.components.find((item) => item.proposedName === 'chicken breast')?.collapsedByRecipe).toBe(false)
    const foods = new Map(catalog.map((item) => [item.id, item]))
    const totals = mealReviewTotals(next.components, foods, recipe)
    expect(totals.calories).toBeGreaterThan(620)
  })
})

describe('meal photo jobs routing and provenance', () => {
  it('uses a dedicated meal namespace, claims a group fingerprint, and stays off label/workout prompts', () => {
    expect(matchHealthApiRoute('/api/nutrition/meal/jobs')).toBe('nutrition-meal-jobs')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/image`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute('/api/nutrition/meal/commit')).toBe('nutrition-meal-commit')
    expect(nutritionMealJobFingerprint(JOB_ID)).toBe(`nutrition-meal-v1-job:${JOB_ID}`)
    expect(CLAIM_MEAL_GROUP_SQL).toMatch(/ON CONFLICT \(source_id, external_fingerprint\) DO NOTHING/)
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).toContain('NUTRITION_MEAL_GROUP_ENTITY')
    expect(INSERT_ENTRY_WITH_ID_SQL).toContain('meal_group_id')
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).not.toContain('/api/workouts/v1.3')
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).not.toContain('/api/nutrition/label')
    expect(readFileSync('server/handlers/nutrition-meal-jobs.ts', 'utf8')).toContain('withOwnerAuth')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).not.toContain('HOME_AI_API_KEY')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).not.toContain('searchNutritionFoods')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).not.toContain('USDA')
    expect(readFileSync('server/handlers/nutrition-meal-commit.ts', 'utf8')).toContain('commitNutritionMealEstimate')
    expect(readFileSync('server/nutrition/describe.ts', 'utf8')).toContain('commitFoodDescription')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('Build meal manually')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('Review the estimate before saving.')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).not.toContain('AI calorie')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('What AI saw')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('As estimated')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('Discard capture')
    expect(readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')).toContain('Dismiss')
    expect(readFileSync('server/nutrition/label-jobs.ts', 'utf8')).toContain('DELETE FROM nutrition_capture_jobs')
    expect(readFileSync('server/handlers/nutrition-meal-job-detail.ts', 'utf8')).toContain('dismissNutritionMealJob')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('inputMode="decimal"')
    expect(readFileSync('src/features/nutrition/prepare-meal-photo.ts', 'utf8')).toContain('2000')
    expect(readFileSync('src/features/nutrition/prepare-label-photo.ts', 'utf8')).toContain('2800')
    expect(readFileSync('src/features/training/prepare-workout-photo.ts', 'utf8')).toContain('2400')
    expect(mealFailureMessage('HOME_AI_UNAVAILABLE')).toMatch(/unavailable/i)
    expect(mealFailureMessage('UNREADABLE_MEAL')).toMatch(/usable meal/i)
    expect(emptyMealCandidate().components).toEqual([])
    expect(readdirSync('api').filter((name) => name.endsWith('.ts'))).toEqual(['index.ts'])
  })
})

describe('meal photo estimate review', () => {
  it('keeps the original AI estimate as the portion-scale baseline', () => {
    const estimate = sanitizeMealEstimate({
      name: 'Chicken, rice and broccoli',
      foodsSeen: ['chicken', 'rice', 'broccoli'],
      assumptions: ['some cooking oil may be present'],
      calories: 722,
      proteinGrams: 48.2,
      carbsGrams: 76.4,
      fatGrams: 25.1,
      fiberGrams: 7.4,
    })
    expect(estimate.calories).toBe(720)
    expect(estimate.proteinGrams).toBe(48)
    const plus = scaleMealEstimate(estimate, 1.1)
    expect(plus.calories).toBe(790)
    expect(plus.proteinGrams).toBe(53)
    const minus = scaleMealEstimate(estimate, 0.75)
    expect(minus.calories).toBe(540)
    expect(mealEstimateUserAdjusted(estimate, plus)).toBe(true)
    expect(mealEstimateUserAdjusted(estimate, estimate)).toBe(false)
    expect(validateMealEstimateReview({ name: '', calories: 720 })[0]?.path).toBe('name')
    expect(emptyMealEstimate().calories).toBe(0)
    const afterPlusThenMinus = scaleMealEstimate(estimate, 0.75)
    expect(afterPlusThenMinus).toEqual(minus)
    expect(scaleMealEstimate(plus, 0.75).calories).not.toBe(minus.calories)
  })

  it('saves one reviewed snapshot and keeps the original AI estimate in provenance', () => {
    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    const commit = meal.slice(meal.indexOf('export async function commitNutritionMealEstimate'), meal.length)
    expect(commit).toContain("source: 'meal_photo_ai'")
    expect(commit).toContain("provider: 'gemini'")
    expect(commit).toContain('estimated: true')
    expect(commit).toContain('reviewed: true')
    expect(commit).toContain('userAdjusted: mealEstimateUserAdjusted(baseline, reviewed)')
    expect(commit).toContain('aiEstimate: baseline')
    expect(commit).toContain('reviewedValues: reviewed')
    expect(commit).toContain("'nutrition_entry'")
    expect(commit).toContain("'photo_ai'")
    expect(commit).toMatch(/reviewed\.calories/)
    expect(commit).toMatch(/reviewed\.proteinGrams/)
    expect(commit).toContain("'meal'")
    expect(commit).toContain('return { entries: [entry] }')
    expect(commit).not.toContain('listEntriesByMealGroup')
    expect(meal).not.toContain('matchMealComponent')
    expect(meal).not.toContain('searchUsda')
    expect(readFileSync('server/handlers/nutrition-meal-commit.ts', 'utf8')).not.toContain('commitNutritionMeal(')
    expect(readFileSync('server/nutrition/describe.ts', 'utf8')).toContain("source: 'description_ai'")
    expect(readFileSync('src/features/nutrition/BarcodeScanner.tsx', 'utf8')).toContain('Enter barcode manually')
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).toContain('Analyze label')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('reanalyzeNutritionMealJob(previousId')
    expect(readFileSync('server/nutrition/meal.ts', 'utf8')).toContain('requeueCaptureJob({ jobId, userContext: input.userContext })')
    const edited = { calories: 680, proteinGrams: 38, carbsGrams: 76, fatGrams: 25, fiberGrams: 7 }
    const baseline = { calories: 720, proteinGrams: 48, carbsGrams: 76, fatGrams: 25, fiberGrams: 7 }
    expect(mealEstimateUserAdjusted(baseline, edited)).toBe(true)
    const totals = nutritionDayTotals([
      {
        calories: edited.calories,
        protein: edited.proteinGrams,
        carbs: edited.carbsGrams,
        fat: edited.fatGrams,
        fiber: edited.fiberGrams,
      },
    ])
    expect(totals.calories).toMatchObject({ status: 'available', value: 680 })
    expect(totals.protein).toMatchObject({ status: 'available', value: 38 })
    expect(totals.calories.value).not.toBe(baseline.calories)
  })
})
