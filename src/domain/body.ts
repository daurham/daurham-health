import { z } from 'zod'
import { BODY_VALUE_KINDS, CANONICAL_UNITS } from './body-metrics'

const uuidSchema = z.uuid()
const timestamptzSchema = z.coerce.date()
const jsonRecordSchema = z.record(z.string(), z.unknown())

export const bodyValueKindSchema = z.enum(BODY_VALUE_KINDS)
export const canonicalUnitSchema = z.enum(CANONICAL_UNITS)

export const bodyMetricRowSchema = z.object({
  id: uuidSchema,
  measurement_session_id: uuidSchema,
  metric_key: z.string().min(1),
  value: z.coerce.number(),
  unit: canonicalUnitSchema,
  value_kind: bodyValueKindSchema,
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type BodyMetricRow = z.infer<typeof bodyMetricRowSchema>

export const bodyMetricSchema = z.object({
  id: uuidSchema,
  measurementSessionId: uuidSchema,
  key: z.string().min(1),
  value: z.number(),
  unit: canonicalUnitSchema,
  valueKind: bodyValueKindSchema,
})

export type BodyMetric = z.infer<typeof bodyMetricSchema>

export const bodyMeasurementSessionRowSchema = z.object({
  id: uuidSchema,
  measured_at: timestamptzSchema,
  timezone: z.string().nullable(),
  source_id: uuidSchema,
  import_job_id: uuidSchema.nullable(),
  device_name: z.string().nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type BodyMeasurementSessionRow = z.infer<typeof bodyMeasurementSessionRowSchema>

export const bodyMeasurementSessionSchema = z.object({
  id: uuidSchema,
  measuredAt: timestamptzSchema,
  timezone: z.string().nullable(),
  deviceName: z.string().nullable(),
  metrics: z.array(bodyMetricSchema),
})

export type BodyMeasurementSession = z.infer<typeof bodyMeasurementSessionSchema>

export const bodyHistoryResponseSchema = z.object({
  sessions: z.array(bodyMeasurementSessionSchema),
})

export type BodyHistoryResponse = z.infer<typeof bodyHistoryResponseSchema>

export const fitProfilePreviewMetricSchema = z.object({
  key: z.string().min(1),
  value: z.number(),
  unit: canonicalUnitSchema,
  valueKind: bodyValueKindSchema,
  displayValue: z.number(),
  displayUnit: z.string().min(1),
  sourceHeader: z.string().min(1),
  sourceValue: z.number(),
})

export type FitProfilePreviewMetric = z.infer<typeof fitProfilePreviewMetricSchema>

export const fitProfilePreviewCandidateSchema = z.object({
  fingerprint: z.string().min(1),
  duplicate: z.boolean(),
  measuredAt: z.iso.datetime(),
  timezone: z.string().min(1),
  deviceName: z.string().nullable(),
  sourceMeasuredAt: z.string().min(1),
  metrics: z.array(fitProfilePreviewMetricSchema),
  selectedByDefault: z.boolean(),
})

export type FitProfilePreviewCandidate = z.infer<typeof fitProfilePreviewCandidateSchema>

export const fitProfilePreviewResponseSchema = z.object({
  timezone: z.string().min(1),
  filename: z.string().nullable(),
  newCount: z.int().nonnegative(),
  duplicateCount: z.int().nonnegative(),
  errorCount: z.int().nonnegative(),
  candidates: z.array(fitProfilePreviewCandidateSchema),
  errors: z.array(z.string()),
})

export type FitProfilePreviewResponse = z.infer<typeof fitProfilePreviewResponseSchema>

export const fitProfileCommitResponseSchema = z.object({
  importJobId: uuidSchema,
  insertedCount: z.int().nonnegative(),
  matchedCount: z.int().nonnegative(),
  skippedCount: z.int().nonnegative(),
  errorCount: z.int().nonnegative(),
})

export type FitProfileCommitResponse = z.infer<typeof fitProfileCommitResponseSchema>
