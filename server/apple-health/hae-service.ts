import { randomUUID } from 'node:crypto'
import {
  HAE_CALCULATION_VERSION,
  HAE_SOURCE_VERSION,
  parseHealthAutoExport,
  type HaeParseResult,
} from '../../src/domain/apple-health/hae.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { INSERT_APPLE_HEALTH_JOB_SQL, UPDATE_APPLE_HEALTH_JOB_SQL } from './queries.js'
import { HAE_COMMIT_BATCH, HAE_SOURCE_SQL, LATEST_ACTIVITY_DAY_SQL, LATEST_HAE_JOB_SQL, buildHaeDailyStatement } from './hae-sql.js'

export type HaeIngestResult = {
  accepted: true
  daysSeen: number
  daysInserted: number
  daysUpdated: number
  metricsApplied: HaeParseResult['metricsApplied']
  ignoredMetrics: string[]
  ignoredDistanceCount: number
  jobId: string
}

export type HaeSyncStatus = {
  importedAt: string
  status: string
  latestDay: string | null
} | null

async function haeSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(HAE_SOURCE_SQL)) as Array<{ id: string }>
  const sourceId = rows[0]?.id
  if (!sourceId) {
    throw new HttpError(503, 'Health Auto Export source is not available. Apply pending migrations.')
  }
  return sourceId
}

export async function latestHealthAutoExportStatus(): Promise<HaeSyncStatus> {
  const sql = await getSql()
  const sourceRows = (await sql.query(HAE_SOURCE_SQL)) as Array<{ id: string }>
  const sourceId = sourceRows[0]?.id
  if (!sourceId) {
    return null
  }
  const jobs = (await sql.query(LATEST_HAE_JOB_SQL, [sourceId])) as Array<{
    imported_at: string | Date
    status: string
  }>
  const job = jobs[0]
  if (!job) {
    return null
  }
  const days = (await sql.query(LATEST_ACTIVITY_DAY_SQL, [HEALTH_CALENDAR_TIME_ZONE])) as Array<{
    latest_day: string | null
  }>
  return {
    importedAt: new Date(job.imported_at).toISOString(),
    status: job.status,
    latestDay: days[0]?.latest_day ?? null,
  }
}

export async function ingestHealthAutoExport(input: {
  payload: unknown
  sourceFilename?: string
  contentHash?: string | null
}): Promise<HaeIngestResult> {
  const parsed = parseHealthAutoExport(input.payload)
  const sourceId = await haeSourceId()
  const sql = await getSql()
  const jobId = randomUUID()
  try {
    await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
      jobId,
      sourceId,
      input.sourceFilename ?? 'health-auto-export.json',
      `health_auto_export.${HAE_SOURCE_VERSION}+${HAE_CALCULATION_VERSION}`,
      parsed.days.length,
      parsed.ignoredDistanceCount,
      JSON.stringify({
        strategy: 'health_auto_export_daily',
        source: 'health_auto_export',
        sourceVersion: HAE_SOURCE_VERSION,
        basis: 'daily_summary',
        calculationVersion: HAE_CALCULATION_VERSION,
        contentHash: input.contentHash ?? null,
        ignoredMetrics: parsed.ignoredMetrics,
        ignoredDistanceCount: parsed.ignoredDistanceCount,
        metricsApplied: parsed.metricsApplied,
        activitySamplesWritten: 0,
        walkingRunningDistanceWritten: 0,
      }),
    ])

    let daysInserted = 0
    let daysUpdated = 0
    for (let offset = 0; offset < parsed.days.length; offset += HAE_COMMIT_BATCH) {
      const chunk = parsed.days.slice(offset, offset + HAE_COMMIT_BATCH)
      const statements = chunk.map((day) => buildHaeDailyStatement({ sourceId, jobId, day }))
      const results = (await sql.transaction(
        statements.map((statement) => sql.query(statement.sql, statement.params)),
      )) as Array<Array<{ inserted: boolean }>>
      for (const rows of results) {
        if (rows[0]?.inserted) {
          daysInserted += 1
        } else {
          daysUpdated += 1
        }
      }
    }

    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      daysInserted,
      daysUpdated,
      parsed.ignoredDistanceCount,
      parsed.days.length,
      0,
      null,
    ])

    return {
      accepted: true,
      daysSeen: parsed.days.length,
      daysInserted,
      daysUpdated,
      metricsApplied: parsed.metricsApplied,
      ignoredMetrics: parsed.ignoredMetrics.map((metric) => metric.name),
      ignoredDistanceCount: parsed.ignoredDistanceCount,
      jobId,
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Health Auto Export tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Health Auto Export sync could not be completed')
  }
}
