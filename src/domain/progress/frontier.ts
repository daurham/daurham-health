import { compareSetChronology } from './exercise-performance.js'
import type { AnalyzableTimedSet, AnalyzableWorkingSet } from './types.js'

export function dominatesLoadReps(left: AnalyzableWorkingSet, right: AnalyzableWorkingSet): boolean {
  return (
    left.weightKg >= right.weightKg &&
    left.reps >= right.reps &&
    (left.weightKg > right.weightKg || left.reps > right.reps)
  )
}

export function sameLoadReps(left: AnalyzableWorkingSet, right: AnalyzableWorkingSet): boolean {
  return left.weightKg === right.weightKg && left.reps === right.reps
}

export function expandsFrontier(
  candidate: AnalyzableWorkingSet,
  previous: readonly AnalyzableWorkingSet[],
): boolean {
  if (previous.some((set) => dominatesLoadReps(set, candidate) || sameLoadReps(set, candidate))) {
    return false
  }
  return true
}

export function performanceFrontier(sets: readonly AnalyzableWorkingSet[]): AnalyzableWorkingSet[] {
  const ordered = [...sets].sort(compareSetChronology)
  const frontier: AnalyzableWorkingSet[] = []
  for (const set of ordered) {
    if (frontier.some((existing) => dominatesLoadReps(existing, set) || sameLoadReps(existing, set))) {
      continue
    }
    const kept = frontier.filter((existing) => !dominatesLoadReps(set, existing))
    kept.push(set)
    frontier.length = 0
    frontier.push(...kept)
  }
  return [...frontier].sort((left, right) => {
    if (left.weightKg !== right.weightKg) {
      return left.weightKg - right.weightKg
    }
    return right.reps - left.reps
  })
}

export function dominatesLoadDuration(left: AnalyzableTimedSet, right: AnalyzableTimedSet): boolean {
  return (
    left.weightKg >= right.weightKg &&
    left.durationSec >= right.durationSec &&
    (left.weightKg > right.weightKg || left.durationSec > right.durationSec)
  )
}

export function sameLoadDuration(left: AnalyzableTimedSet, right: AnalyzableTimedSet): boolean {
  return left.weightKg === right.weightKg && left.durationSec === right.durationSec
}

export function expandsTimedFrontier(
  candidate: AnalyzableTimedSet,
  previous: readonly AnalyzableTimedSet[],
): boolean {
  return !previous.some((set) => dominatesLoadDuration(set, candidate) || sameLoadDuration(set, candidate))
}

export function timedPerformanceFrontier(sets: readonly AnalyzableTimedSet[]): AnalyzableTimedSet[] {
  const ordered = [...sets].sort(compareSetChronology)
  const frontier: AnalyzableTimedSet[] = []
  for (const set of ordered) {
    if (frontier.some((existing) => dominatesLoadDuration(existing, set) || sameLoadDuration(existing, set))) {
      continue
    }
    const kept = frontier.filter((existing) => !dominatesLoadDuration(set, existing))
    kept.push(set)
    frontier.length = 0
    frontier.push(...kept)
  }
  return [...frontier].sort((left, right) => {
    if (left.weightKg !== right.weightKg) {
      return left.weightKg - right.weightKg
    }
    return right.durationSec - left.durationSec
  })
}
