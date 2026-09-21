import { z } from 'zod'

export const dataSourceKeySchema = z.enum([
  'manual',
  'health_app',
  'legacy_nutrition',
  'fit_profile_xlsx',
  'apple_health',
  'workout_image',
  'home_ai',
])

export type DataSourceKey = z.infer<typeof dataSourceKeySchema>

export const dataSourceKindSchema = z.enum([
  'manual',
  'application',
  'file_import',
  'device_export',
  'image',
  'ai',
])

export type DataSourceKind = z.infer<typeof dataSourceKindSchema>

const uuidSchema = z.uuid()
const timestamptzSchema = z.coerce.date()
const jsonRecordSchema = z.record(z.string(), z.unknown())

export const dataSourceRowSchema = z.object({
  id: uuidSchema,
  key: dataSourceKeySchema,
  display_name: z.string().min(1),
  source_kind: dataSourceKindSchema,
  created_at: timestamptzSchema,
})

export type DataSourceRow = z.infer<typeof dataSourceRowSchema>

export const dataSourceSchema = z.object({
  id: uuidSchema,
  key: dataSourceKeySchema,
  displayName: z.string().min(1),
  sourceKind: dataSourceKindSchema,
  createdAt: timestamptzSchema,
})

export type DataSource = z.infer<typeof dataSourceSchema>

export function dataSourceFromRow(row: DataSourceRow): DataSource {
  return dataSourceSchema.parse({
    id: row.id,
    key: row.key,
    displayName: row.display_name,
    sourceKind: row.source_kind,
    createdAt: row.created_at,
  })
}

export const importJobRowSchema = z.object({
  id: uuidSchema,
  source_id: uuidSchema,
  imported_at: timestamptzSchema,
  source_filename: z.string().min(1).nullable(),
  format_version: z.string().min(1).nullable(),
  status: z.string().min(1),
  record_count: z.int().nonnegative(),
  inserted_count: z.int().nonnegative(),
  matched_count: z.int().nonnegative(),
  skipped_count: z.int().nonnegative(),
  error_count: z.int().nonnegative(),
  content_hash: z.string().min(1).nullable(),
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type ImportJobRow = z.infer<typeof importJobRowSchema>

export const importJobSchema = z.object({
  id: uuidSchema,
  sourceId: uuidSchema,
  importedAt: timestamptzSchema,
  sourceFilename: z.string().min(1).nullable(),
  formatVersion: z.string().min(1).nullable(),
  status: z.string().min(1),
  recordCount: z.int().nonnegative(),
  insertedCount: z.int().nonnegative(),
  matchedCount: z.int().nonnegative(),
  skippedCount: z.int().nonnegative(),
  errorCount: z.int().nonnegative(),
  contentHash: z.string().min(1).nullable(),
  metadata: jsonRecordSchema,
  createdAt: timestamptzSchema,
})

export type ImportJob = z.infer<typeof importJobSchema>

export function importJobFromRow(row: ImportJobRow): ImportJob {
  return importJobSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    importedAt: row.imported_at,
    sourceFilename: row.source_filename,
    formatVersion: row.format_version,
    status: row.status,
    recordCount: row.record_count,
    insertedCount: row.inserted_count,
    matchedCount: row.matched_count,
    skippedCount: row.skipped_count,
    errorCount: row.error_count,
    contentHash: row.content_hash,
    metadata: row.metadata,
    createdAt: row.created_at,
  })
}

export const sourceRecordLinkRowSchema = z.object({
  id: uuidSchema,
  source_id: uuidSchema,
  import_job_id: uuidSchema.nullable(),
  external_id: z.string().min(1).nullable(),
  external_fingerprint: z.string().min(1),
  entity_type: z.string().min(1),
  entity_id: uuidSchema,
  source_payload: z.unknown().nullable(),
  created_at: timestamptzSchema,
})

export type SourceRecordLinkRow = z.infer<typeof sourceRecordLinkRowSchema>

export const sourceRecordLinkSchema = z.object({
  id: uuidSchema,
  sourceId: uuidSchema,
  importJobId: uuidSchema.nullable(),
  externalId: z.string().min(1).nullable(),
  externalFingerprint: z.string().min(1),
  entityType: z.string().min(1),
  entityId: uuidSchema,
  sourcePayload: z.unknown().nullable(),
  createdAt: timestamptzSchema,
})

export type SourceRecordLink = z.infer<typeof sourceRecordLinkSchema>

export function sourceRecordLinkFromRow(row: SourceRecordLinkRow): SourceRecordLink {
  return sourceRecordLinkSchema.parse({
    id: row.id,
    sourceId: row.source_id,
    importJobId: row.import_job_id,
    externalId: row.external_id,
    externalFingerprint: row.external_fingerprint,
    entityType: row.entity_type,
    entityId: row.entity_id,
    sourcePayload: row.source_payload,
    createdAt: row.created_at,
  })
}
