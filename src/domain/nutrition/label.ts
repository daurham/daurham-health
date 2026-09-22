import { z } from 'zod'
import { HOME_AI_JOB_ID_RE, isHomeAiJobId } from '../training-transcription.js'
import type { ReviewFieldError } from '../paper-load.js'
import { NUTRITION_CONFIG } from './config.js'
import { normalizeBarcode } from './barcode.js'
import type { NutritionFood } from './types.js'

export const NUTRITION_LABEL_SCHEMA_VERSION = '1.0'
export const NUTRITION_LABEL_PIPELINE = 'nutrition-label-v1'
export const NUTRITION_LABEL_SOURCE_KEY = 'nutrition_label'
export const NUTRITION_LABEL_ENTITY = 'nutrition_entry'
export const NUTRITION_LABEL_CAPTURE_KIND = 'nutrition_label'

export const LABEL_BASES = ['per_serving', 'per_100g', 'per_container', 'unknown'] as const
export type LabelBasis = (typeof LABEL_BASES)[number]

export const EXTRACTED_FIELD_STATUSES = ['ok', 'missing', 'uncertain'] as const
export type ExtractedFieldStatus = (typeof EXTRACTED_FIELD_STATUSES)[number]

export type ExtractedField<T> = {
  value: T | null
  status: ExtractedFieldStatus
}

export const LABEL_CANDIDATE_STATUSES = ['candidate', 'review_required', 'invalid'] as const
export type LabelCandidateStatus = (typeof LABEL_CANDIDATE_STATUSES)[number]

const extractedString = z.object({
  value: z.string().nullable(),
  status: z.enum(EXTRACTED_FIELD_STATUSES),
})

const extractedNumber = z.object({
  value: z.number().nullable(),
  status: z.enum(EXTRACTED_FIELD_STATUSES),
})

const extractedBasis = z.object({
  value: z.enum(LABEL_BASES).nullable(),
  status: z.enum(EXTRACTED_FIELD_STATUSES),
})

export const nutritionLabelFieldsSchema = z.object({
  productName: extractedString,
  brand: extractedString,
  servingQuantity: extractedNumber,
  servingUnit: extractedString,
  servingGrams: extractedNumber,
  servingsPerContainer: extractedNumber,
  calories: extractedNumber,
  proteinGrams: extractedNumber,
  carbsGrams: extractedNumber,
  fatGrams: extractedNumber,
  fiberGrams: extractedNumber,
  basis: extractedBasis,
  barcode: extractedString,
})
export type NutritionLabelFields = z.infer<typeof nutritionLabelFieldsSchema>

export const nutritionLabelCandidateSchema = z.object({
  schemaVersion: z.literal(NUTRITION_LABEL_SCHEMA_VERSION),
  status: z.enum(LABEL_CANDIDATE_STATUSES),
  pipeline: z.string().optional(),
  model: z.string().nullable().optional(),
  fields: nutritionLabelFieldsSchema,
  ambiguities: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
})
export type NutritionLabelCandidate = z.infer<typeof nutritionLabelCandidateSchema>

export const homeAiLabelCreatedJobSchema = z.object({
  ok: z.literal(true),
  job: z.object({
    id: z.string().regex(HOME_AI_JOB_ID_RE),
    status: z.literal('queued'),
  }),
})

export const homeAiLabelJobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed'])

export const homeAiLabelJobSchema = z.object({
  ok: z.literal(true),
  job: z
    .object({
      id: z.string().regex(HOME_AI_JOB_ID_RE),
      status: homeAiLabelJobStatusSchema,
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

export function nutritionLabelJobFingerprint(jobId: string): string {
  return `${NUTRITION_LABEL_PIPELINE}-job:${jobId}`
}

export function missingField<T = never>(): ExtractedField<T> {
  return { value: null, status: 'missing' }
}

export function okField<T>(value: T): ExtractedField<T> {
  return { value, status: 'ok' }
}

export function uncertainField<T>(value: T | null): ExtractedField<T> {
  return { value, status: 'uncertain' }
}

export function emptyLabelCandidate(partial?: Partial<NutritionLabelCandidate>): NutritionLabelCandidate {
  return nutritionLabelCandidateSchema.parse({
    schemaVersion: NUTRITION_LABEL_SCHEMA_VERSION,
    status: 'review_required',
    pipeline: NUTRITION_LABEL_PIPELINE,
    model: null,
    fields: {
      productName: missingField(),
      brand: missingField(),
      servingQuantity: missingField(),
      servingUnit: missingField(),
      servingGrams: missingField(),
      servingsPerContainer: missingField(),
      calories: missingField(),
      proteinGrams: missingField(),
      carbsGrams: missingField(),
      fatGrams: missingField(),
      fiberGrams: missingField(),
      basis: missingField(),
      barcode: missingField(),
    },
    ambiguities: [],
    warnings: [],
    ...partial,
  })
}

const CALORIES_MAX = 5000
const MACRO_MAX = 500
const SERVING_GRAMS_MAX = 5000
const SERVING_QTY_MAX = 100
const SERVINGS_CONTAINER_MAX = 200

export function sanitizeLabelCandidate(raw: unknown): NutritionLabelCandidate {
  const parsed = nutritionLabelCandidateSchema.safeParse(normalizeRawCandidate(raw))
  if (!parsed.success) {
    throw new Error('Invalid nutrition label candidate')
  }
  return validateAndFlagCandidate(parsed.data)
}

function normalizeRawCandidate(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return raw
  }
  const record = raw as Record<string, unknown>
  return {
    schemaVersion: record.schemaVersion ?? record.schema_version ?? NUTRITION_LABEL_SCHEMA_VERSION,
    status: record.status ?? 'review_required',
    pipeline: record.pipeline ?? NUTRITION_LABEL_PIPELINE,
    model: record.model ?? null,
    fields: record.fields,
    ambiguities: record.ambiguities ?? [],
    warnings: record.warnings ?? [],
  }
}

export function validateAndFlagCandidate(candidate: NutritionLabelCandidate): NutritionLabelCandidate {
  const warnings = [...candidate.warnings]
  const ambiguities = [...candidate.ambiguities]
  const fields = { ...candidate.fields }

  fields.calories = clampNumericField(fields.calories, 0, CALORIES_MAX, 'calories', warnings, ambiguities)
  fields.proteinGrams = clampNumericField(fields.proteinGrams, 0, MACRO_MAX, 'protein', warnings, ambiguities)
  fields.carbsGrams = clampNumericField(fields.carbsGrams, 0, MACRO_MAX, 'carbs', warnings, ambiguities)
  fields.fatGrams = clampNumericField(fields.fatGrams, 0, MACRO_MAX, 'fat', warnings, ambiguities)
  fields.fiberGrams = clampNumericField(fields.fiberGrams, 0, MACRO_MAX, 'fiber', warnings, ambiguities)
  fields.servingGrams = clampNumericField(fields.servingGrams, 0, SERVING_GRAMS_MAX, 'serving grams', warnings, ambiguities, true)
  fields.servingQuantity = clampNumericField(fields.servingQuantity, 0, SERVING_QTY_MAX, 'serving quantity', warnings, ambiguities, true)
  fields.servingsPerContainer = clampNumericField(
    fields.servingsPerContainer,
    0,
    SERVINGS_CONTAINER_MAX,
    'servings per container',
    warnings,
    ambiguities,
    true,
  )
  fields.productName = clipStringField(fields.productName, NUTRITION_CONFIG.foodNameMax)
  fields.brand = clipStringField(fields.brand, NUTRITION_CONFIG.brandMax)
  fields.servingUnit = clipStringField(fields.servingUnit, NUTRITION_CONFIG.servingUnitMax)
  fields.barcode = normalizeBarcodeField(fields.barcode, warnings)

  if (fields.basis.value != null && !(LABEL_BASES as readonly string[]).includes(fields.basis.value)) {
    fields.basis = { value: 'unknown', status: 'uncertain' }
    ambiguities.push('Serving basis was not recognized.')
  }
  if (fields.basis.value == null) {
    fields.basis = { value: 'unknown', status: fields.basis.status === 'ok' ? 'uncertain' : fields.basis.status }
  }

  const energyWarning = macroEnergyWarning(fields)
  if (energyWarning && !warnings.includes(energyWarning)) {
    warnings.push(energyWarning)
  }

  let status: LabelCandidateStatus = candidate.status
  if (fields.calories.value == null && fields.productName.value == null) {
    status = 'invalid'
  } else if (status === 'candidate') {
    status = 'review_required'
  }

  return {
    ...candidate,
    schemaVersion: NUTRITION_LABEL_SCHEMA_VERSION,
    pipeline: candidate.pipeline ?? NUTRITION_LABEL_PIPELINE,
    status,
    fields,
    warnings: uniqueStrings(warnings),
    ambiguities: uniqueStrings(ambiguities),
  }
}

function clampNumericField(
  field: ExtractedField<number>,
  min: number,
  max: number,
  label: string,
  warnings: string[],
  ambiguities: string[],
  exclusiveMin = false,
): ExtractedField<number> {
  if (field.value == null) {
    return { value: null, status: field.status === 'ok' ? 'missing' : field.status }
  }
  if (!Number.isFinite(field.value)) {
    ambiguities.push(`${label} was not a usable number.`)
    return { value: null, status: 'uncertain' }
  }
  if (exclusiveMin ? !(field.value > min) : field.value < min) {
    warnings.push(`${label} was out of range and left for review.`)
    return { value: field.value, status: 'uncertain' }
  }
  if (field.value > max) {
    warnings.push(`${label} was out of range and left for review.`)
    return { value: field.value, status: 'uncertain' }
  }
  return field
}

function clipStringField(field: ExtractedField<string>, max: number): ExtractedField<string> {
  if (field.value == null) {
    return { value: null, status: field.status === 'ok' ? 'missing' : field.status }
  }
  const cleaned = field.value.replace(/<[^>]*>/g, '').trim()
  if (cleaned.length === 0) {
    return { value: null, status: 'missing' }
  }
  return { value: cleaned.slice(0, max), status: field.status }
}

function normalizeBarcodeField(field: ExtractedField<string>, warnings: string[]): ExtractedField<string> {
  if (field.value == null || field.value.trim().length === 0) {
    return { value: null, status: field.status === 'ok' ? 'missing' : field.status }
  }
  const parsed = normalizeBarcode(field.value)
  if (!parsed) {
    warnings.push('A barcode was visible but was not a valid UPC/EAN.')
    return { value: field.value.trim(), status: 'uncertain' }
  }
  return { value: parsed.normalized, status: field.status === 'missing' ? 'ok' : field.status }
}

export function macroEnergyWarning(fields: NutritionLabelFields): string | null {
  const calories = fields.calories.value
  const protein = fields.proteinGrams.value
  const carbs = fields.carbsGrams.value
  const fat = fields.fatGrams.value
  if (calories == null || protein == null || carbs == null || fat == null) {
    return null
  }
  const implied = protein * 4 + carbs * 4 + fat * 9
  const delta = Math.abs(implied - calories)
  if (delta > Math.max(50, calories * 0.4)) {
    return 'Calories may not match listed macros.'
  }
  return null
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((item) => item.trim().length > 0))]
}

export type LabelReviewDraft = {
  productName: string
  brand: string
  servingQuantity: number | null
  servingUnit: string
  servingGrams: number | null
  servingsPerContainer: number | null
  calories: number | null
  proteinGrams: number | null
  carbsGrams: number | null
  fatGrams: number | null
  fiberGrams: number | null
  basis: LabelBasis | ''
  barcode: string
  logQuantity: number
}

export function draftFromCandidate(candidate: NutritionLabelCandidate): LabelReviewDraft {
  const fields = candidate.fields
  return {
    productName: fields.productName.value ?? '',
    brand: fields.brand.value ?? '',
    servingQuantity: fields.servingQuantity.value,
    servingUnit: fields.servingUnit.value ?? (fields.basis.value === 'per_100g' ? '100 g' : 'serving'),
    servingGrams: fields.servingGrams.value,
    servingsPerContainer: fields.servingsPerContainer.value,
    calories: fields.calories.value,
    proteinGrams: fields.proteinGrams.value,
    carbsGrams: fields.carbsGrams.value,
    fatGrams: fields.fatGrams.value,
    fiberGrams: fields.fiberGrams.value,
    basis: fields.basis.value ?? 'unknown',
    barcode: fields.barcode.value ?? '',
    logQuantity: 1,
  }
}

export function planLabelCommitFood(input: {
  existingAction: 'create' | 'log_existing' | 'update_and_log'
  existingFoodId?: string | null
  matchingFoodId?: string | null
}):
  | { type: 'create' }
  | { type: 'log_existing'; foodId: string }
  | { type: 'update_and_log'; foodId: string }
  | { type: 'error'; status: 400 | 409; message: string } {
  if (input.existingAction === 'log_existing') {
    if (!input.existingFoodId) {
      return { type: 'error', status: 400, message: 'Choose an existing food to log.' }
    }
    return { type: 'log_existing', foodId: input.existingFoodId }
  }
  if (input.existingAction === 'update_and_log') {
    if (!input.existingFoodId) {
      return { type: 'error', status: 400, message: 'Choose an existing food to update.' }
    }
    return { type: 'update_and_log', foodId: input.existingFoodId }
  }
  if (input.matchingFoodId) {
    return {
      type: 'error',
      status: 409,
      message: 'Existing Health food found. Log using the existing food or update it from the label.',
    }
  }
  return { type: 'create' }
}

export function validateLabelReview(draft: LabelReviewDraft): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  if (draft.productName.trim().length === 0) {
    errors.push({ path: 'productName', message: 'Name is required.' })
  }
  if (draft.servingUnit.trim().length === 0) {
    errors.push({ path: 'servingUnit', message: 'Serving size is required.' })
  }
  if (draft.servingQuantity == null || !(draft.servingQuantity > 0)) {
    errors.push({ path: 'servingQuantity', message: 'Serving quantity must be greater than 0.' })
  }
  if (draft.servingGrams != null && !(draft.servingGrams > 0)) {
    errors.push({ path: 'servingGrams', message: 'Serving weight must be greater than 0.' })
  }
  if (draft.calories == null || !Number.isFinite(draft.calories) || draft.calories < 0) {
    errors.push({ path: 'calories', message: 'Calories required.' })
  }
  if (!draft.basis || draft.basis === 'unknown' || !(LABEL_BASES as readonly string[]).includes(draft.basis)) {
    errors.push({ path: 'basis', message: 'Choose what the nutrition numbers refer to.' })
  }
  if (draft.barcode.trim().length > 0 && !normalizeBarcode(draft.barcode)) {
    errors.push({ path: 'barcode', message: 'Enter a valid barcode.' })
  }
  if (!(draft.logQuantity > 0)) {
    errors.push({ path: 'logQuantity', message: 'Quantity must be greater than 0.' })
  }
  return errors
}

export function isLabelRetryCode(code: string): boolean {
  return code === 'HOME_AI_UNAVAILABLE' || code === 'TIMED_OUT' || code.startsWith('GEMINI_') || code.startsWith('HOME_AI_')
}

export function labelFailureMessage(code: string): string {
  switch (code) {
    case 'HOME_AI_UNAVAILABLE':
      return 'Home AI is temporarily unavailable.'
    case 'GEMINI_NOT_CONFIGURED':
    case 'GEMINI_AUTH':
    case 'GEMINI_QUOTA':
    case 'GEMINI_UNAVAILABLE':
    case 'GEMINI_TIMEOUT':
      return 'Label analysis is temporarily unavailable.'
    case 'GEMINI_SCHEMA':
    case 'GEMINI_SEMANTIC':
      return "We couldn't confidently read this label."
    case 'CONTEXT_TOO_LONG':
      return 'Keep the note under 2000 characters.'
    case 'UNSUPPORTED_IMAGE':
      return 'Use a JPEG or PNG nutrition label photo.'
    case 'UPLOAD_TOO_LARGE':
      return 'That photo is too large. Try another photo of the label.'
    case 'MISSING_IMAGE':
      return 'Choose a JPEG or PNG of the Nutrition Facts label.'
    case 'INVALID_IMAGE':
      return "Couldn't read that photo. Try another JPEG or PNG."
    case 'UNREADABLE_LABEL':
      return 'That photo did not look like a readable Nutrition Facts label.'
    case 'TIMED_OUT':
      return 'Label analysis timed out. Try again or enter the values manually.'
    case 'JOB_NOT_FOUND':
      return 'That label capture was not found.'
    case 'INVALID_JOB_ID':
      return 'That label capture id is invalid.'
    case 'PIPELINE_FAILED':
      return 'Label analysis failed. Try another photo or enter the values manually.'
    default:
      return 'Label analysis failed. Try another photo or enter the values manually.'
  }
}

export const pendingNutritionCaptureSchema = z.object({
  id: z.string().regex(HOME_AI_JOB_ID_RE),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  captureKind: z.enum(['nutrition_label', 'meal_photo']).default('nutrition_label'),
  filename: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PendingNutritionCapture = z.infer<typeof pendingNutritionCaptureSchema>

export const nutritionLabelJobListResponseSchema = z.object({
  jobs: z.array(pendingNutritionCaptureSchema),
})

export const nutritionLabelComparisonSchema = z.object({
  existingFood: z.custom<NutritionFood>().nullable(),
  provider: z
    .object({
      name: z.string().nullable(),
      calories: z.number().nullable(),
      protein: z.number().nullable(),
      carbs: z.number().nullable(),
      fat: z.number().nullable(),
      fiber: z.number().nullable(),
      source: z.string(),
    })
    .nullable(),
})
export type NutritionLabelComparison = z.infer<typeof nutritionLabelComparisonSchema>

export const nutritionLabelJobResponseSchema = z.object({
  job: z.object({
    id: z.string().regex(HOME_AI_JOB_ID_RE),
    status: homeAiLabelJobStatusSchema,
    elapsedMs: z.number().nullable(),
    imageAvailable: z.boolean(),
  }),
  candidate: nutritionLabelCandidateSchema.nullable(),
  comparison: nutritionLabelComparisonSchema.nullable(),
  userContext: z.string().nullable().optional(),
  failure: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .nullable(),
})
export type NutritionLabelJobResponse = z.infer<typeof nutritionLabelJobResponseSchema>

export const commitNutritionLabelRequestSchema = z.object({
  jobId: z.string().regex(HOME_AI_JOB_ID_RE).optional(),
  existingFoodId: z.uuid().nullable().optional(),
  existingAction: z.enum(['create', 'log_existing', 'update_and_log']).optional().default('create'),
  productName: z.string(),
  brand: z.string().nullable().optional(),
  servingQuantity: z.number(),
  servingUnit: z.string(),
  servingGrams: z.number().nullable().optional(),
  servingsPerContainer: z.number().nullable().optional(),
  calories: z.number(),
  proteinGrams: z.number().nullable().optional(),
  carbsGrams: z.number().nullable().optional(),
  fatGrams: z.number().nullable().optional(),
  fiberGrams: z.number().nullable().optional(),
  basis: z.enum(LABEL_BASES),
  barcode: z.string().nullable().optional(),
  logQuantity: z.number().optional().default(1),
  logDate: z.string(),
  timezone: z.string().optional(),
  catalogKind: z.enum(['packaged', 'custom']).optional(),
})
export type CommitNutritionLabelRequest = z.input<typeof commitNutritionLabelRequestSchema>

export { isHomeAiJobId, HOME_AI_JOB_ID_RE }
