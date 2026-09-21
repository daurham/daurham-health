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

export function theilSenSlopePerDay(points: ReadonlyArray<{ day: number; value: number }>): number | null {
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
  return median(slopes)
}
