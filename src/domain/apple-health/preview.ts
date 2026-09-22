import { classifyFingerprint } from '../duplicates.js'
import type { NormalizedAppleHealthRecord, AppleHealthParseResult, SkippedAppleHealthRecord } from './parse.js'

export type AppleHealthPreviewCounts = {
  encountered: number
  steps: number
  activeEnergy: number
  exerciseTime: number
  walkingRunningDistance: number
  restingHeartRate: number
  sleep: number
  workouts: number
  bodyOwned: number
  nutritionOwned: number
  unsupported: number
  malformed: number
  estimatedCommitRows: number
  duplicateFingerprints: number
  uniqueFingerprints: number
}

export type AppleHealthPreview = {
  exportDate: string | null
  dateRange: { start: string; end: string } | null
  sources: string[]
  devices: string[]
  unknownSleepCategories: string[]
  validationFailures: Array<{ appleType: string; detail: string }>
  overlappingActivityGroups: number
  counts: AppleHealthPreviewCounts
  records: NormalizedAppleHealthRecord[]
}

function overlappingActivityGroups(records: readonly NormalizedAppleHealthRecord[]): number {
  const buckets = new Map<string, Set<string>>()
  for (const record of records) {
    if (record.kind !== 'quantity') {
      continue
    }
    const key = `${record.metric}|${record.startAt}|${record.endAt}`
    const sources = buckets.get(key) ?? new Set<string>()
    sources.add(record.sourceName)
    buckets.set(key, sources)
  }
  let overlapping = 0
  for (const sources of buckets.values()) {
    if (sources.size > 1) {
      overlapping += 1
    }
  }
  return overlapping
}

function countSkipped(skipped: readonly SkippedAppleHealthRecord[], reason: SkippedAppleHealthRecord['reason']): number {
  return skipped.filter((item) => item.reason === reason).length
}

function dateRangeOf(records: readonly NormalizedAppleHealthRecord[]): { start: string; end: string } | null {
  if (records.length === 0) {
    return null
  }
  let start = records[0]!.startAt
  let end = records[0]!.endAt
  for (const record of records) {
    if (record.startAt < start) {
      start = record.startAt
    }
    if (record.endAt > end) {
      end = record.endAt
    }
  }
  return { start, end }
}

export function previewAppleHealth(
  parsed: AppleHealthParseResult,
  existingFingerprints: ReadonlySet<string> = new Set(),
): AppleHealthPreview {
  const seen = new Set<string>()
  let intraDuplicates = 0
  let existingDuplicates = 0
  const unique: NormalizedAppleHealthRecord[] = []
  for (const record of parsed.records) {
    if (seen.has(record.fingerprint)) {
      intraDuplicates += 1
      continue
    }
    seen.add(record.fingerprint)
    if (classifyFingerprint(record.fingerprint, existingFingerprints) === 'duplicate') {
      existingDuplicates += 1
      continue
    }
    unique.push(record)
  }
  const quantity = unique.filter((item) => item.kind === 'quantity')
  const counts: AppleHealthPreviewCounts = {
    encountered: parsed.records.length + parsed.skipped.length,
    steps: quantity.filter((item) => item.metric === 'steps').length,
    activeEnergy: quantity.filter((item) => item.metric === 'active_energy').length,
    exerciseTime: quantity.filter((item) => item.metric === 'exercise_time').length,
    walkingRunningDistance: quantity.filter((item) => item.metric === 'walking_running_distance').length,
    restingHeartRate: quantity.filter((item) => item.metric === 'resting_heart_rate').length,
    sleep: unique.filter((item) => item.kind === 'sleep').length,
    workouts: unique.filter((item) => item.kind === 'workout').length,
    bodyOwned: countSkipped(parsed.skipped, 'body_owned'),
    nutritionOwned: countSkipped(parsed.skipped, 'nutrition_owned'),
    unsupported: countSkipped(parsed.skipped, 'unsupported'),
    malformed: countSkipped(parsed.skipped, 'malformed'),
    estimatedCommitRows: unique.length,
    duplicateFingerprints: intraDuplicates + existingDuplicates,
    uniqueFingerprints: seen.size,
  }
  return {
    exportDate: parsed.exportDate,
    dateRange: dateRangeOf(unique.length > 0 ? unique : parsed.records),
    sources: parsed.sources,
    devices: parsed.devices,
    unknownSleepCategories: parsed.unknownSleepCategories,
    validationFailures: parsed.skipped
      .filter((item) => item.reason === 'malformed')
      .map((item) => ({ appleType: item.appleType, detail: item.detail ?? 'malformed' })),
    overlappingActivityGroups: overlappingActivityGroups(unique),
    counts,
    records: unique,
  }
}
