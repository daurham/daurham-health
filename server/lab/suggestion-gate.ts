import { createHash } from 'node:crypto'
import { EXPERIMENT_SUGGESTION_REQUEST_TYPE } from '../../src/domain/experiment-suggestions/config.js'
import type { SuggestionDraft } from '../../src/domain/experiment-suggestions/types.js'
import { readAiUsageConfig, type AiUsageConfig } from '../ai-usage/config.js'
import { createSqlAiUsageLedger, neonAiUsageSession, type AiUsageLedger } from '../ai-usage/ledger.js'

export type SuggestionGateDecision =
  | { ok: true; cached: SuggestionDraft | null; usageId: string | null }
  | { ok: false; reason: 'budget' | 'rate' }

export type SuggestionGate = {
  take(key: string, now: number, model: string): Promise<SuggestionGateDecision>
  store(key: string, record: SuggestionDraft): void
  complete(usageId: string, actualCostUsd: number | null, inputTokens: number | null, outputTokens: number | null, now: number): Promise<void>
  uncertain(usageId: string, now: number): Promise<void>
  release(usageId: string, now: number): Promise<void>
}

export function suggestionCacheKey(packet: string, promptVersion: string, model: string): string {
  return createHash('sha256').update(`${promptVersion}\n${model}\n${packet}`).digest('hex')
}

export function createSuggestionGate(options?: {
  ledger?: AiUsageLedger
  config?: AiUsageConfig
  budgetUsd?: number
  minIntervalMs?: number
  maxPerMinute?: number
  maxRequestCostUsd?: number
}): SuggestionGate {
  const config = options?.config ?? readAiUsageConfig()
  const ledger = options?.ledger ?? createSqlAiUsageLedger(neonAiUsageSession())
  const budgetUsd = options?.budgetUsd ?? config.monthlyBudgetUsd
  const minIntervalMs = options?.minIntervalMs ?? config.minIntervalMs
  const maxPerMinute = options?.maxPerMinute ?? config.maxPerMinute
  const maxRequestCostUsd = options?.maxRequestCostUsd ?? config.experimentSuggestionMaxRequestCostUsd
  const cache = new Map<string, SuggestionDraft>()
  return {
    async take(key, now, model) {
      const cached = cache.get(key) ?? null
      if (cached) {
        return { ok: true, cached, usageId: null }
      }
      const reserved = await ledger.reserve({
        requestType: EXPERIMENT_SUGGESTION_REQUEST_TYPE,
        provider: 'gemini',
        model,
        requestHash: key,
        reservedCostUsd: maxRequestCostUsd,
        now,
        budgetUsd,
        minIntervalMs,
        maxPerMinute,
      })
      if (!reserved.ok) {
        return reserved
      }
      return { ok: true, cached: null, usageId: reserved.id }
    },
    store(key, record) {
      cache.set(key, record)
    },
    complete(usageId, actualCostUsd, inputTokens, outputTokens, now) {
      return ledger.complete(usageId, actualCostUsd, inputTokens, outputTokens, now)
    },
    uncertain(usageId, now) {
      return ledger.uncertain(usageId, now)
    },
    release(usageId, now) {
      return ledger.release(usageId, now)
    },
  }
}

let productionGate: SuggestionGate | null = null

export function getSuggestionGate(): SuggestionGate {
  productionGate ??= createSuggestionGate()
  return productionGate
}
