import { SLEEP_SOURCE_PRIORITY } from './config.js'
import {
  classifySleepObservation,
  isStageAnalysisEligible,
  meetsCompletenessOverride,
  type SleepObservationStatus,
  type SleepSelectionReason,
} from './completeness.js'
import type { SleepNightCandidate } from './nights.js'
import { compareSleepSourcePriority } from './sources.js'

export type SleepArbitrationDecision = {
  sleepDate: string
  selected: SleepNightCandidate | null
  alternatives: SleepNightCandidate[]
  observationStatus: SleepObservationStatus | null
  analysisEligible: boolean
  stageAnalysisEligible: boolean
  selectionReason: SleepSelectionReason | 'none'
  topPriorityAbsent: boolean
  completenessOverride: boolean
  suspiciousPartialPreferred: boolean
  longestAlternativeMinutes: number | null
  chosenRatio: number | null
}

function ofStatus(candidates: readonly SleepNightCandidate[], status: SleepObservationStatus): SleepNightCandidate[] {
  return candidates.filter((item) => classifySleepObservation(item) === status)
}

function pickBySourcePriority(candidates: readonly SleepNightCandidate[]): SleepNightCandidate | null {
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

function pickLongestThenPriority(candidates: readonly SleepNightCandidate[]): SleepNightCandidate | null {
  if (candidates.length === 0) {
    return null
  }
  return [...candidates].sort((left, right) => {
    const leftSleep = left.totalSleepMinutes ?? -1
    const rightSleep = right.totalSleepMinutes ?? -1
    if (leftSleep !== rightSleep) {
      return rightSleep - leftSleep
    }
    const bySource = compareSleepSourcePriority(left.sourceId, right.sourceId)
    if (bySource !== 0) {
      return bySource
    }
    return left.startAt.localeCompare(right.startAt)
  })[0]!
}

export function isSuspiciousPartialPreferred(
  chosen: SleepNightCandidate,
  alternatives: readonly SleepNightCandidate[],
): boolean {
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
  return meetsCompletenessOverride(chosenSleep, longest)
}

function longestEligibleAlternative(
  chosen: SleepNightCandidate,
  eligible: readonly SleepNightCandidate[],
): SleepNightCandidate | null {
  const others = eligible.filter((item) => item !== chosen && item.totalSleepMinutes != null)
  if (others.length === 0) {
    return null
  }
  return pickLongestThenPriority(others)
}

export function arbitrateSleepNight(candidates: readonly SleepNightCandidate[]): SleepArbitrationDecision {
  const sleepDate = candidates[0]?.sleepDate ?? ''
  const eligible = ofStatus(candidates, 'analysis_eligible')
  const partial = ofStatus(candidates, 'partial_observation')
  const inBed = ofStatus(candidates, 'in_bed_only')

  let selected: SleepNightCandidate | null = null
  let selectionReason: SleepSelectionReason | 'none' = 'none'
  let completenessOverride = false

  if (eligible.length > 0) {
    const provisional = pickBySourcePriority(eligible)!
    const longer = longestEligibleAlternative(provisional, eligible)
    if (
      longer?.totalSleepMinutes != null &&
      provisional.totalSleepMinutes != null &&
      meetsCompletenessOverride(provisional.totalSleepMinutes, longer.totalSleepMinutes)
    ) {
      selected = longer
      selectionReason = 'completeness_override'
      completenessOverride = true
    } else {
      selected = provisional
      selectionReason = 'source_priority'
    }
  } else if (partial.length > 0) {
    selected = pickLongestThenPriority(partial)
    selectionReason = 'partial_only'
  } else if (inBed.length > 0) {
    selected = pickBySourcePriority(inBed)
    selectionReason = 'in_bed_only'
  }

  const alternatives = selected ? candidates.filter((item) => item !== selected) : [...candidates]
  const observationStatus = selected ? classifySleepObservation(selected) : null
  const analysisEligible = observationStatus === 'analysis_eligible'
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
    observationStatus,
    analysisEligible,
    stageAnalysisEligible: selected
      ? isStageAnalysisEligible({
          analysisEligible,
          stageCoveragePct: selected.stageCoveragePct,
          stageConflictMinutes: selected.stageConflictMinutes,
        })
      : false,
    selectionReason,
    topPriorityAbsent: !candidates.some((item) => item.sourceId === SLEEP_SOURCE_PRIORITY[0]),
    completenessOverride,
    suspiciousPartialPreferred: completenessOverride || (selected ? isSuspiciousPartialPreferred(selected, alternatives) : false),
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
