export function median(values: readonly number[]): number | null {
  if (values.length === 0) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) {
    return sorted[middle]!
  }
  return (sorted[middle - 1]! + sorted[middle]!) / 2
}

export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return null
  }
  return ((current - previous) / previous) * 100
}

export function pairwiseSlopesPerDay(points: ReadonlyArray<{ day: number; value: number }>): number[] {
  const slopes: number[] = []
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      const left = points[i]!
      const right = points[j]!
      const deltaDays = right.day - left.day
      if (deltaDays > 0) {
        slopes.push((right.value - left.value) / deltaDays)
      }
    }
  }
  return slopes
}

export function theilSenSlopePerDay(points: ReadonlyArray<{ day: number; value: number }>): number | null {
  return median(pairwiseSlopesPerDay(points))
}

/**
 * Hyndman–Fan type 7 percentile: position `(n - 1) * p` on the sorted sample,
 * with linear interpolation between neighbors. This is slope dispersion, not a
 * confidence interval.
 */
export function linearPercentile(values: readonly number[], percentile: number): number | null {
  if (values.length === 0 || percentile < 0 || percentile > 1) {
    return null
  }
  const sorted = [...values].sort((left, right) => left - right)
  if (sorted.length === 1) {
    return sorted[0]!
  }
  const position = (sorted.length - 1) * percentile
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  const low = sorted[lower]!
  if (lower === upper) {
    return low
  }
  const weight = position - lower
  return low * (1 - weight) + sorted[upper]! * weight
}
