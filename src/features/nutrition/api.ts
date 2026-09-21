import type {
  NutritionEntry,
  NutritionEntryCreate,
  NutritionEntryPatch,
  NutritionFood,
  NutritionFoodCreate,
  NutritionFoodPatch,
  NutritionTarget,
  NutritionTargetCreate,
  NutritionDayTotals,
  PackagedFoodCandidate,
} from '@/domain/nutrition'
import { healthFetch, readApiError } from '@/lib'
import type { ReviewFieldError } from '@/domain/paper-load'

export type NutritionDayPayload = {
  date: string
  entries: NutritionEntry[]
  totals: NutritionDayTotals
  targets: NutritionTarget | null
  quickAdd: {
    recents: NutritionFood[]
    staples: NutritionFood[]
    recipes: NutritionFood[]
  }
}

async function parseOk<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as T
}

export async function fetchNutritionDay(date: string): Promise<NutritionDayPayload> {
  return parseOk(await healthFetch(`/api/nutrition/day?date=${encodeURIComponent(date)}`))
}

export async function searchNutritionFoods(query: string): Promise<NutritionFood[]> {
  const params = new URLSearchParams()
  if (query.trim().length > 0) {
    params.set('query', query.trim())
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const body = await parseOk<{ foods: NutritionFood[] }>(await healthFetch(`/api/nutrition/foods${suffix}`))
  return body.foods
}

export async function fetchNutritionFood(id: string): Promise<NutritionFood> {
  return parseOk(await healthFetch(`/api/nutrition/foods/${id}`))
}

export async function createNutritionFood(input: NutritionFoodCreate): Promise<NutritionFood> {
  return parseOk(
    await healthFetch('/api/nutrition/foods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function patchNutritionFood(id: string, input: NutritionFoodPatch): Promise<NutritionFood> {
  return parseOk(
    await healthFetch(`/api/nutrition/foods/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function createNutritionEntry(input: NutritionEntryCreate): Promise<NutritionEntry> {
  return parseOk(
    await healthFetch('/api/nutrition/entries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function patchNutritionEntry(id: string, input: NutritionEntryPatch): Promise<NutritionEntry> {
  return parseOk(
    await healthFetch(`/api/nutrition/entries/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function deleteNutritionEntry(id: string): Promise<void> {
  await parseOk(await healthFetch(`/api/nutrition/entries/${id}`, { method: 'DELETE' }))
}

export async function saveNutritionTarget(input: NutritionTargetCreate): Promise<NutritionTarget> {
  return parseOk(
    await healthFetch('/api/nutrition/targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export type BarcodeLookupResult =
  | { status: 'local'; barcode: string; food: NutritionFood }
  | { status: 'candidate'; barcode: string; candidate: PackagedFoodCandidate }

export class BarcodeLookupClientError extends Error {
  readonly status: number
  readonly code: 'invalid_barcode' | 'not_found' | 'provider_unavailable' | 'unknown'
  readonly barcode: string | null
  readonly fields: ReviewFieldError[]

  constructor(
    message: string,
    status: number,
    code: BarcodeLookupClientError['code'],
    barcode: string | null,
    fields: ReviewFieldError[] = [],
  ) {
    super(message)
    this.name = 'BarcodeLookupClientError'
    this.status = status
    this.code = code
    this.barcode = barcode
    this.fields = fields
  }
}

async function parseBarcodeResponse<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string
    code?: string
    barcode?: string | null
    fields?: ReviewFieldError[]
  } & T
  if (!response.ok) {
    const code =
      body.code === 'invalid_barcode' || body.code === 'not_found' || body.code === 'provider_unavailable'
        ? body.code
        : 'unknown'
    throw new BarcodeLookupClientError(
      typeof body.error === 'string' ? body.error : 'Request failed',
      response.status,
      code,
      body.barcode ?? null,
      Array.isArray(body.fields) ? body.fields : [],
    )
  }
  return body
}

export async function lookupNutritionBarcode(barcode: string): Promise<BarcodeLookupResult> {
  return parseBarcodeResponse(
    await healthFetch(`/api/nutrition/barcode/${encodeURIComponent(barcode)}`),
  )
}

export async function savePackagedFoodAndLog(input: {
  barcode: string
  name: string
  brand?: string | null
  servingQuantity: number
  servingUnit: string
  servingGrams?: number | null
  calories: number
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
  logDate: string
  timezone: string
  logQuantity?: number
  log?: boolean
}): Promise<{ food: NutritionFood; entry: NutritionEntry | null }> {
  return parseBarcodeResponse(
    await healthFetch('/api/nutrition/barcode/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
