import type { NutrientAmount } from './servings.js'

export type NutrientTotalStatus = 'available' | 'insufficient_data'

export type NutrientTotal = {
  status: NutrientTotalStatus
  value: number | null
  observations: number
  missing: number
}

export type NutritionDayTotals = {
  calories: NutrientTotal
  protein: NutrientTotal
  carbs: NutrientTotal
  fat: NutrientTotal
  fiber: NutrientTotal
}

export type NutritionTotable = {
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

/**
 * Totals rule (documented for 9A):
 * - Calories are required on every canonical entry, including genuine 0.
 *   The calorie total is always the arithmetic sum (empty day → available 0).
 * - Protein/carbs/fat/fiber may be unknown (null). Unknown does not contribute 0.
 *   If any entry is missing that nutrient, the daily total is insufficient_data
 *   and value is null. If every entry has the nutrient (including 0), sum them.
 * Legacy NutriTrack stored calories as NOT NULL integers and macros as nullable
 * numerics; the UI treated missing macros as blank, not zero.
 */
function totalFor(values: readonly (number | null)[]): NutrientTotal {
  if (values.length === 0) {
    return { status: 'available', value: 0, observations: 0, missing: 0 }
  }
  let sum = 0
  let observations = 0
  let missing = 0
  for (const value of values) {
    if (value == null) {
      missing += 1
    } else {
      sum += value
      observations += 1
    }
  }
  if (missing > 0) {
    return { status: 'insufficient_data', value: null, observations, missing }
  }
  return { status: 'available', value: sum, observations, missing: 0 }
}

export function nutritionDayTotals(entries: readonly NutritionTotable[]): NutritionDayTotals {
  return {
    calories: totalFor(entries.map((entry) => entry.calories)),
    protein: totalFor(entries.map((entry) => entry.protein)),
    carbs: totalFor(entries.map((entry) => entry.carbs)),
    fat: totalFor(entries.map((entry) => entry.fat)),
    fiber: totalFor(entries.map((entry) => entry.fiber)),
  }
}

export function nutrientsFromAmount(amount: NutrientAmount): NutritionTotable {
  return amount
}
