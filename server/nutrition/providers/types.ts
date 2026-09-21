import type { PackagedFoodCandidate, PackagedProviderSnapshot } from '../../../src/domain/nutrition/packaged.js'

export type PackagedLookupResult =
  | { status: 'found'; candidate: PackagedFoodCandidate }
  | { status: 'not_found' }
  | { status: 'unavailable'; message: string }

export type PackagedFoodProvider = {
  readonly id: 'open_food_facts'
  lookupBarcode(barcode: string): Promise<PackagedLookupResult>
}

export type PackagedProviderFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal },
) => Promise<Response>

export function snapshotFromUnknownProduct(product: Record<string, unknown>, barcode: string): PackagedProviderSnapshot {
  const nutriments = asRecord(product.nutriments)
  return {
    barcode: stringOr(product.code, barcode),
    name: firstString(product.product_name, product.product_name_en, product.generic_name),
    brand: firstString(product.brands),
    servingSizeText: firstString(product.serving_size),
    servingQuantityGrams: finitePositive(product.serving_quantity) ?? finitePositive(product.serving_quantity_g),
    nutrients: {
      energyKcalServing: nutrient(nutriments, 'energy-kcal_serving', 'energy_kcal_serving'),
      energyKcal100g: nutrient(nutriments, 'energy-kcal_100g', 'energy_kcal_100g'),
      proteinServing: nutrient(nutriments, 'proteins_serving'),
      protein100g: nutrient(nutriments, 'proteins_100g'),
      carbsServing: nutrient(nutriments, 'carbohydrates_serving'),
      carbs100g: nutrient(nutriments, 'carbohydrates_100g'),
      fatServing: nutrient(nutriments, 'fat_serving'),
      fat100g: nutrient(nutriments, 'fat_100g'),
      fiberServing: nutrient(nutriments, 'fiber_serving'),
      fiber100g: nutrient(nutriments, 'fiber_100g'),
    },
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed.length > 0) {
        return trimmed
      }
    }
  }
  return null
}

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function nutrient(record: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!record) {
    return null
  }
  for (const key of keys) {
    const parsed = finiteNonNegative(record[key])
    if (parsed != null) {
      return parsed
    }
  }
  return null
}

function finiteNonNegative(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}
