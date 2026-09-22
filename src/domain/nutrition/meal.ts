import { z } from 'zod'
import { HOME_AI_JOB_ID_RE, isHomeAiJobId } from '../training-transcription.js'
import type { ReviewFieldError } from '../paper-load.js'
import { rankFoodsForQuery } from './catalog.js'
import { snapshotFromDefinition, type NutrientAmount } from './servings.js'
import type { NutritionFood } from './types.js'

export const NUTRITION_MEAL_SCHEMA_VERSION = '1.0'
export const NUTRITION_MEAL_PIPELINE = 'nutrition-meal-v1'
export const NUTRITION_MEAL_SOURCE_KEY = 'meal_photo'
export const NUTRITION_MEAL_CAPTURE_KIND = 'meal_photo'
export const NUTRITION_MEAL_GROUP_ENTITY = 'nutrition_meal_group'

export const MEAL_CONFIDENCE = ['low', 'medium', 'high'] as const
export type MealConfidence = (typeof MEAL_CONFIDENCE)[number]

export const MEAL_CANDIDATE_STATUSES = ['review_required', 'invalid'] as const
export type MealCandidateStatus = (typeof MEAL_CANDIDATE_STATUSES)[number]

export const mealPortionEstimateSchema = z.object({
  description: z.string().nullable(),
  gramsEstimate: z.number().nullable(),
  confidence: z.enum(MEAL_CONFIDENCE).nullable(),
})
export type MealPortionEstimate = z.infer<typeof mealPortionEstimateSchema>

export const mealComponentSchema = z.object({
  id: z.string().min(1),
  proposedName: z.string().min(1),
  preparation: z.string().nullable(),
  portionEstimate: mealPortionEstimateSchema,
  visualConfidence: z.enum(MEAL_CONFIDENCE).nullable(),
  catalogHints: z.array(z.string()).default([]),
  ambiguities: z.array(z.string()).default([]),
})
export type MealComponent = z.infer<typeof mealComponentSchema>

export const mealPhotoCandidateSchema = z.object({
  schemaVersion: z.literal(NUTRITION_MEAL_SCHEMA_VERSION),
  status: z.enum(MEAL_CANDIDATE_STATUSES),
  pipeline: z.string().optional(),
  model: z.string().nullable().optional(),
  components: z.array(mealComponentSchema),
  possibleUnaccountedItems: z.array(z.string()).default([]),
  notes: z.array(z.string()).default([]),
})
export type MealPhotoCandidate = z.infer<typeof mealPhotoCandidateSchema>

export const homeAiMealCreatedJobSchema = z.object({
  ok: z.literal(true),
  job: z.object({
    id: z.string().regex(HOME_AI_JOB_ID_RE),
    status: z.literal('queued'),
  }),
})

export const homeAiMealJobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed'])

export const homeAiMealJobSchema = z.object({
  ok: z.literal(true),
  job: z
    .object({
      id: z.string().regex(HOME_AI_JOB_ID_RE),
      status: homeAiMealJobStatusSchema,
      elapsed_ms: z.number().nonnegative().optional(),
      image_available: z.boolean().optional(),
      candidate: z.unknown().optional(),
      error: z
        .object({
          code: z.string().min(1),
          message: z.string().optional(),
        })
        .optional(),
    })
    .superRefine((job, ctx) => {
      if (job.status === 'completed' && job.candidate == null) {
        ctx.addIssue({ code: 'custom', message: 'Completed job is missing a candidate' })
      }
      if (job.status === 'failed' && job.error == null) {
        ctx.addIssue({ code: 'custom', message: 'Failed job is missing an error' })
      }
    }),
})

export function nutritionMealJobFingerprint(jobId: string): string {
  return `${NUTRITION_MEAL_PIPELINE}-job:${jobId}`
}

export function roundVisualGrams(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return null
  }
  if (value >= 100) {
    return Math.round(value / 10) * 10
  }
  if (value >= 20) {
    return Math.round(value / 5) * 5
  }
  return Math.round(value)
}

export function looksLikeHiddenFat(text: string): boolean {
  return /\b(oil|sauce|dressing|butter|mayo|mayonnaise|gravy)\b/i.test(text)
}

function asText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const cleaned = value.replace(/<[^>]*>/g, '').trim()
  return cleaned.length > 0 ? cleaned.slice(0, 200) : null
}

function asConfidence(value: unknown): MealConfidence | null {
  return typeof value === 'string' && (MEAL_CONFIDENCE as readonly string[]).includes(value)
    ? (value as MealConfidence)
    : null
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

function newComponentId(index: number): string {
  return `c${index + 1}`
}

export function sanitizeMealCandidate(raw: unknown, options?: { model?: string | null }): MealPhotoCandidate {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const rawComponents = Array.isArray(source.components) ? source.components : []
  const components: MealComponent[] = []
  for (const [index, item] of rawComponents.entries()) {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    const proposedName = asText(row.proposedName) ?? asText(row.name)
    if (!proposedName) {
      continue
    }
    const portionIn = row.portionEstimate && typeof row.portionEstimate === 'object' ? (row.portionEstimate as Record<string, unknown>) : {}
    const grams = roundVisualGrams(asNumber(portionIn.gramsEstimate ?? portionIn.grams))
    components.push({
      id: asText(row.id) ?? newComponentId(index),
      proposedName,
      preparation: asText(row.preparation),
      portionEstimate: {
        description: asText(portionIn.description) ?? (grams != null ? `~${grams} g` : null),
        gramsEstimate: grams,
        confidence: asConfidence(portionIn.confidence),
      },
      visualConfidence: asConfidence(row.visualConfidence),
      catalogHints: Array.isArray(row.catalogHints)
        ? row.catalogHints.map(asText).filter((hint): hint is string => Boolean(hint))
        : [],
      ambiguities: Array.isArray(row.ambiguities)
        ? row.ambiguities.map(asText).filter((hint): hint is string => Boolean(hint))
        : [],
    })
  }
  const unaccounted = Array.isArray(source.possibleUnaccountedItems)
    ? source.possibleUnaccountedItems.map(asText).filter((item): item is string => Boolean(item))
    : []
  const notes = Array.isArray(source.notes)
    ? source.notes.map(asText).filter((item): item is string => Boolean(item))
    : []
  if (typeof source.calories === 'number' || typeof source.protein === 'number') {
    notes.push('Ignored model-generated nutrition totals.')
  }
  return mealPhotoCandidateSchema.parse({
    schemaVersion: NUTRITION_MEAL_SCHEMA_VERSION,
    status: components.length === 0 ? 'invalid' : 'review_required',
    pipeline: NUTRITION_MEAL_PIPELINE,
    model: options?.model ?? (typeof source.model === 'string' ? source.model : null),
    components,
    possibleUnaccountedItems: [...new Set(unaccounted)],
    notes: [...new Set(notes)],
  })
}

export function emptyMealCandidate(partial?: Partial<MealPhotoCandidate>): MealPhotoCandidate {
  return mealPhotoCandidateSchema.parse({
    schemaVersion: NUTRITION_MEAL_SCHEMA_VERSION,
    status: 'review_required',
    pipeline: NUTRITION_MEAL_PIPELINE,
    model: null,
    components: [],
    possibleUnaccountedItems: [],
    notes: ['Check the foods and portions before saving.'],
    ...partial,
  })
}

export type MealFoodMatch = {
  food: NutritionFood
  score: number
  reason: 'exact' | 'prefix' | 'recent' | 'staple' | 'contains' | 'recipe'
}

export function matchMealComponent(
  proposedName: string,
  foods: readonly NutritionFood[],
  options?: { recentIds?: readonly string[] },
): MealFoodMatch[] {
  const ranked = rankFoodsForQuery(foods, proposedName, { recentIds: options?.recentIds })
  const needle = proposedName.trim().toLowerCase()
  const recent = new Set(options?.recentIds ?? [])
  const matches: MealFoodMatch[] = []
  for (const food of ranked) {
    const name = food.name.toLowerCase()
    const brand = (food.brand ?? '').toLowerCase()
    if (!name.includes(needle) && !needle.includes(name) && !brand.includes(needle) && needle.length > 0) {
      const tokens = needle.split(/\s+/).filter((token) => token.length > 2)
      if (!tokens.some((token) => name.includes(token))) {
        continue
      }
    }
    let reason: MealFoodMatch['reason'] = 'contains'
    let score = 40
    if (name === needle) {
      reason = 'exact'
      score = 100
    } else if (name.startsWith(needle) || needle.startsWith(name)) {
      reason = 'prefix'
      score = 80
    }
    if (recent.has(food.id)) {
      score += 15
      if (reason === 'contains') {
        reason = 'recent'
      }
    } else if (food.isStaple && score < 90) {
      score += 8
      if (reason === 'contains') {
        reason = 'staple'
      }
    }
    if (food.catalogKind === 'recipe') {
      reason = reason === 'exact' ? 'exact' : 'recipe'
    }
    matches.push({ food, score, reason })
  }
  return matches.sort((left, right) => right.score - left.score || left.food.name.localeCompare(right.food.name)).slice(0, 8)
}

export function recipeCandidatesForComponents(
  recipes: readonly NutritionFood[],
  componentNames: readonly string[],
): NutritionFood[] {
  if (componentNames.length < 2) {
    return []
  }
  const tokens = componentNames
    .flatMap((name) => name.toLowerCase().split(/[^a-z0-9]+/))
    .filter((token) => token.length > 2)
  return recipes.filter((recipe) => {
    const name = recipe.name.toLowerCase()
    const hits = new Set(tokens.filter((token) => name.includes(token)))
    return hits.size >= 2
  })
}

export type MealReviewComponent = {
  id: string
  included: boolean
  proposedName: string
  foodId: string | null
  quantity: number | null
  unit: string
  grams: number | null
  portionDescription: string | null
  portionConfidence: MealConfidence | null
  identificationUncertain: boolean
  estimated: boolean
  collapsedByRecipe: boolean
}

export type MealReviewDraft = {
  recipeFoodId: string | null
  components: MealReviewComponent[]
  resolvedFlags: string[]
  meal: 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'other' | ''
}

export function draftFromMealCandidate(
  candidate: MealPhotoCandidate,
  foods: readonly NutritionFood[],
  options?: { recents?: readonly NutritionFood[]; recipes?: readonly NutritionFood[] },
): MealReviewDraft {
  const recentIds = (options?.recents ?? []).map((food) => food.id)
  const components = candidate.components.map((component) => {
    const matches = matchMealComponent(component.proposedName, foods, { recentIds })
    const top = matches[0]
    const strong = top && (top.reason === 'exact' || top.reason === 'prefix') && top.score >= 80
    const grams = component.portionEstimate.gramsEstimate
    return {
      id: component.id,
      included: true,
      proposedName: component.proposedName,
      foodId: strong ? top.food.id : null,
      quantity: grams != null && strong && top.food.servingGrams ? grams / top.food.servingGrams : grams != null ? null : 1,
      unit: grams != null ? 'g' : (strong ? top.food.servingUnit : 'serving'),
      grams,
      portionDescription: component.portionEstimate.description,
      portionConfidence: component.portionEstimate.confidence,
      identificationUncertain: !strong || component.visualConfidence === 'low',
      estimated: grams != null,
      collapsedByRecipe: false,
    } satisfies MealReviewComponent
  })
  return {
    recipeFoodId: null,
    components,
    resolvedFlags: [],
    meal: '',
  }
}

export function applyRecipeSelection(
  draft: MealReviewDraft,
  recipe: NutritionFood | null,
  candidateNames: readonly string[],
): MealReviewDraft {
  if (!recipe) {
    return {
      ...draft,
      recipeFoodId: null,
      components: draft.components.map((component) => ({ ...component, collapsedByRecipe: false })),
    }
  }
  const recipeName = recipe.name.toLowerCase()
  return {
    ...draft,
    recipeFoodId: recipe.id,
    components: draft.components.map((component) => {
      const tokens = component.proposedName.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length > 2)
      const overlaps = tokens.some((token) => recipeName.includes(token)) || candidateNames.some((name) => recipeName.includes(name.toLowerCase()) && component.proposedName.toLowerCase().includes(name.toLowerCase().split(/\s+/)[0] ?? ''))
      return overlaps
        ? { ...component, included: false, collapsedByRecipe: true }
        : { ...component, collapsedByRecipe: false }
    }),
  }
}

export function mealComponentSnapshot(
  food: NutritionFood,
  component: Pick<MealReviewComponent, 'quantity' | 'grams'>,
): NutrientAmount & { grams: number | null; multiplier: number } {
  const quantity = component.quantity != null && component.quantity > 0 ? component.quantity : 1
  return snapshotFromDefinition(
    {
      calories: food.calories,
      protein: food.protein,
      carbs: food.carbs,
      fat: food.fat,
      fiber: food.fiber,
      servingGrams: food.servingGrams,
    },
    { quantity, grams: component.grams },
  )
}

export function mealReviewTotals(
  components: readonly MealReviewComponent[],
  foodsById: ReadonlyMap<string, NutritionFood>,
  recipe?: NutritionFood | null,
): NutrientAmount {
  const parts: NutrientAmount[] = []
  if (recipe) {
    parts.push(
      snapshotFromDefinition(
        {
          calories: recipe.calories,
          protein: recipe.protein,
          carbs: recipe.carbs,
          fat: recipe.fat,
          fiber: recipe.fiber,
          servingGrams: recipe.servingGrams,
        },
        { quantity: 1 },
      ),
    )
  }
  for (const component of components) {
    if (!component.included || component.collapsedByRecipe || !component.foodId) {
      continue
    }
    const food = foodsById.get(component.foodId)
    if (!food) {
      continue
    }
    parts.push(mealComponentSnapshot(food, component))
  }
  return parts.reduce(
    (sum, part) => ({
      calories: sum.calories + part.calories,
      protein: sum.protein == null || part.protein == null ? null : sum.protein + part.protein,
      carbs: sum.carbs == null || part.carbs == null ? null : sum.carbs + part.carbs,
      fat: sum.fat == null || part.fat == null ? null : sum.fat + part.fat,
      fiber: sum.fiber == null || part.fiber == null ? null : sum.fiber + part.fiber,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 } satisfies NutrientAmount,
  )
}

export function validateMealReview(draft: MealReviewDraft): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  const included = draft.components.filter((component) => component.included && !component.collapsedByRecipe)
  if (!draft.recipeFoodId && included.length === 0) {
    errors.push({ path: 'components', message: 'Include at least one food, or use a saved recipe.' })
  }
  for (const component of included) {
    if (!component.foodId) {
      errors.push({ path: `component:${component.id}`, message: `Choose a Health food for ${component.proposedName}.` })
    }
    if (component.quantity == null || !(component.quantity > 0)) {
      if (component.grams == null || !(component.grams > 0)) {
        errors.push({ path: `component:${component.id}:quantity`, message: `Enter a portion for ${component.proposedName}.` })
      }
    }
  }
  return errors
}

export const MEAL_CONNECTIVITY_CODES = [
  'HOME_AI_UNAVAILABLE',
  'HOME_AI_AUTH',
  'HOME_AI_ROUTE_MISSING',
  'HOME_AI_MODEL_UNAVAILABLE',
  'TIMED_OUT',
] as const

export function isMealConnectivityCode(code: string): boolean {
  return (MEAL_CONNECTIVITY_CODES as readonly string[]).includes(code)
}

export function isMealRetryCode(code: string): boolean {
  return isMealConnectivityCode(code) || code.startsWith('GEMINI_')
}

function mealErrorCode(body: unknown): string {
  if (!body || typeof body !== 'object') {
    return ''
  }
  if ('error' in body && body.error && typeof body.error === 'object' && 'code' in body.error) {
    return String((body.error as { code?: unknown }).code ?? '')
  }
  if ('code' in body) {
    return String((body as { code?: unknown }).code ?? '')
  }
  return ''
}

function bodyRaw(body: unknown): string {
  if (!body || typeof body !== 'object' || !('raw' in body)) {
    return ''
  }
  return String((body as { raw?: unknown }).raw ?? '')
}

export function classifyMealTransportFailure(input: {
  status?: number
  body?: unknown
  timedOut?: boolean
}): string {
  if (input.timedOut) {
    return 'TIMED_OUT'
  }
  const status = input.status ?? 0
  const code = mealErrorCode(input.body)
  const raw = bodyRaw(input.body)
  if (status === 401 || code === 'UNAUTHORIZED' || code === 'FORBIDDEN' || code === 'AUTH') {
    return 'HOME_AI_AUTH'
  }
  if (status === 404 && (code === 'JOB_NOT_FOUND' || code === 'INVALID_JOB_ID')) {
    return code
  }
  if (status === 404 || /cannot (get|post|put|delete)/i.test(raw)) {
    return 'HOME_AI_ROUTE_MISSING'
  }
  if (/model/i.test(code)) {
    return 'HOME_AI_MODEL_UNAVAILABLE'
  }
  if (status === 403 || status === 0 || status >= 500) {
    return 'HOME_AI_UNAVAILABLE'
  }
  return code || 'PIPELINE_FAILED'
}

export function mealFailureMessage(code: string): string {
  switch (code) {
    case 'HOME_AI_UNAVAILABLE':
    case 'HOME_AI_AUTH':
    case 'HOME_AI_ROUTE_MISSING':
    case 'HOME_AI_MODEL_UNAVAILABLE':
    case 'TIMED_OUT':
    case 'GEMINI_NOT_CONFIGURED':
    case 'GEMINI_AUTH':
    case 'GEMINI_QUOTA':
    case 'GEMINI_UNAVAILABLE':
    case 'GEMINI_TIMEOUT':
      return 'Meal analysis is temporarily unavailable.'
    case 'GEMINI_SCHEMA':
    case 'GEMINI_SEMANTIC':
      return "We couldn't confidently interpret this meal."
    case 'CONTEXT_TOO_LONG':
      return 'Keep the note under 2000 characters.'
    case 'UNSUPPORTED_IMAGE':
      return 'Use a JPEG or PNG meal photo.'
    case 'UPLOAD_TOO_LARGE':
      return 'That photo is too large. Try another photo of the meal.'
    case 'MISSING_IMAGE':
      return 'Choose a JPEG or PNG of the meal.'
    case 'INVALID_IMAGE':
      return "Couldn't read that photo. Try another JPEG or PNG."
    case 'UNREADABLE_MEAL':
      return 'That photo did not look like a usable meal.'
    case 'JOB_NOT_FOUND':
      return 'That meal capture was not found.'
    case 'INVALID_JOB_ID':
      return 'That meal capture id is invalid.'
    case 'PIPELINE_FAILED':
      return 'Meal photo analysis failed. Try another photo or build the meal manually.'
    default:
      return 'Meal photo analysis failed. Try another photo or build the meal manually.'
  }
}

export const commitNutritionMealRequestSchema = z.object({
  jobId: z.string().regex(HOME_AI_JOB_ID_RE).optional(),
  descriptionText: z.string().trim().min(1).max(500).optional(),
  logDate: z.string(),
  timezone: z.string().optional(),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']).nullable().optional(),
  recipeFoodId: z.uuid().nullable().optional(),
  recipeQuantity: z.number().optional(),
  components: z.array(
    z.object({
      id: z.string().min(1),
      included: z.boolean(),
      foodId: z.uuid().nullable(),
      proposedName: z.string(),
      quantity: z.number().nullable(),
      unit: z.string(),
      grams: z.number().nullable(),
    }),
  ),
  resolvedFlags: z.array(z.string()).optional(),
})
export type CommitNutritionMealRequest = z.input<typeof commitNutritionMealRequestSchema>

export const MEAL_PORTION_SCALES = [0.75, 0.9, 1, 1.1, 1.25] as const
export type MealPortionScale = (typeof MEAL_PORTION_SCALES)[number]

export type MealEstimateNutrients = {
  calories: number
  proteinGrams: number
  carbsGrams: number
  fatGrams: number
  fiberGrams: number | null
}

export const mealEstimateCandidateSchema = z.object({
  schemaVersion: z.literal(NUTRITION_MEAL_SCHEMA_VERSION),
  status: z.enum(MEAL_CANDIDATE_STATUSES),
  pipeline: z.string().optional(),
  model: z.string().nullable().optional(),
  name: z.string().min(1),
  foodsSeen: z.array(z.string()),
  assumptions: z.array(z.string()),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  fiberGrams: z.number().nullable(),
})
export type MealEstimateCandidate = z.infer<typeof mealEstimateCandidateSchema>

export const commitNutritionMealEstimateRequestSchema = z.object({
  jobId: z.string().regex(HOME_AI_JOB_ID_RE).optional(),
  logDate: z.string(),
  timezone: z.string().optional(),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']).nullable().optional(),
  name: z.string().trim().min(1).max(120),
  calories: z.number().min(0),
  proteinGrams: z.number().min(0),
  carbsGrams: z.number().min(0),
  fatGrams: z.number().min(0),
  fiberGrams: z.number().min(0).nullable(),
  portionScale: z.number().optional(),
})
export type CommitNutritionMealEstimateRequest = z.input<typeof commitNutritionMealEstimateRequestSchema>

export type NutritionMealJobResponse = {
  job: {
    id: string
    status: 'queued' | 'processing' | 'completed' | 'failed'
    elapsedMs?: number | null
    imageAvailable?: boolean
  }
  userContext?: string | null
  candidate: MealEstimateCandidate | null
  foods: NutritionFood[]
  matches: Record<string, Array<{ foodId: string; name: string; brand: string | null; catalogKind: string; score: number; reason: string }>>
  recipeCandidates: Array<{ id: string; name: string; catalogKind: string }>
  hiddenFatFoods: Array<{ id: string; name: string; servingUnit: string }>
  failure: { code: string; message: string } | null
}

export function roundMealCalories(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0
  }
  return Math.round(value / 5) * 5
}

export function roundMealGrams(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return null
  }
  return Math.round(value)
}

export function mealEstimateNutrients(input: MealEstimateNutrients): MealEstimateNutrients {
  return {
    calories: roundMealCalories(input.calories),
    proteinGrams: roundMealGrams(input.proteinGrams) ?? 0,
    carbsGrams: roundMealGrams(input.carbsGrams) ?? 0,
    fatGrams: roundMealGrams(input.fatGrams) ?? 0,
    fiberGrams: roundMealGrams(input.fiberGrams),
  }
}

export function scaleMealEstimate(baseline: MealEstimateNutrients, scale: number): MealEstimateNutrients {
  const factor = Number.isFinite(scale) && scale > 0 ? scale : 1
  return mealEstimateNutrients({
    calories: baseline.calories * factor,
    proteinGrams: baseline.proteinGrams * factor,
    carbsGrams: baseline.carbsGrams * factor,
    fatGrams: baseline.fatGrams * factor,
    fiberGrams: baseline.fiberGrams == null ? null : baseline.fiberGrams * factor,
  })
}

export function mealEstimateUserAdjusted(baseline: MealEstimateNutrients, reviewed: MealEstimateNutrients): boolean {
  return (
    baseline.calories !== reviewed.calories ||
    baseline.proteinGrams !== reviewed.proteinGrams ||
    baseline.carbsGrams !== reviewed.carbsGrams ||
    baseline.fatGrams !== reviewed.fatGrams ||
    baseline.fiberGrams !== reviewed.fiberGrams
  )
}

export function emptyMealEstimate(partial?: Partial<MealEstimateCandidate>): MealEstimateCandidate {
  return mealEstimateCandidateSchema.parse({
    schemaVersion: NUTRITION_MEAL_SCHEMA_VERSION,
    status: 'review_required',
    pipeline: NUTRITION_MEAL_PIPELINE,
    model: null,
    name: 'Meal',
    foodsSeen: [],
    assumptions: [],
    calories: 0,
    proteinGrams: 0,
    carbsGrams: 0,
    fatGrams: 0,
    fiberGrams: null,
    ...partial,
  })
}

export function sanitizeMealEstimate(raw: unknown, options?: { model?: string | null }): MealEstimateCandidate {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const foodsSeen = Array.isArray(source.foodsSeen)
    ? source.foodsSeen.map(asText).filter((item): item is string => Boolean(item))
    : []
  const assumptions = Array.isArray(source.assumptions)
    ? source.assumptions.map(asText).filter((item): item is string => Boolean(item))
    : []
  const nutrients = mealEstimateNutrients({
    calories: asNumber(source.calories) ?? 0,
    proteinGrams: asNumber(source.proteinGrams ?? source.protein) ?? 0,
    carbsGrams: asNumber(source.carbsGrams ?? source.carbs) ?? 0,
    fatGrams: asNumber(source.fatGrams ?? source.fat) ?? 0,
    fiberGrams: asNumber(source.fiberGrams ?? source.fiber),
  })
  const name = asText(typeof source.name === 'string' ? source.name : null) ?? foodsSeen[0] ?? 'Meal'
  return mealEstimateCandidateSchema.parse({
    schemaVersion: NUTRITION_MEAL_SCHEMA_VERSION,
    status: nutrients.calories <= 0 && foodsSeen.length === 0 ? 'invalid' : 'review_required',
    pipeline: NUTRITION_MEAL_PIPELINE,
    model: options?.model ?? (typeof source.model === 'string' ? source.model : null),
    name,
    foodsSeen: [...new Set(foodsSeen)],
    assumptions: [...new Set(assumptions)],
    ...nutrients,
  })
}

export function validateMealEstimateReview(input: { name: string; calories: number }): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  if (!input.name.trim()) {
    errors.push({ path: 'name', message: 'Add a meal name.' })
  }
  if (!Number.isFinite(input.calories) || input.calories < 0) {
    errors.push({ path: 'calories', message: 'Calories must be a number.' })
  }
  return errors
}

export { isHomeAiJobId, HOME_AI_JOB_ID_RE }
