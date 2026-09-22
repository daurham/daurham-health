import { SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES, SLEEP_PARTIAL_SOURCE_RATIO, SLEEP_SOURCE_PRIORITY } from './config.js'
import type { SleepNightCandidate } from './nights.js'
import { compareSleepSourcePriority } from './sources.js'

export type SleepArbitrationDecision = {
  sleepDate: string
  selected: SleepNightCandidate | null
  alternatives: SleepNightCandidate[]
  reason: 'actual_sleep_priority' | 'in_bed_only' | 'none'
  topPriorityAbsent: boolean
  suspiciousPartialPreferred: boolean
  longestAlternativeMinutes: number | null
  chosenRatio: number | null
}

function usableActual(candidates: readonly SleepNightCandidate[]): SleepNightCandidate[] {
  return candidates.filter((item) => item.hasActualSleep && item.totalSleepMinutes != null && item.totalSleepMinutes > 0)
}

function usableInBed(candidates: readonly SleepNightCandidate[]): SleepNightCandidate[] {
  return candidates.filter((item) => !item.hasActualSleep && item.timeInBedMinutes != null && item.timeInBedMinutes > 0)
}

function pickPreferred(candidates: readonly SleepNightCandidate[]): SleepNightCandidate | null {
  if (candidates.length === 0) {
    return null
  }
  return [...candidates].sort((left, right) => {
    const bySource = compareSleepSourcePriority(left.sourceId, right.sourceId)
    if (bySource !== 0) {
      return bySource
    }
    const leftSleep = left.totalSleepMinutes ?? -1
    const rightSleep = right.totalSleepMinutes ?? -1
    if (leftSleep !== rightSleep) {
      return rightSleep - leftSleep
    }
    return left.startAt.localeCompare(right.startAt)
  })[0]!
}

export function isSuspiciousPartialPreferred(chosen: SleepNightCandidate, alternatives: readonly SleepNightCandidate[]): boolean {
  const chosenSleep = chosen.totalSleepMinutes
  if (chosenSleep == null) {
    return false
  }
  let longest: number | null = null
  for (const item of alternatives) {
    if (item.totalSleepMinutes != null && (longest == null || item.totalSleepMinutes > longest)) {
      longest = item.totalSleepMinutes
    }
  }
  if (longest == null) {
    return false
  }
  const difference = longest - chosenSleep
  return chosenSleep < longest * SLEEP_PARTIAL_SOURCE_RATIO && difference > SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES
}

export function arbitrateSleepNight(candidates: readonly SleepNightCandidate[]): SleepArbitrationDecision {
  const sleepDate = candidates[0]?.sleepDate ?? ''
  const actual = usableActual(candidates)
  const selected = pickPreferred(actual) ?? pickPreferred(usableInBed(candidates))
  const alternatives = selected ? candidates.filter((item) => item !== selected) : [...candidates]
  const topPriorityAbsent = !candidates.some((item) => item.sourceId === SLEEP_SOURCE_PRIORITY[0])
  const longestAlternativeMinutes = alternatives.reduce<number | null>((current, item) => {
    if (item.totalSleepMinutes == null) {
      return current
    }
    return current == null || item.totalSleepMinutes > current ? item.totalSleepMinutes : current
  }, null)
  return {
    sleepDate,
    selected,
    alternatives,
    reason: selected?.hasActualSleep ? 'actual_sleep_priority' : selected ? 'in_bed_only' : 'none',
    topPriorityAbsent,
    suspiciousPartialPreferred: selected ? isSuspiciousPartialPreferred(selected, alternatives) : false,
    longestAlternativeMinutes,
    chosenRatio:
      selected?.totalSleepMinutes != null && longestAlternativeMinutes != null && longestAlternativeMinutes > 0
        ? selected.totalSleepMinutes / longestAlternativeMinutes
        : null,
  }
}

export function arbitrateSleepNights(candidates: readonly SleepNightCandidate[]): SleepArbitrationDecision[] {
  const byDate = new Map<string, SleepNightCandidate[]>()
  for (const candidate of candidates) {
    const list = byDate.get(candidate.sleepDate) ?? []
    list.push(candidate)
    byDate.set(candidate.sleepDate, list)
  }
  return [...byDate.keys()]
    .sort((left, right) => left.localeCompare(right))
    .map((date) => arbitrateSleepNight(byDate.get(date)!))
}
