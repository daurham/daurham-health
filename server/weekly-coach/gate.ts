import { createHash } from 'node:crypto'
import { WEEKLY_COACH_REQUEST_TYPE } from '../../src/domain/weekly-coach/config.js'
import type { WeeklyCoachCommentary } from '../../src/domain/weekly-coach/types.js'
import { readAiUsageConfig, type AiUsageConfig } from '../ai-usage/config.js'
import { createSqlAiUsageLedger, neonAiUsageSession, type AiUsageLedger } from '../ai-usage/ledger.js'

export type WeeklyCoachGateDecision =
  | { ok: true; cached: WeeklyCoachCommentary | null; usageId: string | null }
  | { ok: false; reason: 'budget' | 'rate' }

export type WeeklyCoachGate = {
  take(key: string, now: number, model: string): Promise<WeeklyCoachGateDecision>
  store(key: string, record: WeeklyCoachCommentary): void
  complete(usageId: string, actualCostUsd: number | null, inputTokens: number | null, outputTokens: number | null, now: number): Promise<void>
  uncertain(usageId: string, now: number): Promise<void>
  release(usageId: string, now: number): Promise<void>
}

export function weeklyCoachCacheKey(packet: string, promptVersion: string, model: string): string {
  return createHash('sha256').update(`${promptVersion}\n${model}\n${packet}`).digest('hex')
}

export function createWeeklyCoachGate(options?: {
  ledger?: AiUsageLedger
  config?: AiUsageConfig
  budgetUsd?: number
  minIntervalMs?: number
  maxPerMinute?: number
  maxRequestCostUsd?: number
}): WeeklyCoachGate {
  const config = options?.config ?? readAiUsageConfig()
  const ledger = options?.ledger ?? createSqlAiUsageLedger(neonAiUsageSession())
  const budgetUsd = options?.budgetUsd ?? config.monthlyBudgetUsd
  const minIntervalMs = options?.minIntervalMs ?? config.minIntervalMs
  const maxPerMinute = options?.maxPerMinute ?? config.maxPerMinute
  const maxRequestCostUsd = options?.maxRequestCostUsd ?? config.weeklyCoachMaxRequestCostUsd
  const cache = new Map<string, WeeklyCoachCommentary>()
  return {
    async take(key, now, model) {
      const cached = cache.get(key) ?? null
      if (cached) {
        return { ok: true, cached, usageId: null }
      }
      const reserved = await ledger.reserve({
        requestType: WEEKLY_COACH_REQUEST_TYPE,
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

let productionGate: WeeklyCoachGate | null = null

export function getWeeklyCoachGate(): WeeklyCoachGate {
  productionGate ??= createWeeklyCoachGate()
  return productionGate
}
