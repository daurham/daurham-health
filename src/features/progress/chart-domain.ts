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


export type NiceIntegerAxis = {
  domain: [number, number]
  ticks: number[]
}

export function niceIntegerAxis(values: readonly number[], desiredTicks = 5): NiceIntegerAxis | null {
  const finite = values.filter((value) => Number.isFinite(value))
  if (finite.length === 0) {
    return null
  }
  const min = Math.min(...finite)
  const max = Math.max(...finite)
  const spread = max - min
  const baseSpan = spread > 0 ? spread : Math.max(Math.abs(max) * 0.1, 10)
  const roughStep = baseSpan / Math.max(2, desiredTicks - 1)
  const power = 10 ** Math.floor(Math.log10(Math.max(roughStep, 1)))
  const normalized = roughStep / power
  const niceFactor = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  const step = Math.max(1, niceFactor * power)
  let low = Math.floor((min - (spread === 0 ? baseSpan / 2 : 0)) / step) * step
  let high = Math.ceil((max + (spread === 0 ? baseSpan / 2 : 0)) / step) * step
  if (low === high) {
    high = low + step
  }
  if (min >= 0 && low < 0) {
    low = 0
  }
  const ticks: number[] = []
  for (let value = low; value <= high + step / 2 && ticks.length < 20; value += step) {
    ticks.push(Math.round(value))
  }
  return { domain: [low, high], ticks }
}
