import {
  HOME_AI_JOB_ID_RE,
  homeAiJobStatusSchema,
  isHomeAiJobId,
  type HomeAiJobStatus,
} from '../../src/domain/training-transcription.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'

const TABLES_UNAVAILABLE = 'Training tables are not available. Apply pending migrations.'

export const TRANSCRIPTION_JOB_STATUSES = [
  'queued',
  'processing',
  'completed',
  'failed',
  'committed',
] as const

export type TranscriptionJobRecordStatus = (typeof TRANSCRIPTION_JOB_STATUSES)[number]

export type TranscriptionJobRecord = {
  id: string
  status: TranscriptionJobRecordStatus
  filename: string | null
  failureMessage: string | null
  createdAt: string
  updatedAt: string
}

function asMissingRelation(error: unknown): boolean {
  return formatDatabaseError(error).includes('does not exist')
}

async function queryOrUnavailable<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw error
  }
}

function mapRow(row: Record<string, unknown>): TranscriptionJobRecord {
  const created = row.created_at
  const updated = row.updated_at
  return {
    id: String(row.home_ai_job_id),
    status: row.status as TranscriptionJobRecordStatus,
    filename: typeof row.source_filename === 'string' ? row.source_filename : null,
    failureMessage: typeof row.failure_message === 'string' ? row.failure_message : null,
    createdAt: created instanceof Date ? created.toISOString() : String(created),
    updatedAt: updated instanceof Date ? updated.toISOString() : String(updated),
  }
}

export async function recordTranscriptionJobCreated(input: {
  jobId: string
  filename: string | null
}): Promise<void> {
  if (!isHomeAiJobId(input.jobId)) {
    throw new HttpError(400, 'That analysis job id is invalid.')
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `INSERT INTO workout_transcription_jobs (home_ai_job_id, status, source_filename)
       VALUES ($1, 'queued', $2)
       ON CONFLICT (home_ai_job_id) DO UPDATE
         SET status = CASE
           WHEN workout_transcription_jobs.status = 'committed' THEN workout_transcription_jobs.status
           ELSE 'queued'
         END,
         source_filename = COALESCE(EXCLUDED.source_filename, workout_transcription_jobs.source_filename),
         updated_at = now()`,
      [input.jobId, input.filename],
    ),
  )
}

export async function recordTranscriptionJobStatus(input: {
  jobId: string
  status: HomeAiJobStatus
  failureMessage?: string | null
}): Promise<void> {
  if (!isHomeAiJobId(input.jobId)) {
    return
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `UPDATE workout_transcription_jobs
       SET status = CASE
             WHEN status = 'committed' THEN status
             ELSE $2
           END,
           failure_message = CASE
             WHEN $2 = 'failed' THEN $3
             WHEN status = 'committed' THEN failure_message
             ELSE NULL
           END,
           updated_at = now()
       WHERE home_ai_job_id = $1`,
      [input.jobId, input.status, input.failureMessage ?? null],
    ),
  )
}

export async function recordTranscriptionJobCommitted(jobId: string, sessionId: string): Promise<void> {
  if (!isHomeAiJobId(jobId)) {
    return
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `UPDATE workout_transcription_jobs
       SET status = 'committed',
           workout_session_id = $2,
           failure_message = NULL,
           updated_at = now()
       WHERE home_ai_job_id = $1`,
      [jobId, sessionId],
    ),
  )
}

export async function listOutstandingTranscriptionJobs(): Promise<TranscriptionJobRecord[]> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT home_ai_job_id, status, source_filename, failure_message, created_at, updated_at
       FROM workout_transcription_jobs
       WHERE status <> 'committed'
       ORDER BY created_at DESC
       LIMIT 50`,
    ),
  )
  return (rows as Record<string, unknown>[]).map(mapRow)
}

export async function refreshOutstandingTranscriptionJobs(
  client?: HomeAiClient,
): Promise<TranscriptionJobRecord[]> {
  const jobs = await listOutstandingTranscriptionJobs()
  const homeAi = client ?? (await getHomeAiClient())
  for (const job of jobs) {
    if (job.status === 'failed' || job.status === 'completed' || job.status === 'committed') {
      continue
    }
    if (!HOME_AI_JOB_ID_RE.test(job.id)) {
      continue
    }
    try {
      const live = await homeAi.getWorkoutTranscriptionJob(job.id)
      const status = homeAiJobStatusSchema.parse(live.status)
      await recordTranscriptionJobStatus({
        jobId: job.id,
        status,
        failureMessage: live.error?.message ?? null,
      })
    } catch {
      // Keep the last known Health status if Home-AI is unreachable.
    }
  }
  return listOutstandingTranscriptionJobs()
}
