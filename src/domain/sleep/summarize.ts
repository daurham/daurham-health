import type { SleepArbitrationDecision } from './arbitration.js'
import {
  classifySleepObservation,
  type SleepObservationStatus,
  type SleepSelectionReason,
} from './completeness.js'
import { SLEEP_NIGHT_CALCULATION_VERSION, SLEEP_SOURCE_PRIORITY, SLEEP_TIMEZONE } from './config.js'
import type { SleepNightCandidate } from './nights.js'

export type SleepNightAlternativeEvidence = {
  logicalSourceKey: string
  sourceName: string
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
  status: SleepObservationStatus | 'unclassified'
}

export type SleepNightEvidence = {
  selectedLogicalSource: string
  selectedSourceName: string
  selectedDurationMinutes: number | null
  selectedStatus: SleepObservationStatus
  alternatives: SleepNightAlternativeEvidence[]
  sourcePriority: readonly string[]
  completenessOverride: boolean
  intervalCount: number
  stageCoveragePct: number | null
  additionalEpisodeCount: number
  calculationVersion: string
}

export type SleepNightlySummary = {
  sleepDate: string
  timezone: string
  logicalSourceKey: string
  sourceName: string
  startAt: string
  endAt: string
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
  awakeMinutes: number | null
  coreMinutes: number | null
  deepMinutes: number | null
  remMinutes: number | null
  unspecifiedSleepMinutes: number | null
  stageCoveragePct: number | null
  stageConflictMinutes: number
  observationStatus: SleepObservationStatus
  analysisEligible: boolean
  stageAnalysisEligible: boolean
  selectionReason: SleepSelectionReason
  calculationVersion: string
  evidence: SleepNightEvidence
}

function alternativeEvidence(candidate: SleepNightCandidate): SleepNightAlternativeEvidence {
  return {
    logicalSourceKey: candidate.sourceId,
    sourceName: candidate.sourceName,
    totalSleepMinutes: candidate.totalSleepMinutes,
    timeInBedMinutes: candidate.timeInBedMinutes,
    status: classifySleepObservation(candidate) ?? 'unclassified',
  }
}

export function sleepNightlySummaryFromDecision(
  decision: SleepArbitrationDecision,
  timezone = SLEEP_TIMEZONE,
): SleepNightlySummary | null {
  const selected = decision.selected
  if (!selected || !decision.observationStatus || decision.selectionReason === 'none') {
    return null
  }
  return {
    sleepDate: selected.sleepDate,
    timezone,
    logicalSourceKey: selected.sourceId,
    sourceName: selected.sourceName,
    startAt: selected.startAt,
    endAt: selected.endAt,
    totalSleepMinutes: selected.totalSleepMinutes,
    timeInBedMinutes: selected.timeInBedMinutes,
    awakeMinutes: selected.awakeMinutes,
    coreMinutes: selected.coreMinutes,
    deepMinutes: selected.deepMinutes,
    remMinutes: selected.remMinutes,
    unspecifiedSleepMinutes: selected.unspecifiedSleepMinutes,
    stageCoveragePct: selected.stageCoveragePct,
    stageConflictMinutes: selected.stageConflictMinutes,
    observationStatus: decision.observationStatus,
    analysisEligible: decision.analysisEligible,
    stageAnalysisEligible: decision.stageAnalysisEligible,
    selectionReason: decision.selectionReason,
    calculationVersion: SLEEP_NIGHT_CALCULATION_VERSION,
    evidence: {
      selectedLogicalSource: selected.sourceId,
      selectedSourceName: selected.sourceName,
      selectedDurationMinutes: selected.totalSleepMinutes,
      selectedStatus: decision.observationStatus,
      alternatives: decision.alternatives.map(alternativeEvidence),
      sourcePriority: SLEEP_SOURCE_PRIORITY,
      completenessOverride: decision.completenessOverride,
      intervalCount: selected.intervalCount,
      stageCoveragePct: selected.stageCoveragePct,
      additionalEpisodeCount: selected.additionalEpisodeCount,
      calculationVersion: SLEEP_NIGHT_CALCULATION_VERSION,
    },
  }
}

export function sleepNightlySummariesFromDecisions(
  decisions: readonly SleepArbitrationDecision[],
  timezone = SLEEP_TIMEZONE,
): SleepNightlySummary[] {
  return decisions
    .map((decision) => sleepNightlySummaryFromDecision(decision, timezone))
    .filter((item): item is SleepNightlySummary => item != null)
}

export function sleepNightSemanticPayload(night: SleepNightlySummary): Record<string, unknown> {
  return {
    sleepDate: night.sleepDate,
    timezone: night.timezone,
    logicalSourceKey: night.logicalSourceKey,
    sourceName: night.sourceName,
    startAt: night.startAt,
    endAt: night.endAt,
    totalSleepMinutes: night.totalSleepMinutes,
    timeInBedMinutes: night.timeInBedMinutes,
    awakeMinutes: night.awakeMinutes,
    coreMinutes: night.coreMinutes,
    deepMinutes: night.deepMinutes,
    remMinutes: night.remMinutes,
    unspecifiedSleepMinutes: night.unspecifiedSleepMinutes,
    stageCoveragePct: night.stageCoveragePct,
    stageConflictMinutes: night.stageConflictMinutes,
    observationStatus: night.observationStatus,
    analysisEligible: night.analysisEligible,
    stageAnalysisEligible: night.stageAnalysisEligible,
    selectionReason: night.selectionReason,
    calculationVersion: night.calculationVersion,
    evidence: night.evidence,
  }
}
