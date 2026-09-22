import { z } from 'zod'
import {
  ACTIVITY_METRICS,
  APPLE_HEALTH_COMMIT_BATCH,
  SLEEP_STAGES,
} from './config.js'
import { appleHealthFingerprint } from './fingerprint.js'
import type {
  NormalizedAppleHealthRecord,
  NormalizedQuantitySample,
  NormalizedSleepSample,
  NormalizedWorkoutSample,
} from './parse.js'

const offsetTimestamp = z
  .string()
  .min(1)
  .refine((value) => Number.isFinite(Date.parse(value)), 'Timestamp must be an offset-aware instant')
  .refine((value) => /[+-]\d{2}:\d{2}$/.test(value) || /Z$/.test(value), 'Timestamp must retain an offset')

const quantityRecordSchema = z.object({
  kind: z.literal('quantity'),
  metric: z.enum(ACTIVITY_METRICS),
  appleType: z.string().min(1),
  startAt: offsetTimestamp,
  endAt: offsetTimestamp,
  value: z.number().finite(),
  sourceValue: z.string().min(1),
  canonicalUnit: z.enum(['count', 'kcal', 'min', 'm', 'bpm']),
  sourceUnit: z.string(),
  sourceName: z.string().min(1),
  sourceVersion: z.string().min(1).nullable(),
  deviceName: z.string().min(1).nullable(),
})

const sleepRecordSchema = z.object({
  kind: z.literal('sleep'),
  appleType: z.string().min(1),
  startAt: offsetTimestamp,
  endAt: offsetTimestamp,
  stage: z.enum(SLEEP_STAGES),
  sourceCategory: z.string().min(1),
  sourceName: z.string().min(1),
  sourceVersion: z.string().min(1).nullable(),
  deviceName: z.string().min(1).nullable(),
})

const workoutRecordSchema = z.object({
  kind: z.literal('workout'),
  appleType: z.literal('Workout'),
  activityType: z.string().min(1),
  startAt: offsetTimestamp,
  endAt: offsetTimestamp,
  durationMin: z.number().finite().nullable(),
  energyKcal: z.number().finite().nullable(),
  distanceM: z.number().finite().nullable(),
  sourceName: z.string().min(1),
  sourceVersion: z.string().min(1).nullable(),
  deviceName: z.string().min(1).nullable(),
})

export const normalizedAppleHealthRecordSchema = z.discriminatedUnion('kind', [
  quantityRecordSchema,
  sleepRecordSchema,
  workoutRecordSchema,
])

export const appleHealthPreviewRequestSchema = z.object({
  fingerprints: z.array(z.string().min(1)).max(2000).optional(),
})

export const appleHealthImportSummarySchema = z.object({
  exportDate: z.string().nullable().optional(),
  dateRange: z
    .object({
      start: z.string(),
      end: z.string(),
    })
    .nullable()
    .optional(),
  sources: z.array(z.string()).optional(),
  devices: z.array(z.string()).optional(),
  unknownSleepCategories: z.array(z.string()).optional(),
  overlappingActivityGroups: z.number().int().nonnegative().optional(),
  counts: z
    .object({
      encountered: z.number().int().nonnegative(),
      steps: z.number().int().nonnegative(),
      activeEnergy: z.number().int().nonnegative(),
      exerciseTime: z.number().int().nonnegative(),
      walkingRunningDistance: z.number().int().nonnegative(),
      restingHeartRate: z.number().int().nonnegative(),
      sleep: z.number().int().nonnegative(),
      workouts: z.number().int().nonnegative(),
      bodyOwned: z.number().int().nonnegative(),
      nutritionOwned: z.number().int().nonnegative(),
      unsupported: z.number().int().nonnegative(),
      malformed: z.number().int().nonnegative(),
      estimatedCommitRows: z.number().int().nonnegative(),
      duplicateFingerprints: z.number().int().nonnegative(),
      uniqueFingerprints: z.number().int().nonnegative(),
    })
    .optional(),
})

export const appleHealthCommitRequestSchema = z.object({
  jobId: z.uuid().optional(),
  complete: z.boolean().optional(),
  summary: appleHealthImportSummarySchema.optional(),
  records: z.array(normalizedAppleHealthRecordSchema).max(APPLE_HEALTH_COMMIT_BATCH),
})

export type AppleHealthCommitRequest = z.infer<typeof appleHealthCommitRequestSchema>

export function fingerprintForRecord(
  record: Omit<NormalizedQuantitySample, 'fingerprint'> | Omit<NormalizedSleepSample, 'fingerprint'> | Omit<NormalizedWorkoutSample, 'fingerprint'>,
): string {
  if (record.kind === 'quantity') {
    return appleHealthFingerprint({
      appleType: record.appleType,
      startAt: record.startAt,
      endAt: record.endAt,
      value: record.sourceValue,
      unit: record.sourceUnit,
      sourceName: record.sourceName,
      sourceVersion: record.sourceVersion,
      deviceName: record.deviceName,
    })
  }
  if (record.kind === 'sleep') {
    return appleHealthFingerprint({
      appleType: record.appleType,
      startAt: record.startAt,
      endAt: record.endAt,
      value: record.sourceCategory,
      unit: 'sleep',
      sourceName: record.sourceName,
      sourceVersion: record.sourceVersion,
      deviceName: record.deviceName,
    })
  }
  return appleHealthFingerprint({
    appleType: record.activityType,
    startAt: record.startAt,
    endAt: record.endAt,
    value: String(record.durationMin ?? ''),
    unit: 'workout',
    sourceName: record.sourceName,
    sourceVersion: record.sourceVersion,
    deviceName: record.deviceName,
  })
}

export function withFingerprint(
  record: z.infer<typeof normalizedAppleHealthRecordSchema>,
): NormalizedAppleHealthRecord {
  return { ...record, fingerprint: fingerprintForRecord(record) }
}
