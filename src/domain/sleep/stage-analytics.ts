import { trailingPeriod } from '../progress/periods.js'
import type { ProgressRange } from '../progress/types.js'
import { recentSleepWindows } from './analytics.js'
import {
  SLEEP_SHORT_TERM_MIN_OBSERVED,
  SLEEP_STAGE_ANALYTICS_VERSION,
  SLEEP_STAGE_SUMMARY_MIN_NIGHTS,
} from './config.js'
import type { SleepNightlySummary } from './summarize.js'

export type SleepStageAnalyticsState = 'available' | 'insufficient_data'
export type SleepStageComparisonState = 'available' | 'insufficient_data' | 'source_mixed' | 'source_changed'

export type SleepStageNightPoint = {
  sleepDate: string
  sourceFamily: string
  sourceName: string
  totalSleepMinutes: number
  remMinutes: number
  remPct: number
  coreMinutes: number
  corePct: number
  deepMinutes: number
  deepPct: number
  unspecifiedMinutes: number
  unspecifiedPct: number
}

export type SleepStageSourceCount = {
  sourceFamily: string
  sourceName: string
  stageEligibleNights: number
}

export type SleepStageComposition = {
  nightCount: number
  averageTotalSleepMinutes: number
  remMinutesAvg: number
  remPct: number
  coreMinutesAvg: number
  corePct: number
  deepMinutesAvg: number
  deepPct: number
  unspecifiedMinutesAvg: number
  unspecifiedPct: number
}

export type SleepStageComparison = {
  state: SleepStageComparisonState
  currentStart: string
  currentEnd: string
  previousStart: string
  previousEnd: string
  currentStageEligibleNights: number
  previousStageEligibleNights: number
  sourceFamily: string | null
  sourceName: string | null
  remPercentagePoints: number | null
  corePercentagePoints: number | null
  deepPercentagePoints: number | null
  unspecifiedPercentagePoints: number | null
  remMinutesDelta: number | null
  coreMinutesDelta: number | null
  deepMinutesDelta: number | null
  unspecifiedMinutesDelta: number | null
}

export type SleepStageAnalytics = {
  calculationVersion: typeof SLEEP_STAGE_ANALYTICS_VERSION
  asOf: string
  range: ProgressRange
  start: string
  end: string
  state: SleepStageAnalyticsState
  coverage: {
    calendarDays: number
    canonicalNights: number
    analysisEligibleNights: number
    stageEligibleNights: number
    stageEligibilityPct: number | null
    stageIneligibleCompleteNights: number
    partialNights: number
    inBedOnlyNights: number
  }
  composition: SleepStageComposition | null
  sourceBreakdown: SleepStageSourceCount[]
  nightlySeries: SleepStageNightPoint[]
  recentComparison: SleepStageComparison
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function poolable(night: SleepNightlySummary): boolean {
  return (
    night.stageAnalysisEligible === true &&
    finite(night.totalSleepMinutes) &&
    night.totalSleepMinutes > 0 &&
    finite(night.remMinutes) &&
    finite(night.coreMinutes) &&
    finite(night.deepMinutes) &&
    finite(night.unspecifiedSleepMinutes)
  )
}

function onePerDate(nights: readonly SleepNightlySummary[]): SleepNightlySummary[] {
  const seen = new Set<string>()
  const rows: SleepNightlySummary[] = []
  for (const night of nights) {
    if (seen.has(night.sleepDate)) {
      continue
    }
    seen.add(night.sleepDate)
    rows.push(night)
  }
  return rows
}

function percent(part: number, total: number): number {
  return (part / total) * 100
}

function compositionOf(nights: readonly SleepNightlySummary[]): SleepStageComposition | null {
  if (nights.length === 0) {
    return null
  }
  const count = nights.length
  const total = nights.reduce((sum, night) => sum + night.totalSleepMinutes!, 0)
  const rem = nights.reduce((sum, night) => sum + night.remMinutes!, 0)
  const core = nights.reduce((sum, night) => sum + night.coreMinutes!, 0)
  const deep = nights.reduce((sum, night) => sum + night.deepMinutes!, 0)
  const unspecified = nights.reduce((sum, night) => sum + night.unspecifiedSleepMinutes!, 0)
  return {
    nightCount: count,
    averageTotalSleepMinutes: total / count,
    remMinutesAvg: rem / count,
    remPct: percent(rem, total),
    coreMinutesAvg: core / count,
    corePct: percent(core, total),
    deepMinutesAvg: deep / count,
    deepPct: percent(deep, total),
    unspecifiedMinutesAvg: unspecified / count,
    unspecifiedPct: percent(unspecified, total),
  }
}

function point(night: SleepNightlySummary): SleepStageNightPoint {
  const total = night.totalSleepMinutes!
  return {
    sleepDate: night.sleepDate,
    sourceFamily: night.logicalSourceKey,
    sourceName: night.sourceName.trim() === '' ? 'Unknown source' : night.sourceName,
    totalSleepMinutes: total,
    remMinutes: night.remMinutes!,
    remPct: percent(night.remMinutes!, total),
    coreMinutes: night.coreMinutes!,
    corePct: percent(night.coreMinutes!, total),
    deepMinutes: night.deepMinutes!,
    deepPct: percent(night.deepMinutes!, total),
    unspecifiedMinutes: night.unspecifiedSleepMinutes!,
    unspecifiedPct: percent(night.unspecifiedSleepMinutes!, total),
  }
}

function sourceBreakdown(nights: readonly SleepNightlySummary[]): SleepStageSourceCount[] {
  const groups = new Map<string, SleepStageSourceCount>()
  for (const night of nights) {
    if (!night.stageAnalysisEligible) {
      continue
    }
    const sourceFamily = night.logicalSourceKey
    const sourceName = night.sourceName.trim() === '' ? 'Unknown source' : night.sourceName
    const current = groups.get(sourceFamily)
    if (!current) {
      groups.set(sourceFamily, { sourceFamily, sourceName, stageEligibleNights: 1 })
      continue
    }
    current.stageEligibleNights += 1
    if (sourceName.localeCompare(current.sourceName) < 0) {
      current.sourceName = sourceName
    }
  }
  return [...groups.values()].sort(
    (left, right) =>
      right.stageEligibleNights - left.stageEligibleNights ||
      left.sourceName.localeCompare(right.sourceName) ||
      left.sourceFamily.localeCompare(right.sourceFamily),
  )
}

function families(nights: readonly SleepNightlySummary[]): string[] {
  return [...new Set(nights.map((night) => night.logicalSourceKey))].sort()
}

function emptyComparison(windows: ReturnType<typeof recentSleepWindows>, currentCount: number, previousCount: number, state: SleepStageComparisonState): SleepStageComparison {
  return {
    state,
    currentStart: windows.currentStart,
    currentEnd: windows.currentEnd,
    previousStart: windows.previousStart,
    previousEnd: windows.previousEnd,
    currentStageEligibleNights: currentCount,
    previousStageEligibleNights: previousCount,
    sourceFamily: null,
    sourceName: null,
    remPercentagePoints: null,
    corePercentagePoints: null,
    deepPercentagePoints: null,
    unspecifiedPercentagePoints: null,
    remMinutesDelta: null,
    coreMinutesDelta: null,
    deepMinutesDelta: null,
    unspecifiedMinutesDelta: null,
  }
}

function compareWindows(current: readonly SleepNightlySummary[], previous: readonly SleepNightlySummary[], windows: ReturnType<typeof recentSleepWindows>): SleepStageComparison {
  if (current.length < SLEEP_SHORT_TERM_MIN_OBSERVED || previous.length < SLEEP_SHORT_TERM_MIN_OBSERVED) {
    return emptyComparison(windows, current.length, previous.length, 'insufficient_data')
  }
  const currentFamilies = families(current)
  const previousFamilies = families(previous)
  if (currentFamilies.length !== 1 || previousFamilies.length !== 1) {
    return emptyComparison(windows, current.length, previous.length, 'source_mixed')
  }
  if (currentFamilies[0] !== previousFamilies[0]) {
    return emptyComparison(windows, current.length, previous.length, 'source_changed')
  }
  const currentComposition = compositionOf(current)
  const previousComposition = compositionOf(previous)
  if (!currentComposition || !previousComposition) {
    return emptyComparison(windows, current.length, previous.length, 'insufficient_data')
  }
  return {
    state: 'available',
    currentStart: windows.currentStart,
    currentEnd: windows.currentEnd,
    previousStart: windows.previousStart,
    previousEnd: windows.previousEnd,
    currentStageEligibleNights: current.length,
    previousStageEligibleNights: previous.length,
    sourceFamily: currentFamilies[0]!,
    sourceName: current[0]?.sourceName ?? null,
    remPercentagePoints: currentComposition.remPct - previousComposition.remPct,
    corePercentagePoints: currentComposition.corePct - previousComposition.corePct,
    deepPercentagePoints: currentComposition.deepPct - previousComposition.deepPct,
    unspecifiedPercentagePoints: currentComposition.unspecifiedPct - previousComposition.unspecifiedPct,
    remMinutesDelta: currentComposition.remMinutesAvg - previousComposition.remMinutesAvg,
    coreMinutesDelta: currentComposition.coreMinutesAvg - previousComposition.coreMinutesAvg,
    deepMinutesDelta: currentComposition.deepMinutesAvg - previousComposition.deepMinutesAvg,
    unspecifiedMinutesDelta: currentComposition.unspecifiedMinutesAvg - previousComposition.unspecifiedMinutesAvg,
  }
}

export function buildSleepStageAnalytics(
  nights: readonly SleepNightlySummary[],
  input: { range: ProgressRange; asOf: string },
): SleepStageAnalytics {
  const owned = onePerDate(nights).filter((night) => night.sleepDate <= input.asOf)
  const earliest = owned.reduce<string | null>((min, night) => (min == null || night.sleepDate < min ? night.sleepDate : min), null)
  const period = trailingPeriod(input.range, input.asOf, earliest)
  const inRange = owned.filter((night) => night.sleepDate >= period.start && night.sleepDate <= period.end)
  const analysisEligible = inRange.filter((night) => night.analysisEligible)
  const stageEligible = inRange.filter((night) => night.stageAnalysisEligible)
  const qualified = stageEligible.filter(poolable).sort((left, right) => left.sleepDate.localeCompare(right.sleepDate))
  const composition = qualified.length >= SLEEP_STAGE_SUMMARY_MIN_NIGHTS ? compositionOf(qualified) : null
  const windows = recentSleepWindows(input.asOf)
  const current = qualified.filter((night) => night.sleepDate >= windows.currentStart && night.sleepDate <= windows.currentEnd)
  const previous = qualified.filter((night) => night.sleepDate >= windows.previousStart && night.sleepDate <= windows.previousEnd)
  return {
    calculationVersion: SLEEP_STAGE_ANALYTICS_VERSION,
    asOf: input.asOf,
    range: input.range,
    start: period.start,
    end: period.end,
    state: composition ? 'available' : 'insufficient_data',
    coverage: {
      calendarDays: period.dayCount,
      canonicalNights: inRange.length,
      analysisEligibleNights: analysisEligible.length,
      stageEligibleNights: stageEligible.length,
      stageEligibilityPct: analysisEligible.length === 0 ? null : (stageEligible.length / analysisEligible.length) * 100,
      stageIneligibleCompleteNights: analysisEligible.filter((night) => !night.stageAnalysisEligible).length,
      partialNights: inRange.filter((night) => night.observationStatus === 'partial_observation').length,
      inBedOnlyNights: inRange.filter((night) => night.observationStatus === 'in_bed_only').length,
    },
    composition,
    sourceBreakdown: sourceBreakdown(stageEligible),
    nightlySeries: qualified.map(point),
    recentComparison: compareWindows(current, previous, windows),
  }
}
