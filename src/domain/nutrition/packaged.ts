import { NUTRITION_CONFIG } from './config.js'
import { normalizeBarcode } from './barcode.js'
import { parseOptionalGramsFromServingText, scaleNutrients, type NutrientAmount } from './servings.js'
import type { ReviewFieldError } from '../paper-load.js'

export const PACKAGED_PROVIDERS = ['open_food_facts'] as const
export type PackagedFoodProviderId = (typeof PACKAGED_PROVIDERS)[number]

export type NutrientBasis = 'per_serving' | 'per_100g_derived' | 'per_100g_unspecified' | 'missing'

export type PackagedCandidateNutrition = {
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  fiber: number | null
}

export type PackagedFoodCandidate = {
  barcode: string
  barcodeRaw: string
  source: PackagedFoodProviderId
  name: string | null
  brand: string | null
  serving: {
    quantity: number
    unit: string | null
    grams: number | null
  }
  nutrition: PackagedCandidateNutrition
  sourceBasis: {
    kind: NutrientBasis
    perServing: boolean
    per100g: boolean
  }
  per100g: NutrientAmount | null
  warnings: string[]
  complete: boolean
}

export type PackagedProviderNutrients = {
  energyKcalServing: number | null
  energyKcal100g: number | null
  proteinServing: number | null
  protein100g: number | null
  carbsServing: number | null
  carbs100g: number | null
  fatServing: number | null
  fat100g: number | null
  fiberServing: number | null
  fiber100g: number | null
}

/** Provider-independent snapshot used to build a candidate. Not OFF JSON. */
export type PackagedProviderSnapshot = {
  barcode: string
  name: string | null
  brand: string | null
  servingSizeText: string | null
  servingQuantityGrams: number | null
  nutrients: PackagedProviderNutrients
}

export function finiteNutrient(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null
  }
  return parsed
}

function servingNutrients(n: PackagedProviderNutrients): NutrientAmount | null {
  if (n.energyKcalServing == null) {
    return null
  }
  return {
    calories: n.energyKcalServing,
    protein: n.proteinServing,
    carbs: n.carbsServing,
    fat: n.fatServing,
    fiber: n.fiberServing,
  }
}

function per100gNutrients(n: PackagedProviderNutrients): NutrientAmount | null {
  if (n.energyKcal100g == null) {
    return null
  }
  return {
    calories: n.energyKcal100g,
    protein: n.protein100g,
    carbs: n.carbs100g,
    fat: n.fat100g,
    fiber: n.fiber100g,
  }
}

function clipName(value: string | null, max: number): string | null {
  if (value == null) {
    return null
  }
  const next = value.replace(/<[^>]*>/g, '').trim()
  if (next.length === 0) {
    return null
  }
  return next.slice(0, max)
}

/**
 * Serving / nutrient mapping:
 * - Prefer explicit per-serving kcal when present. Macros then come only from
 *   the `_serving` keys (never mixed with `_100g`).
 * - Else if per-100g kcal and a reliable serving gram amount exist, derive
 *   canonical serving nutrition with the shared scaler (grams / 100).
 * - Else if only per-100g exists, do not invent a serving. Candidate is
 *   incomplete until the user chooses 100 g or enters serving grams.
 */
export function candidateFromProviderSnapshot(
  snapshot: PackagedProviderSnapshot,
  source: PackagedFoodProviderId = 'open_food_facts',
): PackagedFoodCandidate {
  const parsedBarcode = normalizeBarcode(snapshot.barcode)
  const barcode = parsedBarcode?.normalized ?? barcodeDigitsSafe(snapshot.barcode)
  const name = clipName(snapshot.name, NUTRITION_CONFIG.foodNameMax)
  const brand = clipName(firstBrand(snapshot.brand), NUTRITION_CONFIG.brandMax)
  const gramsFromText = parseOptionalGramsFromServingText(snapshot.servingSizeText)
  const sizeText = snapshot.servingSizeText ?? ''
  const quantityLooksLikeGrams = gramsFromText != null || /\bg(?:rams?)?\b/i.test(sizeText)
  const servingGrams =
    quantityLooksLikeGrams && snapshot.servingQuantityGrams != null && snapshot.servingQuantityGrams > 0
      ? snapshot.servingQuantityGrams
      : gramsFromText
  const perServing = servingNutrients(snapshot.nutrients)
  const per100g = per100gNutrients(snapshot.nutrients)
  const unitFromText = servingUnitFromText(snapshot.servingSizeText)
  const warnings: string[] = []

  if (perServing) {
    return finalizeCandidate({
      barcode,
      barcodeRaw: snapshot.barcode,
      source,
      name,
      brand,
      serving: {
        quantity: 1,
        unit: unitFromText ?? 'serving',
        grams: servingGrams,
      },
      nutrition: perServing,
      sourceBasis: { kind: 'per_serving', perServing: true, per100g: per100g != null },
      per100g,
      warnings,
    })
  }

  if (per100g && servingGrams != null) {
    const derived = scaleNutrients(per100g, servingGrams / 100)
    warnings.push('Nutrition derived from per-100 g values and serving weight.')
    return finalizeCandidate({
      barcode,
      barcodeRaw: snapshot.barcode,
      source,
      name,
      brand,
      serving: {
        quantity: 1,
        unit: unitFromText ?? 'serving',
        grams: servingGrams,
      },
      nutrition: derived,
      sourceBasis: { kind: 'per_100g_derived', perServing: false, per100g: true },
      per100g,
      warnings,
    })
  }

  if (per100g) {
    warnings.push('Nutrition available per 100 g. Choose serving size.')
    return finalizeCandidate({
      barcode,
      barcodeRaw: snapshot.barcode,
      source,
      name,
      brand,
      serving: {
        quantity: 1,
        unit: null,
        grams: null,
      },
      nutrition: { calories: null, protein: null, carbs: null, fat: null, fiber: null },
      sourceBasis: { kind: 'per_100g_unspecified', perServing: false, per100g: true },
      per100g,
      warnings,
    })
  }

  warnings.push('Calories were not provided. Enter them to save this food.')
  return finalizeCandidate({
    barcode,
    barcodeRaw: snapshot.barcode,
    source,
    name,
    brand,
    serving: {
      quantity: 1,
      unit: unitFromText ?? 'serving',
      grams: servingGrams,
    },
    nutrition: { calories: null, protein: null, carbs: null, fat: null, fiber: null },
    sourceBasis: { kind: 'missing', perServing: false, per100g: false },
    per100g: null,
    warnings,
  })
}

function finalizeCandidate(candidate: Omit<PackagedFoodCandidate, 'complete'>): PackagedFoodCandidate {
  const complete =
    Boolean(candidate.name) &&
    candidate.nutrition.calories != null &&
    Boolean(candidate.serving.unit)
  return { ...candidate, complete }
}

function barcodeDigitsSafe(value: string): string {
  return value.replace(/\D/g, '')
}

function firstBrand(value: string | null): string | null {
  if (value == null) {
    return null
  }
  const first = value.split(',')[0]?.trim() ?? ''
  return first.length > 0 ? first : null
}

function servingUnitFromText(text: string | null): string | null {
  if (text == null) {
    return null
  }
  const trimmed = text.trim()
  if (trimmed.length === 0) {
    return null
  }
  if (parseOptionalGramsFromServingText(trimmed) != null && /^\s*\d/.test(trimmed)) {
    return 'serving'
  }
  return trimmed.slice(0, NUTRITION_CONFIG.servingUnitMax)
}

export function deriveServingFromPer100g(
  per100g: NutrientAmount,
  servingGrams: number,
): NutrientAmount {
  return scaleNutrients(per100g, servingGrams / 100)
}

export type PackagedReviewInput = {
  barcode: string
  name: string
  brand?: string | null
  servingQuantity?: number
  servingUnit: string
  servingGrams?: number | null
  calories: number
  protein?: number | null
  carbs?: number | null
  fat?: number | null
  fiber?: number | null
  logDate: string
  timezone?: string
  logQuantity?: number
  log?: boolean
}

export function validatePackagedReview(input: {
  barcode?: string | null
  name?: string | null
  servingUnit?: string | null
  servingQuantity?: number | null
  servingGrams?: number | null
  calories?: number | null
}): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  if (!normalizeBarcode(input.barcode ?? '')) {
    errors.push({ path: 'barcode', message: 'Enter a valid barcode.' })
  }
  if (!input.name || input.name.trim().length === 0) {
    errors.push({ path: 'name', message: 'Name is required.' })
  }
  if (!input.servingUnit || input.servingUnit.trim().length === 0) {
    errors.push({ path: 'servingUnit', message: 'Serving size is required.' })
  }
  if (input.servingQuantity != null && !(input.servingQuantity > 0)) {
    errors.push({ path: 'servingQuantity', message: 'Serving quantity must be greater than 0.' })
  }
  if (input.servingGrams != null && !(input.servingGrams > 0)) {
    errors.push({ path: 'servingGrams', message: 'Serving weight must be greater than 0.' })
  }
  if (input.calories == null || !Number.isFinite(input.calories) || input.calories < 0) {
    errors.push({ path: 'calories', message: 'Calories required.' })
  }
  return errors
}

export function applyHundredGramServing(candidate: PackagedFoodCandidate): PackagedFoodCandidate {
  if (!candidate.per100g) {
    return candidate
  }
  return {
    ...candidate,
    serving: { quantity: 1, unit: '100 g', grams: 100 },
    nutrition: { ...candidate.per100g },
    sourceBasis: { kind: 'per_100g_derived', perServing: false, per100g: true },
    warnings: candidate.warnings.filter((warning) => !warning.includes('Choose serving size')),
    complete: Boolean(candidate.name),
  }
}

export function applyGramServing(candidate: PackagedFoodCandidate, grams: number): PackagedFoodCandidate {
  if (!candidate.per100g || !(grams > 0)) {
    return candidate
  }
  const nutrition = deriveServingFromPer100g(candidate.per100g, grams)
  return {
    ...candidate,
    serving: { quantity: 1, unit: candidate.serving.unit ?? 'serving', grams },
    nutrition: { ...nutrition },
    sourceBasis: { kind: 'per_100g_derived', perServing: false, per100g: true },
    warnings: [
      ...candidate.warnings.filter((warning) => !warning.includes('Choose serving size')),
      'Nutrition derived from per-100 g values and serving weight.',
    ],
    complete: Boolean(candidate.name) && nutrition.calories != null,
  }
}
