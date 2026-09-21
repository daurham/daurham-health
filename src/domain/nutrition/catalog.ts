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

export function rankFoodsForQuery(
  foods: readonly NutritionFood[],
  query: string,
  options?: { recentIds?: readonly string[] },
): NutritionFood[] {
  const needle = query.trim().toLowerCase()
  const recentRank = new Map((options?.recentIds ?? []).map((id, index) => [id, index]))
  if (needle.length === 0) {
    return [...foods]
  }
  return [...foods].sort((left, right) => {
    const delta = foodQueryScore(right, needle, recentRank) - foodQueryScore(left, needle, recentRank)
    if (delta !== 0) {
      return delta
    }
    const leftRecent = recentRank.get(left.id) ?? Number.MAX_SAFE_INTEGER
    const rightRecent = recentRank.get(right.id) ?? Number.MAX_SAFE_INTEGER
    if (leftRecent !== rightRecent) {
      return leftRecent - rightRecent
    }
    return left.name.localeCompare(right.name)
  })
}

function foodQueryScore(
  food: NutritionFood,
  needle: string,
  recentRank: ReadonlyMap<string, number>,
): number {
  const name = food.name.toLowerCase()
  const brand = (food.brand ?? '').toLowerCase()
  let score = 0
  if (name === needle) {
    score = 100
  } else if (name.startsWith(needle)) {
    score = 80
  } else if (brand === needle) {
    score = 70
  } else if (brand.startsWith(needle)) {
    score = 60
  } else if (name.includes(needle)) {
    score = 40
  } else if (brand.includes(needle)) {
    score = 30
  }
  if (score > 0 && recentRank.has(food.id)) {
    score += 15
  }
  return score
}
