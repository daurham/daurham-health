import type { LiteratureSearchResponse } from '@/domain/literature'
import { healthFetch, readApiError } from '@/lib'

export async function searchLiterature(query: string): Promise<LiteratureSearchResponse> {
  const response = await healthFetch('/api/ask-health/literature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as LiteratureSearchResponse
}
