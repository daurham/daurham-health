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
  PendingNutritionCapture,
  NutritionLabelJobResponse,
  NutritionMealJobResponse,
  CommitNutritionMealEstimateRequest,
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

export async function fetchNutritionDay(date: string, signal?: AbortSignal): Promise<NutritionDayPayload> {
  return parseOk(await healthFetch(`/api/nutrition/day?date=${encodeURIComponent(date)}`, { signal }))
}

export async function searchNutritionFoods(query: string, signal?: AbortSignal): Promise<NutritionFood[]> {
  const params = new URLSearchParams()
  if (query.trim().length > 0) {
    params.set('query', query.trim())
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : ''
  const body = await parseOk<{ foods: NutritionFood[] }>(
    await healthFetch(`/api/nutrition/foods${suffix}`, { signal }),
  )
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

export async function createNutritionLabelJob(
  file: File,
  input?: { userContext?: string; provider?: 'gemini' | 'home_ai' },
): Promise<{ id: string; status: 'queued' }> {
  const form = new FormData()
  form.set('image', file)
  if (input?.userContext) {
    form.set('userContext', input.userContext)
  }
  if (input?.provider) {
    form.set('provider', input.provider)
  }
  const response = await healthFetch('/api/nutrition/label/jobs', { method: 'POST', body: form })
  const body = await parseMealAction<{ job: { id: string; status: 'queued' } }>(response)
  return body.job
}

export async function fetchNutritionLabelJobs(): Promise<PendingNutritionCapture[]> {
  const body = await parseOk<{ jobs: PendingNutritionCapture[] }>(await healthFetch('/api/nutrition/label/jobs'))
  return body.jobs
}

export async function fetchNutritionLabelJob(jobId: string): Promise<NutritionLabelJobResponse> {
  return parseBarcodeResponse(await healthFetch(`/api/nutrition/label/jobs/${jobId}`))
}

export function nutritionLabelImageUrl(jobId: string): string {
  return `/api/nutrition/label/jobs/${jobId}/image`
}

export async function commitNutritionLabelReview(input: {
  jobId?: string
  existingFoodId?: string | null
  existingAction?: 'create' | 'log_existing' | 'update_and_log'
  productName: string
  brand?: string | null
  servingQuantity: number
  servingUnit: string
  servingGrams?: number | null
  servingsPerContainer?: number | null
  calories: number
  proteinGrams?: number | null
  carbsGrams?: number | null
  fatGrams?: number | null
  fiberGrams?: number | null
  basis: 'per_serving' | 'per_100g' | 'per_container' | 'unknown'
  barcode?: string | null
  logQuantity?: number
  logDate: string
  timezone: string
  catalogKind?: 'packaged' | 'custom'
}): Promise<{ food: NutritionFood; entry: NutritionEntry }> {
  return parseBarcodeResponse(
    await healthFetch('/api/nutrition/label/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export class MealClientError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = 'MealClientError'
    this.code = code
  }
}

async function parseMealAction<T>(response: Response): Promise<T> {
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string } & T
  if (!response.ok) {
    const code = typeof body.code === 'string' && body.code.length > 0 ? body.code : 'HOME_AI_UNAVAILABLE'
    throw new MealClientError(typeof body.error === 'string' ? body.error : 'Meal analysis is temporarily unavailable.', code)
  }
  return body
}

export async function createNutritionMealJob(
  file: File,
  input?: { userContext?: string; provider?: 'gemini' | 'home_ai' },
): Promise<{ id: string; status: 'queued' }> {
  const form = new FormData()
  form.set('image', file)
  if (input?.userContext) {
    form.set('userContext', input.userContext)
  }
  if (input?.provider) {
    form.set('provider', input.provider)
  }
  const response = await healthFetch('/api/nutrition/meal/jobs', { method: 'POST', body: form })
  const body = await parseMealAction<{ job: { id: string; status: 'queued' } }>(response)
  return body.job
}

export async function fetchNutritionMealJobs(): Promise<PendingNutritionCapture[]> {
  const body = await parseOk<{ jobs: PendingNutritionCapture[] }>(await healthFetch('/api/nutrition/meal/jobs'))
  return body.jobs
}

export async function fetchPendingNutritionCaptures(): Promise<PendingNutritionCapture[]> {
  const [labels, meals] = await Promise.all([
    fetchNutritionLabelJobs().catch(() => [] as PendingNutritionCapture[]),
    fetchNutritionMealJobs().catch(() => [] as PendingNutritionCapture[]),
  ])
  return [...labels, ...meals].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
}

export async function fetchNutritionMealJob(jobId: string): Promise<NutritionMealJobResponse> {
  return parseBarcodeResponse(await healthFetch(`/api/nutrition/meal/jobs/${jobId}`))
}

export function nutritionMealImageUrl(jobId: string): string {
  return `/api/nutrition/meal/jobs/${jobId}/image`
}

export type FoodDescriptionReview = {
  original: string
  components: Array<{
    id: string
    proposedName: string
    quantity: number | null
    unit: string
    preparation: string | null
    ambiguity: string | null
    matches: Array<{
      foodId: string
      name: string
      score: number
      servingQuantity: number
      servingUnit: string
      servingGrams: number | null
      calories: number
      protein: number | null
      carbs: number | null
      fat: number | null
      fiber: number | null
    }>
    usda: Array<{
      fdcId: number
      name: string
      servingQuantity: number
      servingUnit: string
      servingGrams: number
      calories: number
      protein: number | null
      carbs: number | null
      fat: number | null
      fiber: number | null
    }>
    selectedFoodId: string | null
  }>
}

export async function reanalyzeNutritionMealJob(
  jobId: string,
  input: { userContext?: string | null; provider?: 'gemini' | 'home_ai' },
): Promise<{ id: string; status: 'queued' }> {
  const response = await healthFetch(`/api/nutrition/meal/jobs/${jobId}/reanalyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseMealAction<{ job: { id: string; status: 'queued' } }>(response)
  return body.job
}

export async function reanalyzeNutritionLabelJob(
  jobId: string,
  input: { userContext?: string | null; provider?: 'gemini' | 'home_ai' },
): Promise<{ id: string; status: 'queued' }> {
  const response = await healthFetch(`/api/nutrition/label/jobs/${jobId}/reanalyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const body = await parseMealAction<{ job: { id: string; status: 'queued' } }>(response)
  return body.job
}

export async function describeFoodText(text: string, provider?: 'gemini' | 'home_ai'): Promise<FoodDescriptionReview> {
  const response = await healthFetch('/api/nutrition/describe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, provider }),
  })
  return parseMealAction<FoodDescriptionReview>(response)
}

export async function commitFoodDescription(input: {
  text: string
  logDate: string
  timezone: string
  meal?: string | null
  components: Array<{
    id: string
    included: boolean
    proposedName: string
    foodId: string | null
    fdcId?: number | null
    quantity: number | null
    unit: string
    grams: number | null
  }>
}): Promise<{ entries: NutritionEntry[]; mealGroupId: string }> {
  return parseOk(
    await healthFetch('/api/nutrition/describe/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}

export async function commitNutritionMealReview(
  input: CommitNutritionMealEstimateRequest,
): Promise<{ entries: NutritionEntry[] }> {
  return parseBarcodeResponse(
    await healthFetch('/api/nutrition/meal/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    }),
  )
}
