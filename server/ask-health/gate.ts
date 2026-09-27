import { createHash } from 'node:crypto'
import { readAiUsageConfig, type AiUsageConfig } from '../ai-usage/config.js'
import { createSqlAiUsageLedger, neonAiUsageSession, type AiUsageLedger } from '../ai-usage/ledger.js'
import { createMemoryAiUsageLedger } from '../ai-usage/memory.js'
import type { AskEvidence, AskHealthAnswer } from '../../src/domain/ask-health/types.js'

export type AskHealthCacheRecord = {
  answer: AskHealthAnswer
  evidence: AskEvidence[]
}

export type AskHealthGateDecision =
  | { ok: true; cached: AskHealthCacheRecord | null; usageId: string | null }
  | { ok: false; reason: 'budget' | 'rate' }

export type AskHealthGate = {
  take(key: string, now: number, model: string): Promise<AskHealthGateDecision>
  store(key: string, record: AskHealthCacheRecord): void
  complete(usageId: string, actualCostUsd: number | null, inputTokens: number | null, outputTokens: number | null, now: number): Promise<void>
  uncertain(usageId: string, now: number): Promise<void>
  release(usageId: string, now: number): Promise<void>
}

export function createAskHealthGate(options?: {
  ledger?: AiUsageLedger
  config?: AiUsageConfig
  budgetUsd?: number
  minIntervalMs?: number
  maxPerMinute?: number
  maxRequestCostUsd?: number
}): AskHealthGate {
  const config = options?.config ?? readAiUsageConfig()
  const budgetUsd = options?.budgetUsd ?? config.monthlyBudgetUsd
  const minIntervalMs = options?.minIntervalMs ?? config.minIntervalMs
  const maxPerMinute = options?.maxPerMinute ?? config.maxPerMinute
  const maxRequestCostUsd = options?.maxRequestCostUsd ?? config.askHealthMaxRequestCostUsd
  const ledger = options?.ledger ?? createMemoryAiUsageLedger()
  const cache = new Map<string, AskHealthCacheRecord>()

  return {
    async take(key, now, model) {
      const cached = cache.get(key) ?? null
      if (cached) {
        return { ok: true, cached, usageId: null }
      }
      const reserved = await ledger.reserve({
        requestType: 'ask_health',
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

let productionGate: AskHealthGate | null = null

/** Process-local response cache. Monthly budget and provider rate live in ai_usage. */
export function getAskHealthGate(): AskHealthGate {
  productionGate ??= createAskHealthGate({ ledger: createSqlAiUsageLedger(neonAiUsageSession()) })
  return productionGate
}

export function askHealthCacheKey(parts: readonly string[]): string {
  return createHash('sha256').update(parts.join('\n')).digest('hex')
}
