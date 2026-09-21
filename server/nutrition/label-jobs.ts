// Processed label images live on Home-AI disk ($FILE_SHARE_DIR/nutrition-labels/{jobId}.jpg),
// not in Neon. They are pruned after ~24h. Health proxies them for review while available.
// Commit stores reviewed numbers only and does not require the source image to remain.
import { HOME_AI_JOB_ID_RE, isHomeAiJobId, homeAiLabelJobStatusSchema } from '../../src/domain/nutrition/label.js'
import { NUTRITION_LABEL_CAPTURE_KIND } from '../../src/domain/nutrition/label.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'

const TABLES_UNAVAILABLE = 'Nutrition tables are not available. Apply pending migrations.'

export const CAPTURE_JOB_STATUSES = ['queued', 'processing', 'completed', 'failed', 'committed'] as const
export type CaptureJobRecordStatus = (typeof CAPTURE_JOB_STATUSES)[number]

export type NutritionCaptureKind = 'nutrition_label' | 'meal_photo'

export type NutritionCaptureJobRecord = {
  id: string
  status: CaptureJobRecordStatus
  captureKind: NutritionCaptureKind
  filename: string | null
  failureMessage: string | null
  candidate: unknown | null
  createdAt: string
  updatedAt: string
  committedAt: string | null
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

function mapRow(row: Record<string, unknown>): NutritionCaptureJobRecord {
  return {
    id: String(row.home_ai_job_id),
    status: row.status as CaptureJobRecordStatus,
    captureKind: (row.capture_kind as NutritionCaptureKind) ?? 'nutrition_label',
    filename: typeof row.source_filename === 'string' ? row.source_filename : null,
    failureMessage: typeof row.failure_message === 'string' ? row.failure_message : null,
    candidate: row.candidate_json ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    committedAt:
      row.committed_at == null
        ? null
        : row.committed_at instanceof Date
          ? row.committed_at.toISOString()
          : String(row.committed_at),
  }
}

export async function recordLabelJobCreated(input: {
  jobId: string
  filename: string | null
  captureKind?: NutritionCaptureKind
}): Promise<void> {
  if (!isHomeAiJobId(input.jobId)) {
    throw new HttpError(400, 'That analysis job id is invalid.')
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `INSERT INTO nutrition_capture_jobs (home_ai_job_id, capture_kind, status, source_filename)
       VALUES ($1, $2, 'queued', $3)
       ON CONFLICT (home_ai_job_id) DO UPDATE
         SET status = CASE
           WHEN nutrition_capture_jobs.status = 'committed' THEN nutrition_capture_jobs.status
           ELSE 'queued'
         END,
         source_filename = COALESCE(EXCLUDED.source_filename, nutrition_capture_jobs.source_filename),
         updated_at = now()`,
      [input.jobId, input.captureKind ?? NUTRITION_LABEL_CAPTURE_KIND, input.filename],
    ),
  )
}

export async function recordLabelJobStatus(input: {
  jobId: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  failureMessage?: string | null
  candidate?: unknown | null
}): Promise<void> {
  if (!isHomeAiJobId(input.jobId)) {
    return
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `UPDATE nutrition_capture_jobs
       SET status = CASE WHEN status = 'committed' THEN status ELSE $2 END,
           failure_message = CASE
             WHEN $2 = 'failed' THEN $3
             WHEN status = 'committed' THEN failure_message
             ELSE NULL
           END,
           candidate_json = CASE
             WHEN $4::jsonb IS NULL THEN candidate_json
             ELSE $4::jsonb
           END,
           updated_at = now()
       WHERE home_ai_job_id = $1`,
      [input.jobId, input.status, input.failureMessage ?? null, input.candidate ? JSON.stringify(input.candidate) : null],
    ),
  )
}

export async function recordLabelJobCommitted(jobId: string, foodId: string, entryId: string): Promise<void> {
  if (!isHomeAiJobId(jobId)) {
    return
  }
  const sql = await getSql()
  await queryOrUnavailable(() =>
    sql.query(
      `UPDATE nutrition_capture_jobs
       SET status = 'committed',
           food_id = $2::uuid,
           entry_id = $3::uuid,
           failure_message = NULL,
           committed_at = now(),
           updated_at = now()
       WHERE home_ai_job_id = $1`,
      [jobId, foodId, entryId],
    ),
  )
}

const CAPTURE_JOB_COLUMNS = `home_ai_job_id, capture_kind, status, source_filename, failure_message, candidate_json, created_at, updated_at, committed_at`

export async function listOutstandingLabelJobs(
  captureKind: NutritionCaptureKind = 'nutrition_label',
): Promise<NutritionCaptureJobRecord[]> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT ${CAPTURE_JOB_COLUMNS}
       FROM nutrition_capture_jobs
       WHERE status <> 'committed' AND capture_kind = $1
       ORDER BY created_at DESC
       LIMIT 20`,
      [captureKind],
    ),
  )
  return (rows as Record<string, unknown>[]).map(mapRow)
}

export async function getLabelJobRecord(jobId: string): Promise<NutritionCaptureJobRecord | null> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT ${CAPTURE_JOB_COLUMNS}
       FROM nutrition_capture_jobs WHERE home_ai_job_id = $1`,
      [jobId],
    ),
  )
  const row = (rows as Record<string, unknown>[])[0]
  return row ? mapRow(row) : null
}

export async function refreshOutstandingLabelJobs(client?: HomeAiClient): Promise<NutritionCaptureJobRecord[]> {
  const jobs = await listOutstandingLabelJobs()
  const homeAi = client ?? (await getHomeAiClient())
  for (const job of jobs) {
    if (job.status === 'failed' || job.status === 'completed' || job.status === 'committed') {
      continue
    }
    if (!HOME_AI_JOB_ID_RE.test(job.id)) {
      continue
    }
    try {
      const live = await homeAi.getNutritionLabelJob(job.id)
      const status = homeAiLabelJobStatusSchema.parse(live.status)
      await recordLabelJobStatus({
        jobId: job.id,
        status,
        failureMessage: live.error?.message ?? null,
        candidate: live.candidate ?? null,
      })
    } catch {
      // Keep last known Health status if Home-AI is unreachable.
    }
  }
  return listOutstandingLabelJobs()
}

export async function findCommittedLabelEntry(jobId: string): Promise<{ foodId: string; entryId: string } | null> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT food_id, entry_id FROM nutrition_capture_jobs
       WHERE home_ai_job_id = $1 AND status = 'committed' AND entry_id IS NOT NULL`,
      [jobId],
    ),
  )
  const row = (rows as Array<{ food_id?: string; entry_id?: string }>)[0]
  if (!row?.food_id || !row.entry_id) {
    return null
  }
  return { foodId: row.food_id, entryId: row.entry_id }
}
