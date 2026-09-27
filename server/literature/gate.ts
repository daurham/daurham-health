import { createHash } from 'node:crypto'
import { LITERATURE_PROMPT_VERSION, LITERATURE_REQUEST_TYPE, LITERATURE_RETRIEVAL_VERSION } from '../../src/domain/literature/config.js'
import type { LiteratureSynthesisBlock } from '../../src/domain/literature/types.js'
import { readAiUsageConfig, type AiUsageConfig } from '../ai-usage/config.js'
import { createSqlAiUsageLedger, neonAiUsageSession, type AiUsageLedger } from '../ai-usage/ledger.js'

export type LiteratureGateDecision =
  | { ok: true; cached: LiteratureSynthesisBlock[] | null; usageId: string | null }
  | { ok: false; reason: 'budget' | 'rate' }

export type LiteratureGate = {
  take(key: string, now: number, model: string): Promise<LiteratureGateDecision>
  store(key: string, blocks: LiteratureSynthesisBlock[]): void
  complete(usageId: string, actualCostUsd: number | null, inputTokens: number | null, outputTokens: number | null, now: number): Promise<void>
  uncertain(usageId: string, now: number): Promise<void>
  release(usageId: string, now: number): Promise<void>
}

export function literatureCacheKey(query: string, sourceFingerprint: string, model: string): string {
  return createHash('sha256')
    .update([LITERATURE_RETRIEVAL_VERSION, query, sourceFingerprint, LITERATURE_PROMPT_VERSION, model].join('\n'))
    .digest('hex')
}

export function createLiteratureGate(options?: {
  ledger?: AiUsageLedger
  config?: AiUsageConfig
  budgetUsd?: number
  minIntervalMs?: number
  maxPerMinute?: number
  maxRequestCostUsd?: number
}): LiteratureGate {
  const config = options?.config ?? readAiUsageConfig()
  const ledger = options?.ledger ?? createSqlAiUsageLedger(neonAiUsageSession())
  const budgetUsd = options?.budgetUsd ?? config.monthlyBudgetUsd
  const minIntervalMs = options?.minIntervalMs ?? config.minIntervalMs
  const maxPerMinute = options?.maxPerMinute ?? config.maxPerMinute
  const maxRequestCostUsd = options?.maxRequestCostUsd ?? config.literatureMaxRequestCostUsd
  const cache = new Map<string, LiteratureSynthesisBlock[]>()
  return {
    async take(key, now, model) {
      const cached = cache.get(key) ?? null
      if (cached) {
        return { ok: true, cached, usageId: null }
      }
      const reserved = await ledger.reserve({
        requestType: LITERATURE_REQUEST_TYPE,
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
    store(key, blocks) {
      cache.set(key, blocks)
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

let productionGate: LiteratureGate | null = null

export function getLiteratureGate(): LiteratureGate {
  productionGate ??= createLiteratureGate()
  return productionGate
}
