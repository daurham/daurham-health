import { z } from 'zod'
import type { NutrientAmount } from './servings.js'
import { snapshotFromDefinition } from './servings.js'
import type { NutritionFood } from './types.js'
import {
  mealEstimateNutrients,
  mealEstimateUserAdjusted,
  roundMealGrams,
  type MealEstimateNutrients,
} from './meal.js'

export type FoodDescriptionComponent = {
  id: string
  proposedName: string
  quantity: number | null
  unit: string
  preparation: string | null
  ambiguity: string | null
}

export type FoodDescriptionCandidate = {
  original: string
  components: FoodDescriptionComponent[]
}

export type FoodDescriptionInterpreter = {
  interpret(text: string): FoodDescriptionCandidate | Promise<FoodDescriptionCandidate>
}

const FRACTIONS: Record<string, number> = {
  half: 0.5,
  quarter: 0.25,
  third: 1 / 3,
}

const UNITS = new Set([
  'lb',
  'lbs',
  'pound',
  'pounds',
  'oz',
  'ounce',
  'ounces',
  'g',
  'gram',
  'grams',
  'kg',
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'ml',
  'piece',
  'pieces',
])

const PREPARATION = new Set(['diced', 'chopped', 'minced', 'sliced', 'cooked', 'raw', 'grilled', 'roasted', 'steamed'])

const MASS_GRAMS: Record<string, number> = {
  g: 1,
  gram: 1,
  grams: 1,
  kg: 1000,
  oz: 28.349523125,
  ounce: 28.349523125,
  ounces: 28.349523125,
  lb: 453.59237,
  lbs: 453.59237,
  pound: 453.59237,
  pounds: 453.59237,
}

const NUTRIENT_KEYS = new Set(['calories', 'protein', 'carbs', 'fat', 'fiber', 'kcal'])

export function foodDescriptionOffer(query: string): boolean {
  const text = query.trim()
  if (text.length < 12) {
    return false
  }
  const words = text.split(/\s+/).filter(Boolean)
  const hasComma = text.includes(',')
  const hasQuantity = /\b(\d+(?:\.\d+)?|\d+\/\d+|half|quarter|cups?|lbs?|pounds?|ounces?|oz|grams?|tbsp|tsp)\b/i.test(text)
  const hasAnd = /\b(and|with)\b/i.test(text)
  if (hasComma && words.length >= 4) {
    return true
  }
  if (hasQuantity && (hasAnd || words.length >= 6)) {
    return true
  }
  return words.length >= 8
}

export function hasStrongCatalogMatch(query: string, foods: readonly { name: string }[]): boolean {
  const needle = query.trim().toLowerCase()
  if (needle.length === 0) {
    return false
  }
  return foods.some((food) => {
    const name = food.name.trim().toLowerCase()
    if (name.length === 0) {
      return false
    }
    return name === needle || name.startsWith(needle) || needle.startsWith(name)
  })
}

export function shouldOfferFoodDescription(query: string, foods: readonly { name: string }[] | null, searching: boolean): boolean {
  if (foodDescriptionOffer(query)) {
    return true
  }
  if (searching || foods == null) {
    return false
  }
  return query.trim().length > 0 && !hasStrongCatalogMatch(query, foods)
}

function canonicalUnit(token: string): string {
  if (token === 'lbs' || token === 'pounds') {
    return 'lb'
  }
  if (token === 'ounces') {
    return 'oz'
  }
  if (token === 'grams') {
    return 'g'
  }
  if (token === 'cups') {
    return 'cup'
  }
  if (token === 'pieces') {
    return 'piece'
  }
  return token
}

function parseQuantityToken(token: string): number | null {
  if (FRACTIONS[token] != null) {
    return FRACTIONS[token]
  }
  if (/^\d+(?:\.\d+)?$/.test(token)) {
    return Number(token)
  }
  const fraction = /^(\d+)\/(\d+)$/.exec(token)
  if (fraction) {
    const denominator = Number(fraction[2])
    if (denominator === 0) {
      return null
    }
    return Number(fraction[1]) / denominator
  }
  return null
}

function splitClauses(text: string): string[] {
  return text
    .split(/\s*,\s*|\s+\band\b\s+|\s+\bwith\b\s+/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
}

function parseClause(raw: string, index: number): FoodDescriptionComponent | null {
  const tokens = raw
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z0-9./-]/g, ''))
    .filter(Boolean)
  let quantity: number | null = null
  let unit: string | null = null
  let preparation: string | null = null
  const name: string[] = []
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i] ?? ''
    const quantityToken = parseQuantityToken(token)
    if (quantityToken != null && quantity == null && name.length === 0) {
      quantity = quantityToken
      continue
    }
    if ((token === 'a' || token === 'an' || token === 'of' || token === 'the' || token === 'about' || token === 'approximately') && name.length === 0) {
      const next = tokens[i + 1]
      if ((token === 'a' || token === 'an') && quantity == null && next && UNITS.has(next)) {
        quantity = 1
      }
      continue
    }
    if (UNITS.has(token) && unit == null && name.length === 0) {
      unit = canonicalUnit(token)
      if (quantity == null) {
        quantity = 1
      }
      continue
    }
    if (PREPARATION.has(token) && preparation == null) {
      preparation = token
      continue
    }
    name.push(token)
  }
  if (name.length === 0) {
    return null
  }
  let ambiguity: string | null = null
  if (unit == null) {
    unit = 'whole'
    if (quantity != null && !Number.isInteger(quantity)) {
      ambiguity = `size of ${name.join(' ')} unknown`
    }
  }
  if (quantity == null) {
    ambiguity = 'quantity not specified'
  }
  return {
    id: `component-${index + 1}`,
    proposedName: name.join(' '),
    quantity,
    unit,
    preparation,
    ambiguity,
  }
}

export function parseFoodDescription(text: string): FoodDescriptionCandidate {
  const original = text.trim().replace(/\s+/g, ' ')
  const components = splitClauses(original)
    .map((clause, index) => parseClause(clause, index))
    .filter((component): component is FoodDescriptionComponent => component != null)
  return { original, components }
}

export const localFoodDescriptionInterpreter: FoodDescriptionInterpreter = {
  interpret(text) {
    return parseFoodDescription(text)
  },
}

export function dropInterpreterNutrients(value: unknown): FoodDescriptionCandidate {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  const original = typeof record.original === 'string' ? record.original : ''
  const rawComponents = Array.isArray(record.components) ? record.components : []
  const components: FoodDescriptionComponent[] = []
  for (const item of rawComponents) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const source = item as Record<string, unknown>
    for (const key of Object.keys(source)) {
      if (NUTRIENT_KEYS.has(key)) {
        delete source[key]
      }
    }
    const proposedName = typeof source.proposedName === 'string' ? source.proposedName.trim() : ''
    if (!proposedName) {
      continue
    }
    const quantity = typeof source.quantity === 'number' && Number.isFinite(source.quantity) ? source.quantity : null
    components.push({
      id: typeof source.id === 'string' && source.id.trim() ? source.id : `component-${components.length + 1}`,
      proposedName,
      quantity,
      unit: typeof source.unit === 'string' && source.unit.trim() ? source.unit.trim() : 'whole',
      preparation: typeof source.preparation === 'string' ? source.preparation : null,
      ambiguity: typeof source.ambiguity === 'string' ? source.ambiguity : null,
    })
  }
  return { original, components }
}

export function massGrams(quantity: number, unit: string): number | null {
  const factor = MASS_GRAMS[unit.trim().toLowerCase()]
  if (factor == null || !(quantity > 0)) {
    return null
  }
  return quantity * factor
}

export function descriptionPortion(input: {
  quantity: number | null
  unit: string
  food: Pick<NutritionFood, 'servingUnit' | 'servingGrams'> | null
}): { grams: number | null; resolved: boolean } {
  if (input.quantity == null || !(input.quantity > 0) || !input.food) {
    return { grams: null, resolved: false }
  }
  const unit = input.unit.trim().toLowerCase()
  const servingUnit = input.food.servingUnit.trim().toLowerCase()
  const grams = massGrams(input.quantity, unit)
  if (grams != null) {
    if (input.food.servingGrams != null && input.food.servingGrams > 0) {
      return { grams, resolved: true }
    }
    return { grams: null, resolved: false }
  }
  const countable = unit === 'whole' || unit === 'piece' || unit === 'serving'
  if (countable && !Number.isInteger(input.quantity)) {
    return { grams: null, resolved: false }
  }
  if (unit === servingUnit || countable) {
    return {
      grams: input.food.servingGrams != null ? input.food.servingGrams * input.quantity : null,
      resolved: true,
    }
  }
  return { grams: null, resolved: false }
}

function addNutrients(current: NutrientAmount | null, next: NutrientAmount): NutrientAmount {
  return {
    calories: (current?.calories ?? 0) + next.calories,
    protein: current?.protein == null || next.protein == null ? null : current.protein + next.protein,
    carbs: current?.carbs == null || next.carbs == null ? null : current.carbs + next.carbs,
    fat: current?.fat == null || next.fat == null ? null : current.fat + next.fat,
    fiber: current?.fiber == null || next.fiber == null ? null : current.fiber + next.fiber,
  }
}

export function descriptionComponentTotals(
  components: readonly {
    included: boolean
    quantity: number | null
    unit: string
    food: NutritionFood | null
  }[],
): NutrientAmount | null {
  let totals: NutrientAmount | null = null
  for (const component of components) {
    if (!component.included || !component.food) {
      continue
    }
    const portion = descriptionPortion({
      quantity: component.quantity,
      unit: component.unit,
      food: component.food,
    })
    if (!portion.resolved) {
      continue
    }
    const snapshot = snapshotFromDefinition(
      {
        calories: component.food.calories,
        protein: component.food.protein,
        carbs: component.food.carbs,
        fat: component.food.fat,
        fiber: component.food.fiber,
        servingGrams: component.food.servingGrams,
      },
      { quantity: component.quantity ?? 1, grams: portion.grams },
    )
    totals = addNutrients(totals, snapshot)
  }
  return totals
}

const MASS_UNITS = new Set(['g', 'gram', 'grams', 'kg', 'oz', 'ounce', 'ounces', 'lb', 'lbs', 'pound', 'pounds'])

export const descriptionEstimateItemSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().nullable(),
  unit: z.string().min(1),
  estimatedGrams: z.number().nullable(),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  fiberGrams: z.number().nullable(),
  assumption: z.string().nullable(),
})
export type DescriptionEstimateItem = z.infer<typeof descriptionEstimateItemSchema>

export const descriptionEstimateCandidateSchema = z.object({
  original: z.string(),
  name: z.string().min(1),
  items: z.array(descriptionEstimateItemSchema),
  assumptions: z.array(z.string()),
  calories: z.number(),
  proteinGrams: z.number(),
  carbsGrams: z.number(),
  fatGrams: z.number(),
  fiberGrams: z.number().nullable(),
  model: z.string().nullable().optional(),
})
export type DescriptionEstimateCandidate = z.infer<typeof descriptionEstimateCandidateSchema>

export type DescriptionEstimateInterpreter = {
  interpret(text: string): DescriptionEstimateCandidate | Promise<DescriptionEstimateCandidate>
}

export const commitNutritionDescriptionEstimateRequestSchema = z.object({
  text: z.string().trim().min(1).max(500),
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
  items: z.array(descriptionEstimateItemSchema).optional(),
})
export type CommitNutritionDescriptionEstimateRequest = z.input<typeof commitNutritionDescriptionEstimateRequestSchema>

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function asTrimmed(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function descriptionEstimateItemNutrients(item: DescriptionEstimateItem): MealEstimateNutrients {
  return mealEstimateNutrients({
    calories: item.calories,
    proteinGrams: item.proteinGrams,
    carbsGrams: item.carbsGrams,
    fatGrams: item.fatGrams,
    fiberGrams: item.fiberGrams,
  })
}

export function sumDescriptionEstimateItems(items: readonly DescriptionEstimateItem[]): MealEstimateNutrients {
  let calories = 0
  let proteinGrams = 0
  let carbsGrams = 0
  let fatGrams = 0
  let fiberGrams: number | null = 0
  for (const item of items) {
    calories += item.calories
    proteinGrams += item.proteinGrams
    carbsGrams += item.carbsGrams
    fatGrams += item.fatGrams
    if (item.fiberGrams == null || fiberGrams == null) {
      fiberGrams = null
    } else {
      fiberGrams += item.fiberGrams
    }
  }
  return mealEstimateNutrients({ calories, proteinGrams, carbsGrams, fatGrams, fiberGrams })
}

export function canScaleDescriptionItem(baseline: DescriptionEstimateItem, quantity: number | null, unit: string): boolean {
  return (
    baseline.quantity != null &&
    baseline.quantity > 0 &&
    quantity != null &&
    quantity > 0 &&
    baseline.unit.trim().toLowerCase() === unit.trim().toLowerCase()
  )
}

export function scaleDescriptionItem(
  baseline: DescriptionEstimateItem,
  quantity: number | null,
  unit: string,
): DescriptionEstimateItem {
  if (!canScaleDescriptionItem(baseline, quantity, unit)) {
    return { ...baseline, quantity, unit }
  }
  const factor = (quantity as number) / (baseline.quantity as number)
  return {
    ...baseline,
    quantity,
    unit,
    estimatedGrams:
      baseline.estimatedGrams == null ? null : roundMealGrams(baseline.estimatedGrams * factor),
    calories: Math.max(0, baseline.calories * factor),
    proteinGrams: Math.max(0, baseline.proteinGrams * factor),
    carbsGrams: Math.max(0, baseline.carbsGrams * factor),
    fatGrams: Math.max(0, baseline.fatGrams * factor),
    fiberGrams: baseline.fiberGrams == null ? null : Math.max(0, baseline.fiberGrams * factor),
  }
}

export function formatNaturalQuantity(value: number): string {
  const fractions: Array<[number, string]> = [
    [0.25, '¼'],
    [1 / 3, '⅓'],
    [0.5, '½'],
    [2 / 3, '⅔'],
    [0.75, '¾'],
  ]
  for (const [amount, label] of fractions) {
    if (Math.abs(value - amount) < 0.02) {
      return label
    }
  }
  if (Number.isInteger(value)) {
    return String(value)
  }
  return String(Math.round(value * 100) / 100)
}

export function formatDescriptionItemPortion(item: DescriptionEstimateItem): string {
  const quantity = item.quantity == null ? '' : formatNaturalQuantity(item.quantity)
  const unit = item.unit.trim()
  const amount = [quantity, unit].filter(Boolean).join(' ')
  if (item.estimatedGrams == null) {
    return amount
  }
  const grams = `~${Math.round(item.estimatedGrams)}g`
  const estimated = MASS_UNITS.has(unit.toLowerCase()) ? grams : `${grams} estimated`
  return amount ? `${amount} (${estimated})` : estimated
}

export function reconstructDescriptionText(items: readonly DescriptionEstimateItem[]): string {
  return items
    .map((item) => {
      const quantity = item.quantity == null ? '' : String(item.quantity)
      return [quantity, item.unit, item.name].filter((part) => part.trim().length > 0).join(' ')
    })
    .filter(Boolean)
    .join(', ')
}

export function sanitizeDescriptionEstimate(
  raw: unknown,
  options?: { original?: string; model?: string | null },
): DescriptionEstimateCandidate {
  const source = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const rawItems = Array.isArray(source.items)
    ? source.items
    : Array.isArray(source.components)
      ? source.components
      : []
  const items: DescriptionEstimateItem[] = []
  for (const item of rawItems) {
    if (!item || typeof item !== 'object') {
      continue
    }
    const row = item as Record<string, unknown>
    const name = asTrimmed(row.name) ?? asTrimmed(row.proposedName) ?? asTrimmed(row.food) ?? asTrimmed(row.foodName)
    if (!name) {
      continue
    }
    items.push(
      descriptionEstimateItemSchema.parse({
        id: asTrimmed(row.id) ?? `item-${items.length + 1}`,
        name,
        quantity: asFiniteNumber(row.quantity ?? row.amount),
        unit: asTrimmed(row.unit) ?? 'serving',
        estimatedGrams: roundMealGrams(asFiniteNumber(row.estimatedGrams ?? row.grams)),
        assumption: asTrimmed(row.assumption) ?? asTrimmed(row.ambiguity) ?? asTrimmed(row.note),
        calories: Math.max(0, asFiniteNumber(row.calories) ?? 0),
        proteinGrams: Math.max(0, asFiniteNumber(row.proteinGrams ?? row.protein) ?? 0),
        carbsGrams: Math.max(0, asFiniteNumber(row.carbsGrams ?? row.carbs) ?? 0),
        fatGrams: Math.max(0, asFiniteNumber(row.fatGrams ?? row.fat) ?? 0),
        fiberGrams: asFiniteNumber(row.fiberGrams ?? row.fiber),
      }),
    )
  }
  const totals = sumDescriptionEstimateItems(items)
  const assumptions = Array.isArray(source.assumptions)
    ? source.assumptions.map(asTrimmed).filter((item): item is string => Boolean(item))
    : []
  const original = options?.original ?? asTrimmed(source.original) ?? ''
  return descriptionEstimateCandidateSchema.parse({
    original,
    name: asTrimmed(source.name) ?? items[0]?.name ?? 'Meal',
    items,
    assumptions: [...new Set(assumptions)],
    model: options?.model ?? (typeof source.model === 'string' ? source.model : null),
    ...totals,
  })
}

export function descriptionEstimateUserAdjusted(
  baseline: MealEstimateNutrients,
  reviewed: MealEstimateNutrients,
): boolean {
  return mealEstimateUserAdjusted(baseline, reviewed)
}

export { mealEstimateNutrients as descriptionEstimateNutrients }
