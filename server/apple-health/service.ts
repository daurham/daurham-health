import { randomUUID } from 'node:crypto'
import {
  APPLE_HEALTH_PARSER_VERSION,
  APPLE_HEALTH_SOURCE_KEY,
} from '../../src/domain/apple-health/config.js'
import type { NormalizedAppleHealthRecord } from '../../src/domain/apple-health/parse.js'
import type { AppleHealthPreviewCounts } from '../../src/domain/apple-health/preview.js'
import { fingerprintForRecord } from '../../src/domain/apple-health/types.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { latestHealthAutoExportStatus } from './hae-service.js'
import { buildAppleHealthClaimStatement } from './commit-sql.js'
import {
  APPLE_HEALTH_SOURCE_SQL,
  EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL,
  GET_APPLE_HEALTH_JOB_SQL,
  INSERT_APPLE_HEALTH_JOB_SQL,
  LATEST_APPLE_HEALTH_JOB_SQL,
  UPDATE_APPLE_HEALTH_JOB_SQL,
} from './queries.js'

const TRANSACTION_CHUNK = 25

export type AppleHealthImportSummary = {
  exportDate?: string | null
  dateRange?: { start: string; end: string } | null
  sources?: string[]
  devices?: string[]
  unknownSleepCategories?: string[]
  overlappingActivityGroups?: number
  counts?: AppleHealthPreviewCounts
}

export type AppleHealthStatusResponse = {
  sourceKey: typeof APPLE_HEALTH_SOURCE_KEY
  job: {
    id: string
    importedAt: string
    sourceFilename: string | null
    formatVersion: string | null
    status: string
    recordCount: number
    insertedCount: number
    matchedCount: number
    skippedCount: number
    errorCount: number
    activityCount: number
    sleepCount: number
    workoutCount: number
    metadata: Record<string, unknown>
  } | null
  autoExport: {
    importedAt: string
    status: string
    latestDay: string | null
  } | null
  activitySampleCount: number
}

export type AppleHealthPreviewLookup = {
  existingFingerprints: string[]
  duplicateCount: number
}

export type AppleHealthCommitResult = {
  jobId: string
  insertedCount: number
  matchedCount: number
  status: string
}

const JOB_LINK_COUNT_SQL = `SELECT COUNT(*)::int AS count FROM source_record_links WHERE import_job_id = $1`

async function appleHealthSourceId(): Promise<string> {
  const sql = await getSql()
  try {
    const rows = (await sql.query(APPLE_HEALTH_SOURCE_SQL, [])) as Array<{ id: string }>
    const id = rows[0]?.id
    if (!id) {
      throw new HttpError(503, 'Apple Health data source is not available. Apply pending migrations.')
    }
    return id
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    throw new HttpError(503, formatDatabaseError(error))
  }
}

function skippedFromSummary(summary: AppleHealthImportSummary | undefined): number {
  const counts = summary?.counts
  if (!counts) {
    return 0
  }
  return counts.bodyOwned + counts.nutritionOwned + counts.unsupported + counts.malformed
}

function jobMetadata(summary: AppleHealthImportSummary | undefined): Record<string, unknown> {
  return {
    parserVersion: APPLE_HEALTH_PARSER_VERSION,
    ...(summary ?? {}),
  }
}

async function countJobLinks(jobId: string): Promise<number> {
  const sql = await getSql()
  const rows = (await sql.query(JOB_LINK_COUNT_SQL, [jobId])) as Array<{ count: number }>
  return rows[0]?.count ?? 0
}

export async function lookupAppleHealthFingerprints(
  fingerprints: readonly string[],
): Promise<AppleHealthPreviewLookup> {
  if (fingerprints.length === 0) {
    return { existingFingerprints: [], duplicateCount: 0 }
  }
  const sourceId = await appleHealthSourceId()
  const sql = await getSql()
  try {
    const rows = (await sql.query(EXISTING_APPLE_HEALTH_FINGERPRINTS_SQL, [
      sourceId,
      fingerprints,
    ])) as Array<{ external_fingerprint: string }>
    const existingFingerprints = rows.map((row) => row.external_fingerprint)
    return { existingFingerprints, duplicateCount: existingFingerprints.length }
  } catch (error) {
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Apple Health tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Could not look up Apple Health fingerprints')
  }
}

export async function appleHealthImportStatus(): Promise<AppleHealthStatusResponse> {
  const sourceId = await appleHealthSourceId()
  const sql = await getSql()
  try {
    const rows = (await sql.query(LATEST_APPLE_HEALTH_JOB_SQL, [sourceId])) as Array<{
      id: string
      imported_at: string | Date
      source_filename: string | null
      format_version: string | null
      status: string
      record_count: number
      inserted_count: number
      matched_count: number
      skipped_count: number
      error_count: number
      metadata: Record<string, unknown>
      activity_count: number
      sleep_count: number
      workout_count: number
    }>
    const row = rows[0]
    const autoExport = await latestHealthAutoExportStatus()
    const sampleRows = (await sql.query(`SELECT COUNT(*)::int AS count FROM activity_samples`)) as Array<{
      count: number
    }>
    const activitySampleCount = sampleRows[0]?.count ?? 0
    if (!row) {
      return { sourceKey: APPLE_HEALTH_SOURCE_KEY, job: null, autoExport, activitySampleCount }
    }
    return {
      sourceKey: APPLE_HEALTH_SOURCE_KEY,
      job: {
        id: row.id,
        importedAt: new Date(row.imported_at).toISOString(),
        sourceFilename: row.source_filename,
        formatVersion: row.format_version,
        status: row.status,
        recordCount: row.record_count,
        insertedCount: row.inserted_count,
        matchedCount: row.matched_count,
        skippedCount: row.skipped_count,
        errorCount: row.error_count,
        activityCount: row.activity_count,
        sleepCount: row.sleep_count,
        workoutCount: row.workout_count,
        metadata: row.metadata ?? {},
      },
      autoExport,
      activitySampleCount,
    }
  } catch (error) {
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Apple Health tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Could not load Apple Health import status')
  }
}

export async function ingestNormalizedAppleHealthRecords(input: {
  records: readonly NormalizedAppleHealthRecord[]
  jobId?: string
  complete?: boolean
  summary?: AppleHealthImportSummary
  sourceFilename?: string
}): Promise<AppleHealthCommitResult> {
  const records = input.records.map((record) => ({
    ...record,
    fingerprint: record.fingerprint || fingerprintForRecord(record),
  }))
  const sourceId = await appleHealthSourceId()
  const sql = await getSql()
  let jobId = input.jobId ?? randomUUID()

  try {
    if (input.jobId) {
      const existing = (await sql.query(GET_APPLE_HEALTH_JOB_SQL, [input.jobId, sourceId])) as Array<{
        id: string
      }>
      if (!existing[0]) {
        throw new HttpError(400, 'Apple Health import job was not found')
      }
      jobId = input.jobId
    } else {
      await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
        jobId,
        sourceId,
        input.sourceFilename ?? 'apple-health-normalized',
        `apple_health.${APPLE_HEALTH_PARSER_VERSION}`,
        input.summary?.counts?.encountered ?? records.length,
        skippedFromSummary(input.summary),
        JSON.stringify(jobMetadata(input.summary)),
      ])
    }

    const linksBefore = await countJobLinks(jobId)
    for (let offset = 0; offset < records.length; offset += TRANSACTION_CHUNK) {
      const chunk = records.slice(offset, offset + TRANSACTION_CHUNK)
      const queries = chunk.map((record) => {
        const statement = buildAppleHealthClaimStatement({ sourceId, jobId, record })
        return sql.query(statement.sql, statement.params)
      })
      if (queries.length > 0) {
        await sql.transaction(queries)
      }
    }
    const linksAfter = await countJobLinks(jobId)
    const insertedCount = Math.max(0, linksAfter - linksBefore)
    const matchedCount = Math.max(0, records.length - insertedCount)
    const status = input.complete === false ? 'processing' : 'completed'

    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      status,
      insertedCount,
      matchedCount,
      skippedFromSummary(input.summary),
      input.summary?.counts?.encountered ?? records.length,
      0,
      input.summary ? JSON.stringify(jobMetadata(input.summary)) : null,
    ])

    return { jobId, insertedCount, matchedCount, status }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Apple Health tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Apple Health import could not be completed')
  }
}
