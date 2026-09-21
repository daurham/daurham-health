import { candidateFromProviderSnapshot } from '../../../src/domain/nutrition/packaged.js'
import { loadLocalEnv } from '../../env.js'
import {
  snapshotFromUnknownProduct,
  type PackagedFoodProvider,
  type PackagedLookupResult,
  type PackagedProviderFetch,
} from './types.js'

const DEFAULT_BASE = 'https://world.openfoodfacts.org'
const FIELDS = [
  'code',
  'product_name',
  'product_name_en',
  'generic_name',
  'brands',
  'serving_size',
  'serving_quantity',
  'nutriments',
].join(',')
const TIMEOUT_MS = 8000

export function openFoodFactsUserAgent(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.OPEN_FOOD_FACTS_USER_AGENT?.trim()
  if (configured) {
    return configured
  }
  return 'DaurhamHealth/1.0 (personal nutrition app)'
}

export function openFoodFactsBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.OPEN_FOOD_FACTS_BASE_URL?.trim() || DEFAULT_BASE).replace(/\/+$/, '')
}

export function createOpenFoodFactsProvider(
  fetchImpl: PackagedProviderFetch = fetch,
  env: NodeJS.ProcessEnv = process.env,
): PackagedFoodProvider {
  return {
    id: 'open_food_facts',
    async lookupBarcode(barcode: string): Promise<PackagedLookupResult> {
      await loadLocalEnv()
      const url = `${openFoodFactsBaseUrl(env)}/api/v3/product/${encodeURIComponent(barcode)}?fields=${FIELDS}`
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
      try {
        const response = await fetchImpl(url, {
          headers: {
            Accept: 'application/json',
            'User-Agent': openFoodFactsUserAgent(env),
          },
          signal: controller.signal,
        })
        if (response.status === 404) {
          return { status: 'not_found' }
        }
        if (response.status === 429 || response.status >= 500) {
          return { status: 'unavailable', message: 'Product lookup is temporarily unavailable.' }
        }
        if (!response.ok) {
          return { status: 'unavailable', message: 'Product lookup is temporarily unavailable.' }
        }
        let body: unknown
        try {
          body = await response.json()
        } catch {
          return { status: 'unavailable', message: 'Product lookup is temporarily unavailable.' }
        }
        const product = productFromV3(body)
        if (!product) {
          return { status: 'not_found' }
        }
        const snapshot = snapshotFromUnknownProduct(product, barcode)
        return {
          status: 'found',
          candidate: candidateFromProviderSnapshot(snapshot, 'open_food_facts'),
        }
      } catch {
        return { status: 'unavailable', message: 'Product lookup is temporarily unavailable.' }
      } finally {
        clearTimeout(timer)
      }
    },
  }
}

function productFromV3(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return null
  }
  const record = body as Record<string, unknown>
  const status = record.status
  if (status === 0 || status === 'failure' || status === 'not_found') {
    return null
  }
  const product = record.product
  if (!product || typeof product !== 'object' || Array.isArray(product)) {
    return null
  }
  const asRecord = product as Record<string, unknown>
  if (Object.keys(asRecord).length === 0) {
    return null
  }
  return asRecord
}

export const openFoodFactsProvider = createOpenFoodFactsProvider()
