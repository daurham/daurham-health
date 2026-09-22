import { classifyFingerprint } from '../duplicates.js'
import {
  ACTIVITY_SAMPLE_ENTITY,
  ACTIVITY_WORKOUT_ENTITY,
  SLEEP_INTERVAL_ENTITY,
} from './config.js'
import type { NormalizedAppleHealthRecord } from './parse.js'
import { fingerprintForRecord } from './types.js'

export type PlannedAppleHealthRecord = NormalizedAppleHealthRecord & {
  entityType: string
}

export type AppleHealthIngestPlan = {
  toInsert: PlannedAppleHealthRecord[]
  duplicates: PlannedAppleHealthRecord[]
}

export function entityTypeFor(record: NormalizedAppleHealthRecord): string {
  if (record.kind === 'sleep') {
    return SLEEP_INTERVAL_ENTITY
  }
  if (record.kind === 'workout') {
    return ACTIVITY_WORKOUT_ENTITY
  }
  return ACTIVITY_SAMPLE_ENTITY
}

export function boundedSourcePayload(record: NormalizedAppleHealthRecord): Record<string, unknown> {
  return {
    kind: record.kind,
    appleType: record.appleType,
    startAt: record.startAt,
    endAt: record.endAt,
    sourceName: record.sourceName,
    sourceVersion: record.sourceVersion,
    deviceName: record.deviceName,
    ...(record.kind === 'quantity'
      ? { metric: record.metric, value: record.value, sourceValue: record.sourceValue, sourceUnit: record.sourceUnit }
      : {}),
    ...(record.kind === 'sleep' ? { stage: record.stage, sourceCategory: record.sourceCategory } : {}),
    ...(record.kind === 'workout'
      ? {
          activityType: record.activityType,
          durationMin: record.durationMin,
          energyKcal: record.energyKcal,
          distanceM: record.distanceM,
        }
      : {}),
  }
}

export function planAppleHealthIngest(
  records: readonly NormalizedAppleHealthRecord[],
  existingFingerprints: ReadonlySet<string> = new Set(),
): AppleHealthIngestPlan {
  const seen = new Set<string>()
  const toInsert: PlannedAppleHealthRecord[] = []
  const duplicates: PlannedAppleHealthRecord[] = []
  for (const record of records) {
    const fingerprint = record.fingerprint || fingerprintForRecord(record)
    const planned = { ...record, fingerprint, entityType: entityTypeFor(record) }
    if (seen.has(fingerprint) || classifyFingerprint(fingerprint, existingFingerprints) === 'duplicate') {
      duplicates.push(planned)
      continue
    }
    seen.add(fingerprint)
    toInsert.push(planned)
  }
  return { toInsert, duplicates }
}

/** In-memory CLAIM semantics for tests and Shortcut-transport planning. */
export function claimAppleHealthRecords(
  records: readonly NormalizedAppleHealthRecord[],
  claimed: Set<string>,
): { inserted: NormalizedAppleHealthRecord[]; matched: number } {
  const inserted: NormalizedAppleHealthRecord[] = []
  let matched = 0
  for (const record of records) {
    const fingerprint = record.fingerprint || fingerprintForRecord(record)
    if (claimed.has(fingerprint)) {
      matched += 1
      continue
    }
    claimed.add(fingerprint)
    inserted.push({ ...record, fingerprint })
  }
  return { inserted, matched }
}
