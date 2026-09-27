import { isCalendarDate } from '../training.js'
import type { SleepObservationStatus, SleepSelectionReason } from './completeness.js'
import { SLEEP_TIMEZONE } from './config.js'
import type { SleepNightAlternativeEvidence, SleepNightlySummary } from './summarize.js'
import { computeSleepDurationBaseline, computeVitalBaseline, baselineVitalDefinitions, type SleepPersonalBaseline } from './baseline.js'
import { deriveNightSourceAttribution, sleepBaselineSeparationNote, type SleepNightSourceAttribution } from './source-attribution.js'
import {
  deriveOvernightVitals,
  SLEEP_VITAL_OBSERVATION_VERSION,
  SLEEP_VITAL_REGISTRY,
  type OvernightVital,
  type SleepVitalDefinition,
  type SleepVitalObservation,
} from './vitals.js'

export type SleepNightStageShares = {
  remPct: number | null
  corePct: number | null
  deepPct: number | null
}

export type SleepNightAlternativeView = {
  logicalSourceKey: string
  sourceName: string
  totalSleepMinutes: number | null
  selected: boolean
}

export type SleepNightDetail = {
  sleepDate: string
  timezone: string
  sourceName: string
  logicalSourceKey: string
  episodeStart: string
  episodeEnd: string
  observationStatus: SleepObservationStatus
  observationLabel: string
  analysisEligible: boolean
  eligibilityNote: string
  totalSleepMinutes: number | null
  timeInBedMinutes: number | null
  awakeMinutes: number | null
  coreMinutes: number | null
  deepMinutes: number | null
  remMinutes: number | null
  unspecifiedSleepMinutes: number | null
  stageCoveragePct: number | null
  exclusiveStageConflictMinutes: number
  stageAnalysisEligible: boolean
  stageShares: SleepNightStageShares | null
  stageNote: string | null
  selectionReason: SleepSelectionReason
  selectionLabel: string
  selectionExplanation: string | null
  alternatives: SleepNightAlternativeView[]
  transportName: string | null
  calculationVersion: string
  previousSleepDate: string | null
  nextSleepDate: string | null
  stageTimeline: null
  overnightVitals: Array<OvernightVital & { baseline: SleepPersonalBaseline | null }>
  overnightVitalNote: string | null
  vitalCalculationVersion: string | null
  durationBaseline: SleepPersonalBaseline
  sourceAttribution: SleepNightSourceAttribution
  baselineSeparationNote: string | null
}

const OBSERVATION_LABEL: Record<SleepObservationStatus, string> = {
  analysis_eligible: 'Complete sleep observation',
  partial_observation: 'Partial sleep observation',
  in_bed_only: 'In-bed observation only',
}

export function parseSleepDetailDate(value: string | null | undefined, today: string): { sleepDate: string } | { error: string } {
  const trimmed = value?.trim() ?? ''
  if (!isCalendarDate(trimmed)) {
    return { error: 'sleepDate must be YYYY-MM-DD' }
  }
  if (trimmed > today) {
    return { error: 'Sleep date cannot be in the future.' }
  }
  return { sleepDate: trimmed }
}

function share(minutes: number | null, total: number): number | null {
  if (minutes == null) {
    return null
  }
  return Math.round((minutes / total) * 1000) / 10
}

function alternatives(night: SleepNightlySummary): SleepNightAlternativeView[] {
  const rows = Array.isArray(night.evidence?.alternatives) ? night.evidence.alternatives : []
  return rows.map((item: SleepNightAlternativeEvidence) => ({
    logicalSourceKey: item.logicalSourceKey,
    sourceName: item.sourceName,
    totalSleepMinutes: item.totalSleepMinutes,
    selected: item.logicalSourceKey === night.logicalSourceKey,
  }))
}

function stageNote(night: SleepNightlySummary): string | null {
  if (night.stageAnalysisEligible) {
    return null
  }
  if (night.stageConflictMinutes > 0) {
    return 'Stage intervals conflict for part of this night. Stage percentages are unavailable.'
  }
  const hasStage =
    night.coreMinutes != null || night.deepMinutes != null || night.remMinutes != null || night.unspecifiedSleepMinutes != null
  if (!hasStage && night.stageCoveragePct == null) {
    return null
  }
  return 'Stage percentages are hidden because this night does not meet the coverage rule.'
}

export function buildSleepNightDetail(
  night: SleepNightlySummary,
  neighbors: { previousSleepDate: string | null; nextSleepDate: string | null } = { previousSleepDate: null, nextSleepDate: null },
  transportName: string | null = null,
  samples: readonly SleepVitalObservation[] = [],
  registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY,
  history: readonly SleepNightlySummary[] = [],
  historySamples: readonly SleepVitalObservation[] = [],
): SleepNightDetail {
  const sourceName = night.sourceName.trim() === '' ? 'Unknown source' : night.sourceName
  const total = night.totalSleepMinutes
  const stageShares =
    night.stageAnalysisEligible && total != null && total > 0
      ? {
          remPct: share(night.remMinutes, total),
          corePct: share(night.coreMinutes, total),
          deepPct: share(night.deepMinutes, total),
        }
      : null
  const transport = transportName && transportName.trim() !== '' && transportName.trim() !== sourceName ? transportName.trim() : null
  const vitalSamples = historySamples.length > 0 ? historySamples : samples
  const overnightVitals = deriveOvernightVitals({
    observationStatus: night.observationStatus,
    episodeStart: night.startAt,
    episodeEnd: night.endAt,
    samples,
    registry,
  }).map((vital) => ({
    ...vital,
    baseline: baselineVitalDefinitions(registry).some((item) => item.metricKey === vital.metricKey)
      ? computeVitalBaseline({
          nights: history,
          target: night,
          samples: vitalSamples,
          metricKey: vital.metricKey,
          sourceFamily: vital.sourceFamily,
          registry,
        })
      : null,
  }))
  const sourceAttribution = deriveNightSourceAttribution(night, transportName)
  const durationBaseline = computeSleepDurationBaseline(history, night)
  return {
    sleepDate: night.sleepDate,
    timezone: night.timezone || SLEEP_TIMEZONE,
    sourceName,
    logicalSourceKey: night.logicalSourceKey,
    episodeStart: night.startAt,
    episodeEnd: night.endAt,
    observationStatus: night.observationStatus,
    observationLabel: OBSERVATION_LABEL[night.observationStatus],
    analysisEligible: night.analysisEligible,
    eligibilityNote:
      night.observationStatus === 'analysis_eligible'
        ? 'Included in Sleep averages and trends'
        : night.observationStatus === 'partial_observation'
          ? 'Excluded from Sleep averages and trends.'
          : 'No actual-sleep intervals observed',
    totalSleepMinutes: night.totalSleepMinutes,
    timeInBedMinutes: night.timeInBedMinutes,
    awakeMinutes: night.awakeMinutes,
    coreMinutes: night.coreMinutes,
    deepMinutes: night.deepMinutes,
    remMinutes: night.remMinutes,
    unspecifiedSleepMinutes: night.unspecifiedSleepMinutes,
    stageCoveragePct: night.stageCoveragePct,
    exclusiveStageConflictMinutes: night.stageConflictMinutes,
    stageAnalysisEligible: night.stageAnalysisEligible,
    stageShares,
    stageNote: stageNote(night),
    selectionReason: night.selectionReason,
    selectionLabel: sourceAttribution.selectionLabel,
    selectionExplanation: sourceAttribution.selectionExplanation,
    alternatives: alternatives(night),
    transportName: transport,
    calculationVersion: night.calculationVersion,
    previousSleepDate: neighbors.previousSleepDate,
    nextSleepDate: neighbors.nextSleepDate,
    stageTimeline: null,
    overnightVitals,
    overnightVitalNote:
      overnightVitals.length > 0 && night.observationStatus === 'partial_observation'
        ? 'Observed during a partial Sleep observation.'
        : null,
    vitalCalculationVersion: overnightVitals.length > 0 ? SLEEP_VITAL_OBSERVATION_VERSION : null,
    durationBaseline,
    sourceAttribution,
    baselineSeparationNote: sleepBaselineSeparationNote(history, night, durationBaseline),
  }
}
