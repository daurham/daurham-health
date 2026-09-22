import { loadLocalEnv } from '../../env.js'

const FDC_BASE = 'https://api.nal.usda.gov/fdc/v1'
const TIMEOUT_MS = 8000
const NUTRIENT_IDS = {
  calories: 1008,
  protein: 1003,
  carbs: 1005,
  fat: 1004,
  fiber: 1079,
} as const

export type UsdaFoodCandidate = {
  fdcId: number
  name: string
  servingQuantity: number
  servingUnit: 'g'
  servingGrams: number
  calories: number
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

export type UsdaSearchResult =
  | { status: 'found'; candidates: UsdaFoodCandidate[] }
  | { status: 'unavailable' }
  | { status: 'not_configured' }

type UsdaFetch = typeof fetch

export function usdaApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const key = env.USDA_FDC_API_KEY?.trim()
  return key ? key : null
}

function nutrientValue(food: Record<string, unknown>, id: number): number | null {
  const nutrients = Array.isArray(food.foodNutrients) ? food.foodNutrients : []
  for (const item of nutrients) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    const nutrientId = Number(row.nutrientId ?? (row.nutrient as { id?: unknown } | undefined)?.id)
    if (nutrientId !== id) {
      continue
    }
    const value = Number(row.value ?? row.amount)
    return Number.isFinite(value) ? value : null
  }
  return null
}

export function usdaCandidateFromFood(food: Record<string, unknown>): UsdaFoodCandidate | null {
  const fdcId = Number(food.fdcId)
  const name = typeof food.description === 'string' ? food.description.trim() : ''
  const calories = nutrientValue(food, NUTRIENT_IDS.calories)
  if (!Number.isInteger(fdcId) || fdcId <= 0 || !name || calories == null || calories < 0) {
    return null
  }
  return {
    fdcId,
    name: name.slice(0, 200),
    servingQuantity: 100,
    servingUnit: 'g',
    servingGrams: 100,
    calories,
    protein: nutrientValue(food, NUTRIENT_IDS.protein),
    carbs: nutrientValue(food, NUTRIENT_IDS.carbs),
    fat: nutrientValue(food, NUTRIENT_IDS.fat),
    fiber: nutrientValue(food, NUTRIENT_IDS.fiber),
  }
}

async function fdcGet(fetchImpl: UsdaFetch, path: string, key: string): Promise<unknown | null> {
  const url = new URL(`${FDC_BASE}${path}`)
  url.searchParams.set('api_key', key)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      return null
    }
    return (await response.json()) as unknown
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function createUsdaFdcProvider(fetchImpl: UsdaFetch = fetch, env: NodeJS.ProcessEnv = process.env) {
  return {
    async search(query: string): Promise<UsdaSearchResult> {
      await loadLocalEnv()
      const key = usdaApiKey(env)
      if (!key) {
        return { status: 'not_configured' }
      }
      const params = new URLSearchParams({
        query,
        pageSize: '5',
        dataType: 'Foundation,SR Legacy',
      })
      const body = await fdcGet(fetchImpl, `/foods/search?${params.toString()}`, key)
      if (!body || typeof body !== 'object') {
        return { status: 'unavailable' }
      }
      const foods = Array.isArray((body as { foods?: unknown }).foods) ? (body as { foods: unknown[] }).foods : []
      const candidates = foods
        .map((food) => (food && typeof food === 'object' ? usdaCandidateFromFood(food as Record<string, unknown>) : null))
        .filter((food): food is UsdaFoodCandidate => food != null)
        .slice(0, 5)
      return { status: 'found', candidates }
    },

    async getFood(fdcId: number): Promise<UsdaFoodCandidate | null> {
      await loadLocalEnv()
      const key = usdaApiKey(env)
      if (!key || !Number.isInteger(fdcId) || fdcId <= 0) {
        return null
      }
      const body = await fdcGet(fetchImpl, `/food/${fdcId}`, key)
      if (!body || typeof body !== 'object') {
        return null
      }
      return usdaCandidateFromFood(body as Record<string, unknown>)
    },
  }
}
