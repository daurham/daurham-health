/** Finite chart bounds. Non-finite values are omitted so axes never become NaN or Infinity. */
export function finiteChartDomain(values: readonly number[]): [number, number] | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) {
    return null
  }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const mid = (min + max) / 2
  const spread = max - min
  const pad = Math.max(spread * 0.2, Math.abs(mid) * 0.02, 2)
  return [min - pad, max + pad]
}
