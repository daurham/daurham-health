import {
  MIN_ANALYSIS_SLEEP_MINUTES,
  MIN_STAGE_COVERAGE_PCT,
  SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES,
  SLEEP_PARTIAL_SOURCE_RATIO,
} from './config.js'

export const SLEEP_OBSERVATION_STATUSES = ['analysis_eligible', 'partial_observation', 'in_bed_only'] as const
export type SleepObservationStatus = (typeof SLEEP_OBSERVATION_STATUSES)[number]

export const SLEEP_SELECTION_REASONS = ['source_priority', 'completeness_override', 'partial_only', 'in_bed_only'] as const
export type SleepSelectionReason = (typeof SLEEP_SELECTION_REASONS)[number]

export function classifySleepObservation(input: {
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
}): SleepObservationStatus | null {
  if (input.totalSleepMinutes != null && input.totalSleepMinutes >= MIN_ANALYSIS_SLEEP_MINUTES) {
    return 'analysis_eligible'
  }
  if (input.totalSleepMinutes != null && input.totalSleepMinutes > 0) {
    return 'partial_observation'
  }
  if (input.timeInBedMinutes != null) {
    return 'in_bed_only'
  }
  return null
}

export function isAnalysisEligible(totalSleepMinutes: number | null): boolean {
  return totalSleepMinutes != null && totalSleepMinutes >= MIN_ANALYSIS_SLEEP_MINUTES
}

export function isStageAnalysisEligible(input: {
  analysisEligible: boolean
  stageCoveragePct: number | null
  stageConflictMinutes: number
}): boolean {
  return (
    input.analysisEligible &&
    input.stageCoveragePct != null &&
    input.stageCoveragePct >= MIN_STAGE_COVERAGE_PCT &&
    input.stageConflictMinutes === 0
  )
}

export function meetsCompletenessOverride(chosenMinutes: number, longestAlternativeMinutes: number): boolean {
  return (
    chosenMinutes < longestAlternativeMinutes * SLEEP_PARTIAL_SOURCE_RATIO &&
    longestAlternativeMinutes - chosenMinutes > SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES
  )
}
