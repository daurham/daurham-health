import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  barcodesEquivalent,
  candidateFromProviderSnapshot,
  normalizeBarcode,
  shouldIgnoreDuplicateScan,
  validatePackagedReview,
  applyHundredGramServing,
  applyGramServing,
  type PackagedProviderSnapshot,
} from '../src/domain/nutrition/index.ts'
import { createOpenFoodFactsProvider } from '../server/nutrition/providers/open-food-facts.ts'
import { GET_FOOD_BY_BARCODES_SQL, INSERT_FOOD_SQL, UPDATE_FOOD_SQL } from '../server/nutrition/queries.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'

const chobaniUpc = '034000470693'
const chobaniEan = '0034000470693'

function snapshot(partial?: Partial<PackagedProviderSnapshot>): PackagedProviderSnapshot {
  return {
    barcode: chobaniUpc,
    name: 'Chobani Greek Yogurt',
    brand: 'Chobani',
    servingSizeText: '1 container (150 g)',
    servingQuantityGrams: 150,
    nutrients: {
      energyKcalServing: 120,
      energyKcal100g: 80,
      proteinServing: 12,
      protein100g: 8,
      carbsServing: 9,
      carbs100g: 6,
      fatServing: 4,
      fat100g: 2.7,
      fiberServing: null,
      fiber100g: null,
    },
    ...partial,
  }
}

describe('barcode normalization', () => {
  it('keeps barcodes as strings with leading zeroes and pads UPC-A to EAN-13', () => {
    const parsed = normalizeBarcode(chobaniUpc)
    expect(parsed?.raw).toBe(chobaniUpc)
    expect(parsed?.digits).toBe(chobaniUpc)
    expect(parsed?.normalized).toBe(chobaniEan)
    expect(typeof parsed?.normalized).toBe('string')
    expect(parsed?.normalized.startsWith('0')).toBe(true)
    expect(String(Number(parsed!.normalized))).not.toBe(parsed!.normalized)
    expect(barcodesEquivalent(chobaniUpc, chobaniEan)).toBe(true)
    expect(parsed?.lookupKeys).toEqual(expect.arrayContaining([chobaniUpc, chobaniEan]))
  })

  it('rejects non-retail codes and ignores duplicate in-flight scans', () => {
    expect(normalizeBarcode('123')).toBeNull()
    expect(normalizeBarcode('')).toBeNull()
    expect(shouldIgnoreDuplicateScan(chobaniEan, chobaniEan, false)).toBe(true)
    expect(shouldIgnoreDuplicateScan(null, chobaniEan, true)).toBe(true)
    expect(shouldIgnoreDuplicateScan(null, chobaniEan, false)).toBe(false)
  })
})

describe('packaged candidate mapping', () => {
  it('prefers explicit per-serving nutrients without mixing 100g macros', () => {
    const candidate = candidateFromProviderSnapshot(
      snapshot({
        nutrients: {
          energyKcalServing: 120,
          energyKcal100g: 80,
          proteinServing: null,
          protein100g: 8,
          carbsServing: 9,
          carbs100g: 6,
          fatServing: 4,
          fat100g: 2.7,
          fiberServing: null,
          fiber100g: 1,
        },
      }),
    )
    expect(candidate.sourceBasis.kind).toBe('per_serving')
    expect(candidate.nutrition.calories).toBe(120)
    expect(candidate.nutrition.protein).toBeNull()
    expect(candidate.nutrition.fiber).toBeNull()
    expect(candidate.complete).toBe(true)
  })

  it('derives per-serving values from per-100g when serving grams are known', () => {
    const candidate = candidateFromProviderSnapshot(
      snapshot({
        nutrients: {
          energyKcalServing: null,
          energyKcal100g: 200,
          proteinServing: null,
          protein100g: 20,
          carbsServing: null,
          carbs100g: 10,
          fatServing: null,
          fat100g: 8,
          fiberServing: null,
          fiber100g: 2,
        },
        servingQuantityGrams: 40,
        servingSizeText: '40g',
      }),
    )
    expect(candidate.sourceBasis.kind).toBe('per_100g_derived')
    expect(candidate.nutrition.calories).toBe(80)
    expect(candidate.nutrition.protein).toBe(8)
    expect(candidate.serving.grams).toBe(40)
  })

  it('does not invent a serving when only per-100g data exists', () => {
    const candidate = candidateFromProviderSnapshot(
      snapshot({
        servingQuantityGrams: null,
        servingSizeText: '2 slices',
        nutrients: {
          energyKcalServing: null,
          energyKcal100g: 250,
          proteinServing: null,
          protein100g: 10,
          carbsServing: null,
          carbs100g: 40,
          fatServing: null,
          fat100g: 5,
          fiberServing: null,
          fiber100g: 3,
        },
      }),
    )
    expect(candidate.sourceBasis.kind).toBe('per_100g_unspecified')
    expect(candidate.nutrition.calories).toBeNull()
    expect(candidate.complete).toBe(false)
    expect(candidate.warnings.join(' ')).toMatch(/per 100 g/i)
    const hundred = applyHundredGramServing(candidate)
    expect(hundred.serving.grams).toBe(100)
    expect(hundred.nutrition.calories).toBe(250)
    const forty = applyGramServing(candidate, 40)
    expect(forty.nutrition.calories).toBe(100)
  })

  it('leaves missing calories incomplete and does not block on optional macros', () => {
    const candidate = candidateFromProviderSnapshot(
      snapshot({
        nutrients: {
          energyKcalServing: null,
          energyKcal100g: null,
          proteinServing: null,
          protein100g: null,
          carbsServing: null,
          carbs100g: null,
          fatServing: null,
          fat100g: null,
          fiberServing: null,
          fiber100g: null,
        },
      }),
    )
    expect(candidate.complete).toBe(false)
    expect(validatePackagedReview({ barcode: chobaniUpc, name: 'Yogurt', servingUnit: 'serving', calories: null })).toEqual(
      [expect.objectContaining({ path: 'calories', message: 'Calories required.' })],
    )
    expect(validatePackagedReview({ barcode: chobaniUpc, name: 'Yogurt', servingUnit: 'serving', calories: 120 })).toEqual([])
  })
})

describe('open food facts provider', () => {
  it('maps a valid v3 product and distinguishes not found vs unavailable', async () => {
    const ok = createOpenFoodFactsProvider(async () =>
      new Response(
        JSON.stringify({
          status: 'success',
          product: {
            code: chobaniEan,
            product_name: 'Chobani Greek Yogurt',
            brands: 'Chobani',
            serving_size: '150 g',
            serving_quantity: 150,
            nutriments: { 'energy-kcal_serving': 120, proteins_serving: 12 },
          },
        }),
        { status: 200 },
      ),
    )
    const found = await ok.lookupBarcode(chobaniEan)
    expect(found.status).toBe('found')
    if (found.status === 'found') {
      expect(found.candidate.name).toBe('Chobani Greek Yogurt')
      expect(found.candidate.nutrition.calories).toBe(120)
    }

    const missing = createOpenFoodFactsProvider(async () => new Response('', { status: 404 }))
    expect(await missing.lookupBarcode(chobaniEan)).toEqual({ status: 'not_found' })

    const down = createOpenFoodFactsProvider(async () => new Response('', { status: 503 }))
    const unavailable = await down.lookupBarcode(chobaniEan)
    expect(unavailable.status).toBe('unavailable')

    const malformed = createOpenFoodFactsProvider(async () => new Response('{', { status: 200 }))
    expect((await malformed.lookupBarcode(chobaniEan)).status).toBe('unavailable')

    const emptyProduct = createOpenFoodFactsProvider(
      async () => new Response(JSON.stringify({ status: 1, product: {} }), { status: 200 }),
    )
    expect(await emptyProduct.lookupBarcode(chobaniEan)).toEqual({ status: 'not_found' })
  })
})

describe('camera scanner UX', () => {
  it('stops the camera on close/decode and offers permission plus manual fallback', () => {
    const scanner = readFileSync('src/features/nutrition/BarcodeScanner.tsx', 'utf8')
    const panels = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    expect(scanner).toContain("facingMode: { ideal: 'environment' }")
    expect(scanner).toContain('controls.stop')
    expect(scanner).toContain('getTracks()')
    expect(scanner).toContain('NotAllowedError')
    expect(scanner).toContain('Enter barcode manually')
    expect(scanner).toContain('lastRef.current === text')
    expect(scanner).not.toContain('BarcodeFormat.QR_CODE')
    expect(scanner).toContain('UPC_A')
    expect(scanner).toContain('EAN_13')
    expect(panels).toContain('Scan barcode')
    expect(panels).toContain('Save & Log')
    expect(panels).toContain('Create food for this barcode')
    expect(panels).toContain('Product lookup is temporarily unavailable')
  })
})

describe('barcode API routing and uniqueness', () => {
  it('owns barcode lookup and save on the existing dispatcher', () => {
    expect(matchHealthApiRoute('/api/nutrition/barcode/034000470693')).toBe('nutrition-barcode')
    expect(matchHealthApiRoute('/api/nutrition/barcode/save')).toBe('nutrition-barcode')
    expect(GET_FOOD_BY_BARCODES_SQL).toContain('barcode = ANY($1::text[])')
    expect(INSERT_FOOD_SQL).toContain('barcode')
    expect(UPDATE_FOOD_SQL).not.toContain('nutrition_entries')
    const sql = readFileSync('migrations/0009_nutrition_barcode_normalized.sql', 'utf8')
    expect(sql).toContain('nutrition_foods_barcode_normalized_uidx')
    expect(sql).not.toMatch(/\buser_id\b/)
    const barcodeHandler = readFileSync('server/handlers/nutrition-barcode.ts', 'utf8')
    expect(barcodeHandler).not.toContain('home-ai')
    expect(readFileSync('server/nutrition/providers/open-food-facts.ts', 'utf8')).not.toContain('HOME_AI')
  })
})

