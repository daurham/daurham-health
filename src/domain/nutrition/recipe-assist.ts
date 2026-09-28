import { NutritionInterpretError, parseGeminiJson } from './interpret.js'
import { normalizeRecipeUnit } from './recipes.js'

export const RECIPE_ASSIST_VERSION = 'recipe-assist-v1'
export const RECIPE_ASSIST_PROMPT_VERSION = 'recipe-assist-v1'
export const RECIPE_ASSIST_REQUEST_TYPE = 'nutrition_recipe_assist'
export const RECIPE_ASSIST_TEXT_MAX = 6000
export const RECIPE_ASSIST_MAX_LINES = 80
export const RECIPE_ASSIST_LINE_MAX = 240
export const RECIPE_ASSIST_MAX_INGREDIENTS = 40
export const RECIPE_ASSIST_TITLE_MAX = 200
export const RECIPE_ASSIST_NAME_MAX = 120
export const RECIPE_ASSIST_UNIT_MAX = 40
export const RECIPE_ASSIST_MAX_REFS = 8
export const RECIPE_ASSIST_QUERY_MAX = 120

export const RECIPE_ASSIST_ALREADY_HAS_INGREDIENTS =
  'This recipe already has ingredients. Clear them before applying an AI draft.'

export type RecipeAssistSourceLine = {
  ref: string
  text: string
}

export type RecipeAssistIngredient = {
  draftId: string
  sourceRefs: string[]
  sourceText: string
  name: string
  quantity: number | null
  unit: string | null
}

export type RecipeAssistDraft = {
  version: typeof RECIPE_ASSIST_VERSION
  title: string | null
  yieldServings: number | null
  ingredients: RecipeAssistIngredient[]
}

export type RecipeAssistRequest =
  | { version: typeof RECIPE_ASSIST_VERSION; text: string }
  | { error: string; code: 'UNKNOWN_VERSION' | 'BLANK' | 'TOO_LONG' | 'INVALID_REQUEST' }

export type RecipeAssistPacket =
  | { lines: RecipeAssistSourceLine[] }
  | { error: string; code: 'BLANK' | 'TOO_MANY_LINES' }

export type AssistedBuilderLine = {
  key: string
  status: 'unresolved'
  name: string
  quantity: number | null
  unit: string | null
  sourceText: string
  sourceRefs: string[]
}

export type RecipeAssistApplyResult =
  | {
      name: string
      notes: string
      yieldServings: string
      finishedWeightG: string
      lines: AssistedBuilderLine[]
    }
  | { error: string }

const INGREDIENT_KEYS = ['sourceRefs', 'name', 'quantity', 'unit']
const DRAFT_KEYS = ['title', 'yieldServings', 'ingredients']
const REQUEST_KEYS = ['version', 'text']

export function parseRecipeAssistRequest(body: unknown): RecipeAssistRequest {
  const record = strictRecord(body, REQUEST_KEYS)
  if (!record || typeof record.version !== 'string') {
    return { error: 'This recipe draft request is not supported.', code: 'UNKNOWN_VERSION' }
  }
  if (record.version !== RECIPE_ASSIST_VERSION) {
    return { error: 'This recipe draft request is not supported.', code: 'UNKNOWN_VERSION' }
  }
  if (typeof record.text !== 'string') {
    return { error: 'Paste the ingredient list or recipe text.', code: 'INVALID_REQUEST' }
  }
  if (record.text.length > RECIPE_ASSIST_TEXT_MAX) {
    return { error: 'Recipe text must be 6000 characters or fewer.', code: 'TOO_LONG' }
  }
  if (record.text.trim().length === 0) {
    return { error: 'Paste the ingredient list or recipe text.', code: 'BLANK' }
  }
  return { version: RECIPE_ASSIST_VERSION, text: record.text }
}

export function recipeAssistSourcePacket(text: string): RecipeAssistPacket {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => line.slice(0, RECIPE_ASSIST_LINE_MAX))
  if (lines.length === 0) {
    return { error: 'Paste the ingredient list or recipe text.', code: 'BLANK' }
  }
  if (lines.length > RECIPE_ASSIST_MAX_LINES) {
    return { error: 'Recipe text has too many lines to draft.', code: 'TOO_MANY_LINES' }
  }
  return {
    lines: lines.map((line, index) => ({ ref: `L${index + 1}`, text: line })),
  }
}

export function recipeAssistPrompt(lines: readonly RecipeAssistSourceLine[]): string {
  const packet = lines.map((line) => `${line.ref}: ${line.text}`).join('\n')
  return [
    'Turn the supplied recipe text into a structured draft.',
    'Include only ingredients supported by the supplied source lines.',
    'Do not invent pantry items.',
    'Do not add oil, salt, water, spices, toppings, or sauces unless the source text supports them.',
    'If quantity is not stated, use null.',
    'If unit is not stated, use null.',
    'Do not infer Nutrition values.',
    'Do not convert quantities into grams.',
    'Do not calculate calories or macros.',
    'Do not rewrite the recipe into a diet or health recommendation.',
    'Health does not fetch webpages. If a line is only a URL, do not invent the page contents.',
    'Cite each ingredient with one or more source refs from the packet, such as L1.',
    'One source line may become more than one ingredient when that line names more than one ingredient.',
    'Output JSON only. Do not wrap the JSON in markdown.',
    'Use this shape: {"title":"Turkey chili","yieldServings":6,"ingredients":[{"sourceRefs":["L3"],"name":"ground turkey","quantity":1,"unit":"lb"}]}',
    'title and yieldServings are null when the source text does not state them.',
    'Do not include calories, protein, carbs, fat, fiber, food ids, or confidence scores.',
    '',
    'SOURCE LINES:',
    packet,
  ].join('\n')
}

export function parseRecipeAssistModelOutput(
  value: unknown,
  lines: readonly RecipeAssistSourceLine[],
  createId: () => string = () => crypto.randomUUID(),
): RecipeAssistDraft {
  const raw = typeof value === 'string' ? parseGeminiJson(value) : value
  const record = strictRecord(raw, DRAFT_KEYS)
  if (!record || !Array.isArray(record.ingredients)) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const title = readTitle(record.title)
  const yieldServings = readYield(record.yieldServings)
  if (record.ingredients.length < 1 || record.ingredients.length > RECIPE_ASSIST_MAX_INGREDIENTS) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const known = new Map(lines.map((line) => [line.ref, line]))
  const ingredients = record.ingredients.map((item) => readIngredient(item, known, lines, createId))
  return { version: RECIPE_ASSIST_VERSION, title, yieldServings, ingredients }
}

export function applyRecipeAssistToBuilder(input: {
  name: string
  notes: string
  yieldServings: string
  finishedWeightG: string
  ingredientCount: number
  draft: RecipeAssistDraft
}): RecipeAssistApplyResult {
  if (input.ingredientCount > 0) {
    return { error: RECIPE_ASSIST_ALREADY_HAS_INGREDIENTS }
  }
  return {
    name: input.name.trim() ? input.name : (input.draft.title ?? ''),
    notes: input.notes,
    yieldServings: input.yieldServings.trim() ? input.yieldServings : input.draft.yieldServings == null ? '' : String(input.draft.yieldServings),
    finishedWeightG: input.finishedWeightG,
    lines: input.draft.ingredients.map((ingredient) => ({
      key: ingredient.draftId,
      status: 'unresolved' as const,
      name: ingredient.name,
      quantity: ingredient.quantity,
      unit: ingredient.unit,
      sourceText: ingredient.sourceText,
      sourceRefs: ingredient.sourceRefs,
    })),
  }
}

export function transferSuggestedMeasure(input: {
  quantity: number | null
  unit: string | null
  supportedUnits: readonly string[]
}): { amount: string; unit: string; transferredUnit: boolean } {
  const amount = input.quantity != null && input.quantity > 0 && Number.isFinite(input.quantity) ? String(input.quantity) : '1'
  const suggested = input.unit ? normalizeRecipeUnit(input.unit) : ''
  const match = suggested ? input.supportedUnits.find((unit) => normalizeRecipeUnit(unit) === suggested) : undefined
  if (!match) {
    return { amount, unit: 'serving', transferredUnit: false }
  }
  return { amount, unit: match, transferredUnit: true }
}

export function replaceOneUnresolved<T extends { key: string; status: 'resolved' | 'unresolved' }>(
  lines: readonly T[],
  key: string,
  replacement: T,
): T[] {
  return lines.map((line) => (line.key === key && line.status === 'unresolved' ? replacement : line))
}

export function assistedLinesBlockSave(lines: readonly { status: 'resolved' | 'unresolved' }[]): boolean {
  return lines.length === 0 || lines.some((line) => line.status === 'unresolved')
}

export function recipeAssistFailureMessage(code: string): string {
  if (code === 'AI_BUDGET_REACHED') return "This month's AI budget is used up."
  if (code === 'AI_RATE_LIMITED') return 'AI requests are coming too quickly. Try again in a moment.'
  if (code === 'GEMINI_SCHEMA' || code === 'GEMINI_SEMANTIC') return "That text didn't become a usable ingredient draft."
  return 'Recipe drafting is temporarily unavailable.'
}

function readTitle(value: unknown): string | null {
  if (value == null) return null
  if (typeof value !== 'string') {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const title = value.trim()
  if (!title || title.length > RECIPE_ASSIST_TITLE_MAX) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  return title
}

function readYield(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  return value
}

function readIngredient(
  value: unknown,
  known: ReadonlyMap<string, RecipeAssistSourceLine>,
  lines: readonly RecipeAssistSourceLine[],
  createId: () => string,
): RecipeAssistIngredient {
  const record = strictRecord(value, INGREDIENT_KEYS)
  if (!record || !Array.isArray(record.sourceRefs) || record.sourceRefs.length < 1 || record.sourceRefs.length > RECIPE_ASSIST_MAX_REFS) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const sourceRefs = record.sourceRefs.map((ref) => {
    if (typeof ref !== 'string' || !known.has(ref)) {
      throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
    }
    return ref
  })
  if (typeof record.name !== 'string' || record.name.trim().length === 0 || record.name.trim().length > RECIPE_ASSIST_NAME_MAX) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  if (record.quantity != null && (typeof record.quantity !== 'number' || !Number.isFinite(record.quantity) || record.quantity <= 0)) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  if (record.unit != null && typeof record.unit !== 'string') {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const unit = typeof record.unit === 'string' ? record.unit.trim() : ''
  if (unit.length > RECIPE_ASSIST_UNIT_MAX) {
    throw new NutritionInterpretError('GEMINI_SCHEMA', "That text didn't become a usable ingredient draft.")
  }
  const unique = [...new Set(sourceRefs)]
  const ordered = lines.filter((line) => unique.includes(line.ref))
  return {
    draftId: createId(),
    sourceRefs: unique,
    sourceText: ordered.map((line) => line.text).join('\n'),
    name: record.name.trim(),
    quantity: record.quantity == null ? null : record.quantity,
    unit: unit.length > 0 ? unit : null,
  }
}

function strictRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!keys.includes(key)) return null
  }
  return record
}
