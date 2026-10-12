/**
 * Standard paid-tier Gemini 3.5 prices as of October 2026, USD per million tokens.
 * Other model names retain legacy rates until their pricing is verified.
 */
const LEGACY_INPUT_USD_PER_MILLION = 0.15
const LEGACY_OUTPUT_USD_PER_MILLION = 0.6

export function providerPricesPerMillion(model?: string): { input: number; output: number } {
  if (model && /^gemini-3\.5-flash-lite(?:$|-)/.test(model)) return { input: 0.30, output: 2.50 }
  if (model && /^gemini-3\.5-flash(?:$|-)/.test(model)) return { input: 1.50, output: 9.00 }
  return { input: LEGACY_INPUT_USD_PER_MILLION, output: LEGACY_OUTPUT_USD_PER_MILLION }
}

/** Token cost in USD, clamped so finalization cannot exceed the request reservation. */
export function boundedProviderCostUsd(
  inputTokens: number | null,
  outputTokens: number | null,
  reservedUsd: number,
  model?: string,
): number {
  if (inputTokens == null && outputTokens == null) return reservedUsd
  const { input, output } = providerPricesPerMillion(model)
  const costUsd = Math.round((inputTokens ?? 0) * input + (outputTokens ?? 0) * output) / 1_000_000
  return Math.min(reservedUsd, Math.max(0, costUsd))
}
