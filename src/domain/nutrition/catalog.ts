import { NUTRITION_CONFIG } from './config.js'
import type { NutritionEntry, NutritionFood } from './types.js'

export function recentsFromEntries(
  entries: readonly NutritionEntry[],
  foods: readonly NutritionFood[],
  limit = NUTRITION_CONFIG.recentsLimit,
): NutritionFood[] {
  const byId = new Map(foods.map((food) => [food.id, food]))
  const seen = new Set<string>()
  const recents: NutritionFood[] = []
  const ordered = [...entries].sort((left, right) => {
    const leftKey = left.consumedAt ?? left.createdAt
    const rightKey = right.consumedAt ?? right.createdAt
    return rightKey < leftKey ? -1 : rightKey > leftKey ? 1 : 0
  })
  for (const entry of ordered) {
    if (!entry.foodId || seen.has(entry.foodId)) {
      continue
    }
    const food = byId.get(entry.foodId)
    if (!food || food.archived) {
      continue
    }
    seen.add(entry.foodId)
    recents.push(food)
    if (recents.length >= limit) {
      break
    }
  }
  return recents
}

export function rankFoodsForQuery(foods: readonly NutritionFood[], query: string): NutritionFood[] {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return [...foods]
  }
  return [...foods].sort((left, right) => {
    const delta = foodQueryScore(right, needle) - foodQueryScore(left, needle)
    if (delta !== 0) {
      return delta
    }
    return left.name.localeCompare(right.name)
  })
}

function foodQueryScore(food: NutritionFood, needle: string): number {
  const name = food.name.toLowerCase()
  const brand = (food.brand ?? '').toLowerCase()
  if (name === needle) {
    return 100
  }
  if (name.startsWith(needle)) {
    return 80
  }
  if (brand === needle) {
    return 70
  }
  if (brand.startsWith(needle)) {
    return 60
  }
  if (name.includes(needle)) {
    return 40
  }
  if (brand.includes(needle)) {
    return 30
  }
  return 0
}
