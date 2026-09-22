import { RHO_MODERATE, RHO_STRONG, RHO_WEAK, SAMPLE_TIER_LARGER, SAMPLE_TIER_MODERATE } from './config.js'
import type { AssociationDirection, AssociationStrength, SampleTier } from './types.js'

export function averageRanks(values: readonly number[]): number[] {
  const indexed = values.map((value, index) => ({ value, index }))
  indexed.sort((left, right) => left.value - right.value || left.index - right.index)
  const ranks = new Array<number>(values.length)
  let cursor = 0
  while (cursor < indexed.length) {
    let end = cursor
    while (end + 1 < indexed.length && indexed[end + 1]!.value === indexed[cursor]!.value) {
      end += 1
    }
    const average = (cursor + 1 + end + 1) / 2
    for (let index = cursor; index <= end; index += 1) {
      ranks[indexed[index]!.index] = average
    }
    cursor = end + 1
  }
  return ranks
}

/** Spearman rho via Pearson correlation of average ranks. Ties share a rank. */
export function spearmanRho(xs: readonly number[], ys: readonly number[]): number | null {
  if (xs.length !== ys.length || xs.length < 2) {
    return null
  }
  const rankX = averageRanks(xs)
  const rankY = averageRanks(ys)
  const meanX = rankX.reduce((sum, value) => sum + value, 0) / rankX.length
  const meanY = rankY.reduce((sum, value) => sum + value, 0) / rankY.length
  let covariance = 0
  let varianceX = 0
  let varianceY = 0
  for (let index = 0; index < rankX.length; index += 1) {
    const dx = rankX[index]! - meanX
    const dy = rankY[index]! - meanY
    covariance += dx * dy
    varianceX += dx * dx
    varianceY += dy * dy
  }
  if (varianceX === 0 || varianceY === 0) {
    return null
  }
  return covariance / Math.sqrt(varianceX * varianceY)
}

export function associationStrength(rho: number): AssociationStrength | null {
  const magnitude = Math.abs(rho)
  if (magnitude < RHO_WEAK) {
    return null
  }
  if (magnitude < RHO_MODERATE) {
    return 'weak'
  }
  if (magnitude < RHO_STRONG) {
    return 'moderate'
  }
  return 'strong'
}

export function associationDirection(rho: number | null, strength: AssociationStrength | null): AssociationDirection | null {
  if (rho == null) {
    return null
  }
  if (strength == null) {
    return 'neutral'
  }
  if (rho > 0) {
    return 'positive'
  }
  if (rho < 0) {
    return 'negative'
  }
  return 'neutral'
}

export function sampleTierFor(size: number): SampleTier | null {
  if (size >= SAMPLE_TIER_LARGER) {
    return 'larger_sample'
  }
  if (size >= SAMPLE_TIER_MODERATE) {
    return 'moderate_sample'
  }
  if (size >= 20) {
    return 'limited_evidence'
  }
  return null
}
