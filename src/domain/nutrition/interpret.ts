import { looksLikeHiddenFat, sanitizeMealEstimate, type MealEstimateCandidate, type MealPhotoCandidate } from './meal.js'
import {
  missingField,
  sanitizeLabelCandidate,
  type ExtractedField,
  type NutritionLabelCandidate,
} from './label.js'
import { dropInterpreterNutrients, type FoodDescriptionCandidate } from './describe.js'

export const NUTRITION_USER_CONTEXT_MAX = 2000
export const GEMINI_NUTRITION_MODEL_DEFAULT = 'gemini-3.5-flash'
export const GEMINI_DESCRIPTION_MODEL_DEFAULT = 'gemini-3.5-flash-lite'
export const GEMINI_MEAL_MODEL_DEFAULT = 'gemini-3.5-flash'
export const GEMINI_LABEL_MODEL_DEFAULT = 'gemini-3.5-flash'
export const GEMINI_DESCRIPTION_TIMEOUT_MS = 10_000
export const GEMINI_MEAL_TIMEOUT_MS = 20_000
export const GEMINI_LABEL_TIMEOUT_MS = 20_000
export const GEMINI_DESCRIPTION_MAX_OUTPUT_TOKENS = 512
export const GEMINI_MEAL_MAX_OUTPUT_TOKENS = 1024
export const GEMINI_LABEL_MAX_OUTPUT_TOKENS = 1024
export const NUTRITION_PROVIDERS = ['gemini', 'home_ai'] as const
export type NutritionProvider = (typeof NUTRITION_PROVIDERS)[number]

export const GEMINI_FAILURE_CODES = [
  'GEMINI_NOT_CONFIGURED',
  'GEMINI_AUTH',
  'GEMINI_QUOTA',
  'GEMINI_UNAVAILABLE',
  'GEMINI_TIMEOUT',
  'GEMINI_SCHEMA',
  'GEMINI_SEMANTIC',
] as const

export const GEMINI_TRANSIENT_CODES = ['GEMINI_UNAVAILABLE', 'GEMINI_TIMEOUT', 'GEMINI_QUOTA'] as const
export const GEMINI_AUTO_RETRY_CODES = ['GEMINI_UNAVAILABLE', 'GEMINI_QUOTA'] as const

export class NutritionInterpretError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'NutritionInterpretError'
    this.code = code
  }
}

export type InterpretationMetadata = {
  provider?: NutritionProvider
  model?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  thinkingTokens?: number | null
  providerRequestId?: string | null
  attempt?: number
  failureCode?: string | null
}

export type MealPhotoInterpretInput = {
  image: Uint8Array
  mimeType: string
  userContext: string | null
}

export type NutritionLabelInterpretInput = MealPhotoInterpretInput

export type FoodDescriptionInterpretInput = {
  text: string
}

export interface NutritionInterpreter {
  interpretMealPhoto(input: MealPhotoInterpretInput): Promise<MealEstimateCandidate>
  interpretFoodDescription(input: FoodDescriptionInterpretInput): Promise<FoodDescriptionCandidate>
  interpretNutritionLabel(input: NutritionLabelInterpretInput): Promise<NutritionLabelCandidate>
}

export type GeminiDescriptionItem = {
  name: string
  amount: number | null
  unit: string
  note: string | null
}

export type GeminiDescriptionResponse = {
  items: GeminiDescriptionItem[]
  ambiguities: string[]
}

export type GeminiMealResponse = {
  name: string
  foodsSeen: string[]
  assumptions: string[]
  calories: number
  proteinGrams: number
  carbsGrams: number
  fatGrams: number
  fiberGrams: number | null
}

export type GeminiLabelResponse = {
  productName: string | null
  brand: string | null
  servingQuantity: number | null
  servingUnit: string | null
  servingGrams: number | null
  servingsPerContainer: number | null
  basis: string | null
  calories: number | null
  proteinGrams: number | null
  carbsGrams: number | null
  fatGrams: number | null
  fiberGrams: number | null
  barcode: string | null
  ambiguities: string[]
}

export const GEMINI_MEAL_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['name', 'foodsSeen', 'calories', 'proteinGrams', 'carbsGrams', 'fatGrams'],
  properties: {
    name: { type: 'string' },
    foodsSeen: { type: 'array', items: { type: 'string' } },
    assumptions: { type: 'array', items: { type: 'string' } },
    calories: { type: 'number' },
    proteinGrams: { type: 'number' },
    carbsGrams: { type: 'number' },
    fatGrams: { type: 'number' },
    fiberGrams: { type: 'number' },
  },
} as const

export const GEMINI_DESCRIPTION_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        required: ['name', 'amount', 'unit'],
        properties: {
          name: { type: 'string' },
          amount: { type: 'number' },
          unit: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    ambiguities: { type: 'array', items: { type: 'string' } },
  },
} as const

export const GEMINI_LABEL_RESPONSE_SCHEMA = {
  type: 'object',
  required: ['calories', 'proteinGrams', 'carbsGrams', 'fatGrams'],
  properties: {
    productName: { type: 'string' },
    brand: { type: 'string' },
    servingQuantity: { type: 'number' },
    servingUnit: { type: 'string' },
    servingGrams: { type: 'number' },
    servingsPerContainer: { type: 'number' },
    calories: { type: 'number' },
    proteinGrams: { type: 'number' },
    carbsGrams: { type: 'number' },
    fatGrams: { type: 'number' },
    fiberGrams: { type: 'number' },
    basis: { type: 'string', enum: ['per_serving', 'per_container', 'per_100g'] },
    barcode: { type: 'string' },
    ambiguities: { type: 'array', items: { type: 'string' } },
  },
} as const

export function isGeminiFailureCode(code: string): boolean {
  return (GEMINI_FAILURE_CODES as readonly string[]).includes(code)
}

export function isGeminiTransientCode(code: string): boolean {
  return (GEMINI_TRANSIENT_CODES as readonly string[]).includes(code)
}

export function isGeminiAutoRetryCode(code: string): boolean {
  return (GEMINI_AUTO_RETRY_CODES as readonly string[]).includes(code)
}

export function normalizeUserContext(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.length > NUTRITION_USER_CONTEXT_MAX) {
    throw new NutritionInterpretError('CONTEXT_TOO_LONG', 'Keep the note under 2000 characters.')
  }
  return trimmed
}

export function parseNutritionProvider(value: unknown): NutritionProvider {
  return value === 'home_ai' ? 'home_ai' : 'gemini'
}

export function mealPhotoPrompt(userContext: string | null): string {
  const instructions = [
    'Identify the visible meal and estimate nutrition for the entire consumed plate.',
    'Output JSON only. Do not wrap the JSON in markdown.',
    'Estimate visible portion sizes, then estimate total calories, protein, carbs, fat, and fiber.',
    'Visual estimates are approximate. Do not pretend they are exact.',
    'Include major assumptions that materially affect the estimate.',
    'Acknowledge hidden oils or sauces when they are uncertain.',
    'Use USER-PROVIDED CONTEXT as known information. It should influence the estimate.',
    'Use this shape: {"name":"Chicken, rice and broccoli","foodsSeen":["chicken thigh","white rice","broccoli"],"assumptions":["chicken appears about 5-6 oz","some cooking oil may be present"],"calories":720,"proteinGrams":48,"carbsGrams":76,"fatGrams":25,"fiberGrams":7}',
    'calories and macros must be JSON numbers for the whole meal. Use null for fiber only when it cannot be estimated.',
  ].join('\n')
  if (!userContext) {
    return instructions
  }
  return `${instructions}\n\nUSER-PROVIDED CONTEXT:\n"${userContext}"`
}

export function foodDescriptionPrompt(text: string): string {
  return [
    'Extract food components and explicit or approximate quantities.',
    'Output JSON only. Do not wrap the JSON in markdown.',
    'Do not calculate nutrition.',
    'Preserve quantities stated by the user.',
    'Preserve uncertainty. Do not invent omitted quantities.',
    'Use this shape: {"items":[{"name":"wagyu beef","amount":0.5,"unit":"lb","note":null}],"ambiguities":[]}',
    'amount must be a JSON number when the user stated a number. Use null when the amount is not a number.',
    'note holds leftover uncertainty, such as an unspecified size.',
    '',
    'Food description:',
    text,
  ].join('\n')
}

export function nutritionLabelPrompt(userContext: string | null): string {
  const instructions = [
    'Extract the visible label values and serving basis.',
    'Output JSON only. Do not wrap the JSON in markdown.',
    'Do not infer missing numeric nutrients.',
    'Use USER-PROVIDED CONTEXT only as supporting evidence.',
    'If user context conflicts with a visible number, flag the conflict and keep the visible number.',
    'Use this shape: {"productName":"Yogurt","brand":null,"servingQuantity":1,"servingUnit":"container","servingGrams":150,"servingsPerContainer":1,"basis":"per_serving","calories":120,"proteinGrams":12,"carbsGrams":15,"fatGrams":2,"fiberGrams":null,"barcode":null,"ambiguities":[]}',
    'basis must be per_serving, per_container, or per_100g when that is visible.',
    'Use JSON null when a value is not visible. Do not invent it.',
  ].join('\n')
  if (!userContext) {
    return instructions
  }
  return `${instructions}\n\nUSER-PROVIDED CONTEXT:\n"${userContext}"`
}

export function descriptionFailureMessage(code: string): string {
  if (code === 'GEMINI_SCHEMA' || code === 'GEMINI_SEMANTIC') {
    return "We couldn't confidently interpret this description."
  }
  if (code === 'CONTEXT_TOO_LONG') {
    return 'Keep the note under 2000 characters.'
  }
  return 'Meal analysis is temporarily unavailable.'
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())
}

function firstString(row: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function parseSafeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

function quantityEvidence(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed || parseSafeNumber(trimmed) != null) {
    return null
  }
  return trimmed
}

function providerItems(source: Record<string, unknown>): unknown[] {
  if (Array.isArray(source.items)) {
    return source.items
  }
  if (Array.isArray(source.components)) {
    return source.components
  }
  return []
}

function hasNutrientTotals(value: unknown): boolean {
  const row = asRecord(value)
  return ['calories', 'protein', 'carbs', 'fat', 'fiber', 'kcal', 'proteinGrams', 'carbsGrams', 'fatGrams'].some(
    (key) => typeof row[key] === 'number',
  )
}

const GRAM_UNITS = new Set(['g', 'gram', 'grams'])

export function normalizeGeminiDescriptionRaw(raw: unknown, original: string): unknown {
  const source = Array.isArray(raw) ? { items: raw } : asRecord(raw)
  const items = providerItems(source)
  return {
    original,
    components: items.map((item) => {
      const row = asRecord(item)
      const amount = firstPresent(row, ['amount', 'quantity'])
      const evidence = quantityEvidence(amount) ?? quantityEvidence(row.amountText)
      const note = firstString(row, ['ambiguity', 'note'])
      return {
        proposedName: firstString(row, ['proposedName', 'name', 'food', 'foodName']),
        quantity: parseSafeNumber(amount),
        unit: firstString(row, ['unit']) ?? 'whole',
        preparation: firstString(row, ['preparation']),
        ambiguity: [note, evidence].filter((value): value is string => Boolean(value)).join('; ') || null,
      }
    }),
  }
}

function firstPresent(row: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined) {
      return row[key]
    }
  }
  return undefined
}

export function normalizeGeminiMealRaw(raw: unknown): unknown {
  const source = Array.isArray(raw) ? { items: raw } : asRecord(raw)
  const items = providerItems(source)
  const unaccounted = [...asStringList(source.possibleUnaccountedItems), ...asStringList(source.possibleExtras)]
  const notes = asStringList(source.ambiguities)
  if (hasNutrientTotals(source) || items.some((item) => hasNutrientTotals(item))) {
    source.calories = typeof source.calories === 'number' ? source.calories : 0
  }
  const nextComponents = items.map((item) => {
    const row = asRecord(item)
    const name = firstString(row, ['proposedName', 'name', 'food', 'foodName'])
    if (row.possibleSauceOrOil === true && name && !unaccounted.includes(name)) {
      unaccounted.push(name)
    }
    const portion = asRecord(row.portionEstimate)
    const unit = firstString(row, ['unit'])
    const amount = parseSafeNumber(firstPresent(row, ['amount', 'quantity', 'gramsEstimate']))
    const gramsFromUnit = unit && GRAM_UNITS.has(unit.toLowerCase()) ? amount : null
    const grams =
      parseSafeNumber(portion.gramsEstimate) ?? parseSafeNumber(row.gramsEstimate) ?? gramsFromUnit
    const amountText = quantityEvidence(firstPresent(row, ['amount', 'quantity', 'amountText']))
    const description =
      firstString(portion, ['description']) ??
      firstString(row, ['portion', 'portionDescription']) ??
      (amount != null && unit ? `${amount} ${unit}` : amountText)
    const itemNotes = [firstString(row, ['note']), amountText].filter((value): value is string => Boolean(value))
    return {
      ...row,
      proposedName: name,
      portionEstimate: {
        description,
        gramsEstimate: grams,
        confidence: typeof portion.confidence === 'string' ? portion.confidence : null,
      },
      ambiguities: [...asStringList(row.ambiguities), ...itemNotes],
    }
  })
  return {
    ...source,
    components: nextComponents,
    possibleUnaccountedItems: [...new Set(unaccounted)],
    notes,
  }
}

export function applyMealUserContext(candidate: MealPhotoCandidate, userContext: string | null): MealPhotoCandidate {
  if (!userContext) {
    return candidate
  }
  const notes = [...candidate.notes]
  if (/\b\d+(?:\.\d+)?\s*(?:calories|kcal)\b/i.test(userContext)) {
    notes.push('A calorie amount in your note was not used. Health calculates calories from matched foods.')
  }
  const context = userContext.toLowerCase()
  const components = candidate.components.map((component) => {
    const name = component.proposedName.toLowerCase()
    const ambiguities = [...component.ambiguities]
    if (/\bcauliflower rice\b/.test(context) && /\brice\b/.test(name) && !name.includes('cauliflower')) {
      ambiguities.push('The image appears to contain white rice, but your note says cauliflower rice.')
    }
    return { ...component, ambiguities }
  })
  const sauce = components
    .filter((component) => looksLikeHiddenFat(component.proposedName) || component.ambiguities.some((item) => looksLikeHiddenFat(item)))
    .map((component) => component.proposedName)
  return {
    ...candidate,
    components,
    notes: [...new Set(notes)],
    possibleUnaccountedItems: [...new Set([...candidate.possibleUnaccountedItems, ...sauce])],
  }
}

export function normalizeGeminiMealEstimateRaw(raw: unknown): unknown {
  const source = asRecord(raw)
  const foods = asStringList(source.foodsSeen)
  if (foods.length === 0 && Array.isArray(source.items)) {
    for (const item of source.items) {
      const name = firstString(asRecord(item), ['name', 'proposedName', 'food', 'foodName'])
      if (name) {
        foods.push(name)
      }
    }
  }
  const assumptions = [...asStringList(source.assumptions), ...asStringList(source.ambiguities)]
  return {
    name: firstString(source, ['name']) ?? foods[0] ?? 'Meal',
    foodsSeen: foods,
    assumptions,
    calories: firstPresent(source, ['calories']),
    proteinGrams: firstPresent(source, ['proteinGrams', 'protein']),
    carbsGrams: firstPresent(source, ['carbsGrams', 'carbs']),
    fatGrams: firstPresent(source, ['fatGrams', 'fat']),
    fiberGrams: firstPresent(source, ['fiberGrams', 'fiber']),
  }
}

export function interpretMealPhotoResponse(text: string, userContext: string | null, model: string | null): MealEstimateCandidate {
  const raw = parseGeminiJson(text)
  let candidate: MealEstimateCandidate
  try {
    candidate = sanitizeMealEstimate(normalizeGeminiMealEstimateRaw(raw), { model })
  } catch {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "We couldn't confidently interpret this meal.")
  }
  if (userContext && /\bcauliflower rice\b/i.test(userContext) && candidate.foodsSeen.some((item) => /\brice\b/i.test(item) && !/cauliflower/i.test(item))) {
    candidate = {
      ...candidate,
      assumptions: [...new Set([...candidate.assumptions, 'The image appears to contain white rice, but your note says cauliflower rice.'])],
    }
  }
  if (candidate.status === 'invalid' || candidate.calories <= 0) {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', "We couldn't confidently interpret this meal.")
  }
  return candidate
}

function asLabelNumber(value: unknown): ExtractedField<number> {
  const parsed = parseSafeNumber(value)
  if (parsed != null) {
    return { value: parsed, status: 'ok' }
  }
  if (value == null) {
    return missingField<number>()
  }
  return extractedNumber(value)
}

function asLabelString(value: unknown): ExtractedField<string> {
  if (typeof value === 'string') {
    const text = value.trim()
    return text ? { value: text, status: 'ok' } : missingField<string>()
  }
  if (value == null) {
    return missingField<string>()
  }
  return extractedString(value)
}

function extractedNumber(value: unknown): ExtractedField<number> {
  const row = asRecord(value)
  const number = typeof row.value === 'number' && Number.isFinite(row.value) ? row.value : null
  const status = row.status === 'ok' || row.status === 'uncertain' || row.status === 'missing' ? row.status : 'missing'
  return { value: number, status: number == null ? 'missing' : status }
}

function extractedString(value: unknown): ExtractedField<string> {
  const row = asRecord(value)
  const text = typeof row.value === 'string' && row.value.trim() ? row.value.trim() : null
  const status = row.status === 'ok' || row.status === 'uncertain' || row.status === 'missing' ? row.status : 'missing'
  return { value: text, status: text == null ? 'missing' : status }
}

export function normalizeGeminiLabelRaw(raw: unknown): unknown {
  const source = asRecord(raw)
  const nested = asRecord(source.fields)
  const fields = Object.keys(nested).length > 0 ? nested : source
  const basisRaw = fields.basis
  const basis = asRecord(basisRaw)
  const basisValue = typeof basisRaw === 'string' ? basisRaw : typeof basis.value === 'string' ? basis.value : null
  const basisStatus =
    basis.status === 'ok' || basis.status === 'uncertain' || basis.status === 'missing'
      ? basis.status
      : basisValue
        ? 'ok'
        : 'missing'
  return {
    schemaVersion: '1.0',
    status: 'review_required',
    fields: {
      productName: asLabelString(fields.productName),
      brand: asLabelString(fields.brand),
      servingQuantity: asLabelNumber(fields.servingQuantity),
      servingUnit: asLabelString(fields.servingUnit),
      servingGrams: asLabelNumber(fields.servingGrams),
      servingsPerContainer: asLabelNumber(fields.servingsPerContainer),
      calories: asLabelNumber(fields.calories),
      proteinGrams: asLabelNumber(fields.proteinGrams),
      carbsGrams: asLabelNumber(fields.carbsGrams),
      fatGrams: asLabelNumber(fields.fatGrams),
      fiberGrams: asLabelNumber(fields.fiberGrams),
      basis: { value: basisValue, status: basisStatus },
      barcode: asLabelString(fields.barcode),
    },
    ambiguities: asStringList(source.ambiguities),
    warnings: asStringList(source.warnings),
  }
}

export function applyLabelUserContext(candidate: NutritionLabelCandidate, userContext: string | null): NutritionLabelCandidate {
  if (!userContext) {
    return candidate
  }
  const ambiguities = [...candidate.ambiguities]
  const claimed = userContext.match(/(\d+(?:\.\d+)?)\s*(?:calories|kcal)\b/i)
  if (claimed) {
    const stated = Number(claimed[1])
    const visible = candidate.fields.calories.value
    if (visible != null && Math.abs(visible - stated) >= 1) {
      ambiguities.push(`Your note says ${stated} calories, but the label shows ${visible}. The label value was kept.`)
    } else if (visible == null) {
      ambiguities.push('Your note mentions calories, but that number was not copied from the label.')
    }
  }
  return { ...candidate, fields: candidate.fields, ambiguities: [...new Set(ambiguities)] }
}

export function interpretNutritionLabelResponse(
  text: string,
  userContext: string | null,
  model: string | null,
): NutritionLabelCandidate {
  const raw = parseGeminiJson(text)
  let candidate: NutritionLabelCandidate
  try {
    const normalized = normalizeGeminiLabelRaw(raw)
    const withModel = asRecord(normalized)
    candidate = sanitizeLabelCandidate({ ...withModel, model })
  } catch {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "We couldn't confidently read this label.")
  }
  candidate = applyLabelUserContext(candidate, userContext)
  if (candidate.status === 'invalid') {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', "We couldn't confidently read this label.")
  }
  if (candidate.status === 'candidate') {
    candidate = { ...candidate, status: 'review_required' }
  }
  return candidate
}

export function interpretFoodDescriptionResponse(text: string, original: string): FoodDescriptionCandidate {
  const raw = parseGeminiJson(text)
  const candidate = dropInterpreterNutrients(normalizeGeminiDescriptionRaw(raw, original))
  const components = candidate.components.map((component) => ({
    ...component,
    preparation: blankToNull(component.preparation),
    ambiguity: blankToNull(component.ambiguity),
  }))
  if (components.length === 0) {
    throw new NutritionInterpretError('GEMINI_SEMANTIC', descriptionFailureMessage('GEMINI_SEMANTIC'))
  }
  return { ...candidate, components }
}

function blankToNull(value: string | null): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function parseGeminiJson(text: string): unknown {
  const trimmed = text.trim()
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i.exec(trimmed)
  const body = (fenced ? fenced[1] : trimmed).trim()
  try {
    return JSON.parse(body) as unknown
  } catch {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "We couldn't confidently interpret this meal.")
  }
}

export function summarizeInterpretationUsage(
  rows: ReadonlyArray<{ status: string; interpretation?: InterpretationMetadata | null }>,
): {
  calls: number
  failures: number
  failureRate: number
  averageLatencyMs: number | null
  inputTokens: number
  outputTokens: number
} {
  const calls = rows.length
  const failures = rows.filter((row) => row.status === 'failed').length
  const latencies = rows
    .map((row) => row.interpretation?.latencyMs)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  const inputTokens = rows.reduce((sum, row) => sum + (row.interpretation?.inputTokens ?? 0), 0)
  const outputTokens = rows.reduce((sum, row) => sum + (row.interpretation?.outputTokens ?? 0), 0)
  return {
    calls,
    failures,
    failureRate: calls === 0 ? 0 : failures / calls,
    averageLatencyMs: latencies.length === 0 ? null : latencies.reduce((sum, value) => sum + value, 0) / latencies.length,
    inputTokens,
    outputTokens,
  }
}

export function schemaMentionsNutrientTotals(schema: unknown): boolean {
  const encoded = JSON.stringify(schema)
  return /"(?:calories|protein|carbs|fat|fiber|kcal)"/.test(encoded)
}
