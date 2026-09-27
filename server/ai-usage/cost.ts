const INPUT_USD_PER_MILLION = 0.15
const OUTPUT_USD_PER_MILLION = 0.6

/** Token price, clamped so finalization cannot spend more than the reservation. */
export function boundedProviderCostUsd(
  inputTokens: number | null,
  outputTokens: number | null,
  reservedUsd: number,
): number {
  if (inputTokens == null && outputTokens == null) {
    return reservedUsd
  }
  const input = inputTokens ?? 0
  const output = outputTokens ?? 0
  const micro = Math.round((input * INPUT_USD_PER_MILLION + output * OUTPUT_USD_PER_MILLION) * 1_000_000) / 1_000_000
  return Math.min(reservedUsd, Math.max(0, micro))
}
