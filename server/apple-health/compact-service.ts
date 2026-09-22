import { randomUUID } from 'node:crypto'
import { APPLE_HEALTH_PARSER_VERSION, APPLE_HEALTH_SOURCE_KEY } from '../../src/domain/apple-health/config.js'
import type { CompactArchiveMetadata } from '../../src/domain/apple-health/compact-plan.js'
import type { ActivityDailySummary } from '../../src/domain/apple-health/daily.js'
import type { NormalizedSleepSample, NormalizedWorkoutSample } from '../../src/domain/apple-health/parse.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import {
  buildCompactDailyStatement,
  buildCompactIntervalStatement,
  chunkCompactStatements,
  FIND_COMPACT_JOB_BY_ARCHIVE_SQL,
  FIND_XML_ARCHIVE_JOB_SQL,
} from './compact-sql.js'
import { APPLE_HEALTH_SOURCE_SQL, INSERT_APPLE_HEALTH_JOB_SQL, UPDATE_APPLE_HEALTH_JOB_SQL } from './queries.js'

export type CompactCommitProgress = {
  phase: 'daily' | 'sleep' | 'workout'
  completed: number
  total: number
}

export type CompactCommitInput = {
  metadata: CompactArchiveMetadata
  days: readonly ActivityDailySummary[]
  sleep: readonly NormalizedSleepSample[]
  workouts: readonly NormalizedWorkoutSample[]
  sourceFilename: string
  jobId?: string
  onProgress?: (progress: CompactCommitProgress) => void
}

export type CompactCommitResult = {
  jobId: string
  status: 'completed'
  dailyRows: number
  sleepRows: number
  workoutRows: number
  activitySamplesWritten: 0
  resumed: boolean
}

async function appleHealthSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(APPLE_HEALTH_SOURCE_SQL)) as Array<{ id: string }>
  const sourceId = rows[0]?.id
  if (!sourceId) {
    throw new HttpError(503, 'Apple Health source is not available. Apply pending migrations.')
  }
  return sourceId
}

async function runChunks(
  statements: Array<{ sql: string; params: unknown[] }>,
  phase: CompactCommitProgress['phase'],
  onProgress?: (progress: CompactCommitProgress) => void,
) {
  const sql = await getSql()
  const chunks = chunkCompactStatements(statements)
  let completed = 0
  for (const chunk of chunks) {
    await sql.transaction(chunk.map((statement) => sql.query(statement.sql, statement.params)))
    completed += chunk.length
    onProgress?.({ phase, completed, total: statements.length })
  }
}

export async function commitCompactAppleHealth(input: CompactCommitInput): Promise<CompactCommitResult> {
  const sourceId = await appleHealthSourceId()
  const sql = await getSql()
  const archiveHash = input.metadata.archive.sha256
  let jobId = input.jobId
  let resumed = false
  if (!jobId && archiveHash) {
    const existing = (await sql.query(FIND_COMPACT_JOB_BY_ARCHIVE_SQL, [sourceId, archiveHash])) as Array<{
      id: string
    }>
    if (existing[0]?.id) {
      jobId = existing[0].id
      resumed = true
    }
  }
  jobId ??= randomUUID()

  try {
    if (!resumed && !input.jobId) {
      await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
        jobId,
        sourceId,
        input.sourceFilename,
        `apple_health.${APPLE_HEALTH_PARSER_VERSION}+${input.metadata.calculationVersion}`,
        input.days.length + input.sleep.length + input.workouts.length,
        0,
        JSON.stringify(input.metadata),
      ])
    }

    const daily = input.days.map((day) => buildCompactDailyStatement({ sourceId, jobId, day }))
    const sleep = input.sleep.map((record) =>
      buildCompactIntervalStatement({ sourceId, jobId, record }),
    )
    const workouts = input.workouts.map((record) =>
      buildCompactIntervalStatement({ sourceId, jobId, record }),
    )
    await runChunks(daily, 'daily', input.onProgress)
    await runChunks(sleep, 'sleep', input.onProgress)
    await runChunks(workouts, 'workout', input.onProgress)

    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      input.days.length + input.sleep.length + input.workouts.length,
      0,
      0,
      input.days.length + input.sleep.length + input.workouts.length,
      0,
      JSON.stringify({ ...input.metadata, activitySamplesWritten: 0, sourceKey: APPLE_HEALTH_SOURCE_KEY }),
    ])

    return {
      jobId,
      status: 'completed',
      dailyRows: input.days.length,
      sleepRows: input.sleep.length,
      workoutRows: input.workouts.length,
      activitySamplesWritten: 0,
      resumed,
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Apple Health tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Compact Apple Health import could not be completed')
  }
}

export async function commitAppleHealthSleepAndWorkouts(input: {
  metadata: CompactArchiveMetadata
  sleep: readonly NormalizedSleepSample[]
  workouts: readonly NormalizedWorkoutSample[]
  sourceFilename: string
  onProgress?: (progress: CompactCommitProgress) => void
}): Promise<CompactCommitResult> {
  const sourceId = await appleHealthSourceId()
  const sql = await getSql()
  const archiveHash = input.metadata.archive.sha256
  let jobId: string | undefined
  let resumed = false
  if (archiveHash) {
    const existing = (await sql.query(FIND_XML_ARCHIVE_JOB_SQL, [sourceId, archiveHash])) as Array<{ id: string }>
    if (existing[0]?.id) {
      jobId = existing[0].id
      resumed = true
    }
  }
  jobId ??= randomUUID()
  const metadata = {
    ...input.metadata,
    strategy: 'xml_sleep_workouts',
    calculationVersion: 'xml_sleep_workouts',
    activitySamplesWritten: 0,
    dailySummariesWritten: 0,
    reconcileCommitted: false,
    sourceKey: APPLE_HEALTH_SOURCE_KEY,
  }
  try {
    if (!resumed) {
      await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
        jobId,
        sourceId,
        input.sourceFilename,
        `apple_health.${APPLE_HEALTH_PARSER_VERSION}+xml_sleep_workouts`,
        input.sleep.length + input.workouts.length,
        0,
        JSON.stringify(metadata),
      ])
    }
    const sleep = input.sleep.map((record) => buildCompactIntervalStatement({ sourceId, jobId, record }))
    const workouts = input.workouts.map((record) => buildCompactIntervalStatement({ sourceId, jobId, record }))
    await runChunks(sleep, 'sleep', input.onProgress)
    await runChunks(workouts, 'workout', input.onProgress)
    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      resumed ? 0 : input.sleep.length + input.workouts.length,
      0,
      0,
      input.sleep.length + input.workouts.length,
      0,
      JSON.stringify(metadata),
    ])
    return {
      jobId,
      status: 'completed',
      dailyRows: 0,
      sleepRows: input.sleep.length,
      workoutRows: input.workouts.length,
      activitySamplesWritten: 0,
      resumed,
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Apple Health tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Apple Health sleep and workout import could not be completed')
  }
}
