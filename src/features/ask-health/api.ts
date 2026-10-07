import type { AskLens } from '@/domain/ask-health'
import type { AskEvidence, AskHealthAnswer } from '@/domain/ask-health'
import type { ProgressRange } from '@/domain/progress'
import type { IntelligenceContextItem } from '@/domain/intelligence'
import { healthFetch, readApiError } from '@/lib'

export type AskHealthResponse = {
  answer: AskHealthAnswer
  evidence: AskEvidence[]
  meta: {
    packetVersion: string
    promptVersion: string
    provider: string
    model: string
    cached: boolean
    asOf: string
    lens: AskLens
    range: ProgressRange
    requestType: string
    context: {
      knows: IntelligenceContextItem[]
      missing: IntelligenceContextItem[]
    }
  }
}

export async function askHealth(input: {
  question: string
  lens: AskLens
  range: ProgressRange
  asOf: string
  conversation: Array<{ role: 'user' | 'assistant'; text: string }>
}): Promise<AskHealthResponse> {
  const response = await healthFetch('/api/ask-health', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    throw new Error(await readApiError(response))
  }
  return (await response.json()) as AskHealthResponse
}
