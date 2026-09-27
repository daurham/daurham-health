import { retainLiteratureSources } from '../../src/domain/literature/sources.js'
import type { LiteratureRecord } from '../../src/domain/literature/types.js'

export const EUROPE_PMC_SEARCH_URL = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
export const EUROPE_PMC_PAGE_SIZE = 8
export const EUROPE_PMC_TIMEOUT_MS = 12_000

export class LiteratureProviderError extends Error {
  readonly code: 'timeout' | 'unavailable'

  constructor(code: 'timeout' | 'unavailable') {
    super(code)
    this.name = 'LiteratureProviderError'
    this.code = code
  }
}

export function europePmcSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query: `(${query}) AND SRC:MED AND HAS_ABSTRACT:Y`,
    format: 'json',
    resultType: 'core',
    pageSize: String(EUROPE_PMC_PAGE_SIZE),
  })
  return `${EUROPE_PMC_SEARCH_URL}?${params.toString()}`
}

export async function fetchEuropePmc(query: string, fetchImpl: typeof fetch = fetch): Promise<LiteratureRecord[]> {
  const url = europePmcSearchUrl(query)
  if (!url.startsWith(`${EUROPE_PMC_SEARCH_URL}?`)) {
    throw new LiteratureProviderError('unavailable')
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), EUROPE_PMC_TIMEOUT_MS)
  try {
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new LiteratureProviderError('unavailable')
    }
    let payload: unknown
    try {
      payload = await response.json()
    } catch {
      throw new LiteratureProviderError('unavailable')
    }
    return retainLiteratureSources(payload)
  } catch (error) {
    if (error instanceof LiteratureProviderError) {
      throw error
    }
    if (error instanceof Error && error.name === 'AbortError') {
      throw new LiteratureProviderError('timeout')
    }
    throw new LiteratureProviderError('unavailable')
  } finally {
    clearTimeout(timer)
  }
}
