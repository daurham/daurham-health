/** Provider billing uses UTC months. Health's America/Phoenix calendar is not the billing clock. */
export const AI_USAGE_BILLING_TIMEZONE = 'UTC'

export const AI_USAGE_DEFAULT_MONTHLY_BUDGET_USD = 3
export const AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD = 0.05
export const AI_USAGE_MIN_INTERVAL_MS = 1_500
export const AI_USAGE_MAX_PER_MINUTE = 8

export type AiUsageConfig = {
  monthlyBudgetUsd: number
  warningBudgetUsd: number | null
  askHealthMaxRequestCostUsd: number
  weeklyCoachMaxRequestCostUsd: number
  experimentSuggestionMaxRequestCostUsd: number
  minIntervalMs: number
  maxPerMinute: number
}

export function readAiUsageConfig(env: NodeJS.ProcessEnv = process.env): AiUsageConfig {
  return {
    monthlyBudgetUsd: readUsd(env.AI_MONTHLY_BUDGET_USD, AI_USAGE_DEFAULT_MONTHLY_BUDGET_USD),
    warningBudgetUsd: readOptionalUsd(env.AI_WARNING_BUDGET_USD),
    askHealthMaxRequestCostUsd: readUsd(env.AI_ASK_HEALTH_MAX_REQUEST_COST_USD, AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD),
    weeklyCoachMaxRequestCostUsd: readUsd(env.AI_WEEKLY_COACH_MAX_REQUEST_COST_USD, AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD),
    experimentSuggestionMaxRequestCostUsd: readUsd(
      env.AI_EXPERIMENT_SUGGESTION_MAX_REQUEST_COST_USD,
      AI_USAGE_DEFAULT_MAX_REQUEST_COST_USD,
    ),
    minIntervalMs: readCount(env.AI_ASK_HEALTH_MIN_INTERVAL_MS, AI_USAGE_MIN_INTERVAL_MS),
    maxPerMinute: readCount(env.AI_ASK_HEALTH_MAX_PER_MINUTE, AI_USAGE_MAX_PER_MINUTE),
  }
}

export function usdText(value: number): string {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error('Invalid USD amount')
  }
  return value.toFixed(6)
}

export function utcMonthWindow(now: number): { key: string; start: string; end: string } {
  const date = new Date(now)
  const year = date.getUTCFullYear()
  const month = date.getUTCMonth()
  return {
    key: `${year}-${String(month + 1).padStart(2, '0')}`,
    start: new Date(Date.UTC(year, month, 1)).toISOString(),
    end: new Date(Date.UTC(year, month + 1, 1)).toISOString(),
  }
}

function readUsd(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim())
  if (!raw?.trim() || !Number.isFinite(value) || value < 0) {
    return fallback
  }
  return value
}

function readOptionalUsd(raw: string | undefined): number | null {
  if (!raw?.trim()) {
    return null
  }
  const value = Number(raw.trim())
  return Number.isFinite(value) && value >= 0 ? value : null
}

function readCount(raw: string | undefined, fallback: number): number {
  const value = Number(raw?.trim())
  if (!raw?.trim() || !Number.isInteger(value) || value < 0) {
    return fallback
  }
  return value
}
