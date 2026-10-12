import { describe, expect, it } from 'vitest'
import { boundedProviderCostUsd } from '../server/ai-usage/cost.ts'
import { readAiUsageConfig } from '../server/ai-usage/config.ts'
import { buildAiUsageReport, type AiUsageRow } from '../server/ai-usage/report.ts'

describe('AI usage diagnostic report', () => {
  it('charges fractional cents for ordinary token volumes instead of clamping every request at five cents', () => {
    expect(boundedProviderCostUsd(12912, 13436, 0.05)).toBe(0.009998)
    expect(boundedProviderCostUsd(400, 350, 0.05)).toBe(0.00027)
    expect(boundedProviderCostUsd(0, 10_000, 0.05)).toBe(0.006)
    expect(boundedProviderCostUsd(10_000_000, 10_000_000, 0.05)).toBe(0.05)
    expect(boundedProviderCostUsd(null, null, 0.05)).toBe(0.05)
  })

  it('separates ledger reservations from token-priced estimates without changing budget balances', () => {
    const rows: AiUsageRow[] = [
      { request_type: 'nutrition_description', status: 'completed', requests: 37, recorded_usd: '1.8500', token_input: '12912', token_output: '13436', missing_tokens: 0 },
      { request_type: 'ask_health', status: 'completed', requests: 12, recorded_usd: '0.6000', token_input: '43468', token_output: '5233', missing_tokens: 0 },
      { request_type: 'nutrition_meal_photo', status: 'completed', requests: 6, recorded_usd: '0.3000', token_input: '9565', token_output: '1050', missing_tokens: 0 },
      { request_type: 'ask_health', status: 'uncertain', requests: 4, recorded_usd: '0.2000', token_input: 0, token_output: 0, missing_tokens: 0 },
      { request_type: 'weekly_coach', status: 'completed', requests: 1, recorded_usd: '0.0500', token_input: '2523', token_output: '508', missing_tokens: 0 },
    ]
    const report = buildAiUsageReport(rows, readAiUsageConfig({ AI_MONTHLY_BUDGET_USD: '3' }), Date.parse('2026-10-11T12:00:00Z'))
    expect(report.month).toBe('2026-10')
    expect(report.calls).toBe(60)
    expect(report.budgetConsumedUsd).toBe(3)
    expect(report.remainingUsd).toBe(0)
    expect(report.uncertainUsd).toBe(0.2)
    expect(report.tokenEstimateUsd).toBeCloseTo(0.022406, 5)
    expect(report.recordedAboveTokenEstimateUsd).toBeGreaterThan(2.7)
  })

  it('does not assign phantom token costs to unresolved or unmetered rows', () => {
    const report = buildAiUsageReport([
      { request_type: 'ask_health', status: 'completed', requests: 1, recorded_usd: '0.05', token_input: '0', token_output: '0', missing_tokens: 1 },
      { request_type: 'ask_health', status: 'reserved', requests: 1, recorded_usd: '0.05', token_input: '0', token_output: '0', missing_tokens: 0 },
      { request_type: 'ask_health', status: 'released', requests: 1, recorded_usd: '0', token_input: '0', token_output: '0', missing_tokens: 0 },
    ], readAiUsageConfig({}), Date.parse('2026-10-11T12:00:00Z'))
    expect(report.tokenEstimateUsd).toBe(0)
    expect(report.completedWithoutTokenCountsUsd).toBe(0.05)
    expect(report.uncertainUsd).toBe(0.05)
    expect(report.recordedAboveTokenEstimateUsd).toBe(0)
  })
})
