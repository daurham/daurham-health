import { boundedProviderCostUsd } from './cost.js'
import { readAiUsageConfig, utcMonthWindow, type AiUsageConfig } from './config.js'
import { getSql } from '../db.js'

export type AiUsageGroup = {
  requestType: string
  status: string
  requests: number
  budgetConsumedUsd: number
  tokenEstimateUsd: number
  inputTokens: number
  outputTokens: number
  missingTokenCounts: number
}

export type AiUsageReport = {
  month: string
  monthStart: string
  monthEnd: string
  budgetUsd: number
  warningUsd: number | null
  budgetConsumedUsd: number
  remainingUsd: number
  tokenEstimateUsd: number
  uncertainUsd: number
  completedWithoutTokenCountsUsd: number
  recordedAboveTokenEstimateUsd: number
  calls: number
  groups: AiUsageGroup[]
}

export type AiUsageRow = {
  request_type: string
  status: string
  requests: number | string
  recorded_usd: number | string
  token_input: number | string
  token_output: number | string
  missing_tokens: number | string
}

function usd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

function number(value: number | string): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

/** Reconstruct what our hardcoded token price would imply, not the provider's actual invoice. */
export function buildAiUsageReport(rows: AiUsageRow[], config: AiUsageConfig, now = Date.now()): AiUsageReport {
  const window = utcMonthWindow(now)
  const groups = rows.map((row): AiUsageGroup => {
    const inputTokens = number(row.token_input)
    const outputTokens = number(row.token_output)
    return {
      requestType: row.request_type,
      status: row.status,
      requests: number(row.requests),
      budgetConsumedUsd: usd(number(row.recorded_usd)),
      tokenEstimateUsd: row.status === 'completed'
        ? usd(boundedProviderCostUsd(inputTokens, outputTokens, Number.MAX_SAFE_INTEGER))
        : 0,
      inputTokens,
      outputTokens,
      missingTokenCounts: number(row.missing_tokens),
    }
  }).sort((a, b) => b.budgetConsumedUsd - a.budgetConsumedUsd)
  const budgetConsumedUsd = usd(groups.reduce((sum, row) => sum + row.budgetConsumedUsd, 0))
  const tokenEstimateUsd = usd(groups.reduce((sum, row) => sum + row.tokenEstimateUsd, 0))
  const uncertainUsd = usd(groups.filter((row) => row.status === 'uncertain' || row.status === 'reserved')
    .reduce((sum, row) => sum + row.budgetConsumedUsd, 0))
  const completedWithoutTokenCountsUsd = usd(groups.filter((row) => row.status === 'completed')
    .reduce((sum, row) => sum + (row.missingTokenCounts > 0
      ? row.budgetConsumedUsd * (row.missingTokenCounts / Math.max(row.requests, 1))
      : 0), 0))
  return {
    month: window.key,
    monthStart: window.start,
    monthEnd: window.end,
    budgetUsd: config.monthlyBudgetUsd,
    warningUsd: config.warningBudgetUsd,
    budgetConsumedUsd,
    remainingUsd: usd(Math.max(0, config.monthlyBudgetUsd - budgetConsumedUsd)),
    tokenEstimateUsd,
    uncertainUsd,
    completedWithoutTokenCountsUsd,
    recordedAboveTokenEstimateUsd: usd(Math.max(0, budgetConsumedUsd - uncertainUsd - completedWithoutTokenCountsUsd - tokenEstimateUsd)),
    calls: groups.reduce((sum, row) => sum + row.requests, 0),
    groups,
  }
}

/** Owner-only, read-only. Does not send provider requests, clear charges, or expose prompts. */
export async function getAiUsageReport(now = Date.now()): Promise<AiUsageReport> {
  const window = utcMonthWindow(now)
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT request_type, status, COUNT(*)::int AS requests,
      COALESCE(SUM(CASE
        WHEN status = 'completed' THEN actual_cost_usd
        WHEN status IN ('reserved', 'uncertain') THEN reserved_cost_usd
        ELSE 0 END), 0)::text AS recorded_usd,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN input_tokens ELSE 0 END), 0)::text AS token_input,
      COALESCE(SUM(CASE WHEN status = 'completed' THEN output_tokens ELSE 0 END), 0)::text AS token_output,
      COUNT(*) FILTER (WHERE status = 'completed' AND input_tokens IS NULL AND output_tokens IS NULL)::int AS missing_tokens
    FROM ai_usage
    WHERE created_at >= $1::timestamptz AND created_at < $2::timestamptz
    GROUP BY request_type, status`,
    [window.start, window.end],
  )) as AiUsageRow[]
  return buildAiUsageReport(rows, readAiUsageConfig(), now)
}
