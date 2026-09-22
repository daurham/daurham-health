import type { NutrientAmount } from './servings.js'
import { snapshotFromDefinition } from './servings.js'
import type { NutritionFood } from './types.js'

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
