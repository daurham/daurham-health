import { calendarDaysBetween } from '../progress/dates.js'
import type { ProgressRange } from '../progress/types.js'
import { sleepBaselineWindow, type SleepPersonalBaseline } from './baseline.js'
import { SLEEP_SELECTION_REASONS, type SleepObservationStatus, type SleepSelectionReason } from './completeness.js'
import { SLEEP_SOURCE_ATTRIBUTION_VERSION, SLEEP_TIMEZONE } from './config.js'
import { compareSleepSourcePriority } from './sources.js'
import type { SleepNightAlternativeEvidence, SleepNightlySummary } from './summarize.js'

/**
 * Source attribution explains stored Sleep arbitration.
 * It does not choose a source, rank devices, or persist transitions.
 */

export const SLEEP_SOURCE_TRANSITION_DISPLAY_LIMIT = 10
export const SLEEP_SOURCE_STRIP_LIMIT = 90

export type SleepSourceComparability =
  | 'single_source'
  | 'mixed_sources'
  | 'unknown_source'
  | 'unknown_source_present'
  | 'insufficient_evidence'

export type SleepSourceCount = {
  sourceFamily: string
  sourceName: string
  canonicalNights: number
  analysisEligibleNights: number
  stageEligibleNights: number
  firstSleepDate: string
  lastSleepDate: string
}

export type SleepSourceTransition = {
  fromSourceKey: string
  fromSource: string
  toSourceKey: string
  toSource: string
  previousSleepDate: string
  nextSleepDate: string
  gapDays: number
  identityUnavailable: boolean
}

export type SleepSourceRun = {
  sourceFamily: string
  sourceName: string
  firstSleepDate: string
  lastSleepDate: string
  observedNights: number
}

export type SleepSelectionReasonCount = {
  selectionReason: string
  count: number
  label: string
}

export type SleepSourceStripNight = {
  sleepDate: string
  sourceFamily: string
  sourceName: string
  observationStatus: SleepObservationStatus
  selectionReason: string
}

export type SleepSourceAttribution = {
  calculationVersion: typeof SLEEP_SOURCE_ATTRIBUTION_VERSION
  range: ProgressRange
  asOf: string
  start: string
  end: string
  canonicalNights: number
  analysisEligibleNights: number
  stageEligibleNights: number
  sourceBreakdown: SleepSourceCount[]
  transitions: SleepSourceTransition[]
  recentTransitions: SleepSourceTransition[]
  runs: SleepSourceRun[]
  selectionReasonBreakdown: SleepSelectionReasonCount[]
  overrideNights: string[]
  latestSelectedSource: { sourceFamily: string; sourceName: string; sleepDate: string } | null
  comparability: SleepSourceComparability
  continuityLabel: string
  strip: SleepSourceStripNight[]
  baselineSeparationNote: string | null
}

export type SleepNightSourceAlternative = {
  sourceFamily: string
  sourceName: string
  observedSleepMinutes: number | null
  observationStatus: string | null
  selected: boolean
}

export type SleepNightSourceAttribution = {
  sleepDate: string
  selectedSourceFamily: string
  selectedSourceName: string
  transportSource: string | null
  selectionReason: string | null
  selectionLabel: string
  selectionExplanation: string | null
  observationStatus: SleepObservationStatus
  analysisEligible: boolean
  stageAnalysisEligible: boolean
  alternatives: SleepNightSourceAlternative[]
  calculationVersion: typeof SLEEP_SOURCE_ATTRIBUTION_VERSION
}

const REASON_LABEL: Record<SleepSelectionReason, string> = {
  source_priority: 'Source priority',
  completeness_override: 'Completeness override',
  partial_only: 'Partial fallback',
  in_bed_only: 'In-bed only',
}

const SELECTION_COPY: Record<SleepSelectionReason, string> = {
  source_priority: 'Selected preferred complete source.',
  completeness_override: 'A more complete source was selected because the preferred source appeared materially truncated.',
  partial_only: 'No complete Sleep observation was available. The longest partial observation is shown.',
  in_bed_only: 'No actual-sleep observation was available. An in-bed observation is shown.',
}

const KNOWN_REASONS = new Set<string>(SLEEP_SELECTION_REASONS)

export function sleepOverrideExplanation(night: SleepNightlySummary): string | null {
  if (night.selectionReason !== 'completeness_override') {
    return null
  }
  const eligible = (night.evidence?.alternatives ?? []).filter((item) => item.status === 'analysis_eligible' && item.sourceName.trim() !== '')
  const preferred = [...eligible].sort((left, right) => compareSleepSourcePriority(left.logicalSourceKey, right.logicalSourceKey))[0]
  if (!preferred) {
    return null
  }
  return `${night.sourceName} was used because the ${preferred.sourceName} observation was substantially incomplete.`
}

export function sleepSourceDisplayName(night: Pick<SleepNightlySummary, 'logicalSourceKey' | 'sourceName'>): string {
  if (isUnknownSleepSource(night)) {
    return 'Unknown source'
  }
  const name = night.sourceName.trim()
  return name === '' ? 'Unknown source' : name
}

export function isUnknownSleepSource(night: Pick<SleepNightlySummary, 'logicalSourceKey' | 'sourceName'>): boolean {
  const name = night.sourceName.trim()
  return night.logicalSourceKey === 'unknown' || name === '' || name === 'Unknown' || name === 'Unknown source'
}

export function sleepSelectionCopy(reason: string | null | undefined): string {
  if (!reason || !KNOWN_REASONS.has(reason)) {
    return 'Selection reason unavailable'
  }
  return SELECTION_COPY[reason as SleepSelectionReason]
}

export function sleepSelectionReasonLabel(reason: string): string {
  if (!KNOWN_REASONS.has(reason)) {
    return 'Selection reason unavailable'
  }
  return REASON_LABEL[reason as SleepSelectionReason]
}

function onePerDate(nights: readonly SleepNightlySummary[]): SleepNightlySummary[] {
  const seen = new Set<string>()
  const rows: SleepNightlySummary[] = []
  for (const night of nights) {
    if (night.timezone !== SLEEP_TIMEZONE || seen.has(night.sleepDate)) {
      continue
    }
    seen.add(night.sleepDate)
    rows.push(night)
  }
  return rows.sort((left, right) => left.sleepDate.localeCompare(right.sleepDate))
}

function alternativesOf(night: SleepNightlySummary): SleepNightSourceAlternative[] {
  const rows = Array.isArray(night.evidence?.alternatives) ? night.evidence.alternatives : []
  return rows.map((item: SleepNightAlternativeEvidence) => ({
    sourceFamily: item.logicalSourceKey,
    sourceName: item.sourceName?.trim() ? item.sourceName : 'Unknown source',
    observedSleepMinutes: item.totalSleepMinutes,
    observationStatus: item.status ?? null,
    selected: item.logicalSourceKey === night.logicalSourceKey,
  }))
}

export function deriveNightSourceAttribution(night: SleepNightlySummary, transportName: string | null = null): SleepNightSourceAttribution {
  const selectedSourceName = sleepSourceDisplayName(night)
  const transport = transportName && transportName.trim() !== '' && transportName.trim() !== selectedSourceName ? transportName.trim() : null
  const reason = night.selectionReason
  const known = KNOWN_REASONS.has(reason)
  const alternatives = alternativesOf(night)
  const override = known && reason === 'completeness_override' ? sleepOverrideExplanation(night) : null
  const priorityContext =
    known && reason === 'source_priority' && alternatives.filter((item) => !item.selected).length > 0
      ? 'Multiple usable observations were available. Health selected this source using the existing Sleep source-priority rule.'
      : null
  return {
    sleepDate: night.sleepDate,
    selectedSourceFamily: night.logicalSourceKey,
    selectedSourceName,
    transportSource: transport,
    selectionReason: known ? reason : null,
    selectionLabel: sleepSelectionCopy(reason),
    selectionExplanation: override ?? priorityContext,
    observationStatus: night.observationStatus,
    analysisEligible: night.analysisEligible,
    stageAnalysisEligible: night.stageAnalysisEligible,
    alternatives,
    calculationVersion: SLEEP_SOURCE_ATTRIBUTION_VERSION,
  }
}

export function deriveSleepSourceTransitions(nights: readonly SleepNightlySummary[]): SleepSourceTransition[] {
  const ordered = onePerDate(nights)
  const transitions: SleepSourceTransition[] = []
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!
    const next = ordered[index]!
    if (previous.logicalSourceKey === next.logicalSourceKey) {
      continue
    }
    const fromUnknown = isUnknownSleepSource(previous)
    const toUnknown = isUnknownSleepSource(next)
    transitions.push({
      fromSourceKey: previous.logicalSourceKey,
      fromSource: sleepSourceDisplayName(previous),
      toSourceKey: next.logicalSourceKey,
      toSource: sleepSourceDisplayName(next),
      previousSleepDate: previous.sleepDate,
      nextSleepDate: next.sleepDate,
      gapDays: calendarDaysBetween(previous.sleepDate, next.sleepDate),
      identityUnavailable: fromUnknown || toUnknown,
    })
  }
  return transitions
}

export function deriveSleepSourceRuns(nights: readonly SleepNightlySummary[]): SleepSourceRun[] {
  const ordered = onePerDate(nights)
  const runs: SleepSourceRun[] = []
  for (const night of ordered) {
    const current = runs[runs.length - 1]
    if (current && current.sourceFamily === night.logicalSourceKey) {
      current.lastSleepDate = night.sleepDate
      current.observedNights += 1
      continue
    }
    runs.push({
      sourceFamily: night.logicalSourceKey,
      sourceName: sleepSourceDisplayName(night),
      firstSleepDate: night.sleepDate,
      lastSleepDate: night.sleepDate,
      observedNights: 1,
    })
  }
  return runs
}

export function assessSleepSourceComparability(nights: readonly SleepNightlySummary[]): SleepSourceComparability {
  const ordered = onePerDate(nights)
  if (ordered.length === 0) {
    return 'insufficient_evidence'
  }
  const unknown = ordered.some(isUnknownSleepSource)
  const known = new Set(ordered.filter((night) => !isUnknownSleepSource(night)).map((night) => night.logicalSourceKey))
  if (unknown && known.size === 0) {
    return 'unknown_source'
  }
  if (unknown) {
    return 'unknown_source_present'
  }
  if (known.size === 1) {
    return 'single_source'
  }
  return 'mixed_sources'
}

export function sleepSourceContinuityLabel(nights: readonly SleepNightlySummary[]): string {
  const state = assessSleepSourceComparability(nights)
  if (state === 'insufficient_evidence') {
    return 'No Sleep observations in this range.'
  }
  if (state === 'unknown_source') {
    return 'Source identity is unknown for the observed nights in this range.'
  }
  if (state === 'single_source') {
    const name = sleepSourceDisplayName(onePerDate(nights)[0]!)
    return `All observed canonical nights in this range used ${name}.`
  }
  if (state === 'unknown_source_present') {
    return 'Mixed sleep sources in this range. Some nights have an unknown source.'
  }
  return 'Mixed sleep sources in this range.'
}

export function sleepBaselineSeparationNote(
  nights: readonly SleepNightlySummary[],
  target: SleepNightlySummary | null,
  baseline: SleepPersonalBaseline | null,
): string | null {
  if (!target || !baseline || baseline.state !== 'insufficient_history' || isUnknownSleepSource(target)) {
    return null
  }
  const window = sleepBaselineWindow(target.sleepDate)
  const prior = onePerDate(nights).filter((night) => night.sleepDate >= window.start && night.sleepDate <= window.end && night.analysisEligible)
  const others = new Map<string, number>()
  for (const night of prior) {
    if (night.logicalSourceKey === target.logicalSourceKey || isUnknownSleepSource(night)) {
      continue
    }
    others.set(sleepSourceDisplayName(night), (others.get(sleepSourceDisplayName(night)) ?? 0) + 1)
  }
  if (others.size === 0) {
    return null
  }
  const count = baseline.baselineObservationCount
  const nightsLabel = count === 1 ? 'night is' : 'nights are'
  const source = sleepSourceDisplayName(target)
  const separated = [...others.keys()].sort().join(' and ')
  return `Only ${count} prior ${source} ${nightsLabel} available. Older ${separated} nights are kept separate.`
}

function sourceBreakdown(nights: readonly SleepNightlySummary[]): SleepSourceCount[] {
  const groups = new Map<string, SleepSourceCount>()
  for (const night of nights) {
    const key = night.logicalSourceKey
    const name = sleepSourceDisplayName(night)
    const current = groups.get(key)
    if (!current) {
      groups.set(key, {
        sourceFamily: key,
        sourceName: name,
        canonicalNights: 1,
        analysisEligibleNights: night.analysisEligible ? 1 : 0,
        stageEligibleNights: night.stageAnalysisEligible ? 1 : 0,
        firstSleepDate: night.sleepDate,
        lastSleepDate: night.sleepDate,
      })
      continue
    }
    current.canonicalNights += 1
    if (night.analysisEligible) {
      current.analysisEligibleNights += 1
    }
    if (night.stageAnalysisEligible) {
      current.stageEligibleNights += 1
    }
    if (night.sleepDate < current.firstSleepDate) {
      current.firstSleepDate = night.sleepDate
    }
    if (night.sleepDate > current.lastSleepDate) {
      current.lastSleepDate = night.sleepDate
    }
  }
  return [...groups.values()].sort(
    (left, right) =>
      right.canonicalNights - left.canonicalNights ||
      left.sourceName.localeCompare(right.sourceName) ||
      left.sourceFamily.localeCompare(right.sourceFamily),
  )
}

function reasonBreakdown(nights: readonly SleepNightlySummary[]): SleepSelectionReasonCount[] {
  const counts = new Map<string, number>()
  for (const night of nights) {
    const reason = KNOWN_REASONS.has(night.selectionReason) ? night.selectionReason : 'unavailable'
    counts.set(reason, (counts.get(reason) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([selectionReason, count]) => ({
      selectionReason,
      count,
      label: selectionReason === 'unavailable' ? 'Selection reason unavailable' : sleepSelectionReasonLabel(selectionReason),
    }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

export function deriveSleepSourceAttribution(
  nights: readonly SleepNightlySummary[],
  input: {
    range: ProgressRange
    asOf: string
    start: string
    end: string
    baselineTarget?: SleepNightlySummary | null
    personalBaseline?: SleepPersonalBaseline | null
    baselineHistory?: readonly SleepNightlySummary[]
  },
): SleepSourceAttribution {
  const ordered = onePerDate(nights).filter((night) => night.sleepDate >= input.start && night.sleepDate <= input.end && night.sleepDate <= input.asOf)
  const transitions = deriveSleepSourceTransitions(ordered)
  const latest = ordered[ordered.length - 1] ?? null
  const showStrip = input.range !== 'all' && ordered.length > 0 && ordered.length <= SLEEP_SOURCE_STRIP_LIMIT
  return {
    calculationVersion: SLEEP_SOURCE_ATTRIBUTION_VERSION,
    range: input.range,
    asOf: input.asOf,
    start: input.start,
    end: input.end,
    canonicalNights: ordered.length,
    analysisEligibleNights: ordered.filter((night) => night.analysisEligible).length,
    stageEligibleNights: ordered.filter((night) => night.stageAnalysisEligible).length,
    sourceBreakdown: sourceBreakdown(ordered),
    transitions,
    recentTransitions: transitions.slice(-SLEEP_SOURCE_TRANSITION_DISPLAY_LIMIT),
    runs: deriveSleepSourceRuns(ordered),
    selectionReasonBreakdown: reasonBreakdown(ordered),
    overrideNights: ordered.filter((night) => night.selectionReason === 'completeness_override').map((night) => night.sleepDate),
    latestSelectedSource: latest
      ? { sourceFamily: latest.logicalSourceKey, sourceName: sleepSourceDisplayName(latest), sleepDate: latest.sleepDate }
      : null,
    comparability: assessSleepSourceComparability(ordered),
    continuityLabel: sleepSourceContinuityLabel(ordered),
    strip: showStrip
      ? ordered.map((night) => ({
          sleepDate: night.sleepDate,
          sourceFamily: night.logicalSourceKey,
          sourceName: sleepSourceDisplayName(night),
          observationStatus: night.observationStatus,
          selectionReason: night.selectionReason,
        }))
      : [],
    baselineSeparationNote: sleepBaselineSeparationNote(input.baselineHistory ?? nights, input.baselineTarget ?? null, input.personalBaseline ?? null),
  }
}
