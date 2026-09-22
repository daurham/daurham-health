import { randomUUID } from 'node:crypto'
import { ACTIVITY_DAILY_ENTITY } from '../../src/domain/apple-health/config.js'
import { activityDailyFingerprint, type ActivityDailySummary } from '../../src/domain/apple-health/daily.js'
import type { NormalizedAppleHealthRecord } from '../../src/domain/apple-health/parse.js'
import { buildAppleHealthClaimStatement, type AppleHealthClaimStatement } from './commit-sql.js'

export const COMPACT_COMMIT_BATCH = 25

export const FIND_XML_ARCHIVE_JOB_SQL = `SELECT id, status
         FROM import_jobs
         WHERE source_id = $1
           AND metadata->>'strategy' = 'xml_sleep_workouts'
           AND metadata->'archive'->>'sha256' = $2
         ORDER BY imported_at DESC
         LIMIT 1`

export const FIND_COMPACT_JOB_BY_ARCHIVE_SQL = `SELECT id, status
         FROM import_jobs
         WHERE source_id = $1
           AND metadata->>'strategy' = 'compact_canonical'
           AND metadata->'archive'->>'sha256' = $2
         ORDER BY imported_at DESC
         LIMIT 1`

export const UPSERT_ACTIVITY_DAILY_SUMMARY_SQL = `
WITH upserted AS (
  INSERT INTO activity_daily_summaries (
    id, summary_date, timezone, steps_count, active_energy_kcal, exercise_minutes,
    walking_running_distance_m, resting_heart_rate_bpm, calculation_version, evidence,
    source_id, import_job_id, updated_at
  ) VALUES (
    $1::uuid, $2::date, $3, $4::numeric, $5::numeric, $6::numeric,
    $7::numeric, $8::numeric, $9, $10::jsonb, $11::uuid, $12::uuid, now()
  )
  ON CONFLICT (summary_date, timezone) DO UPDATE SET
    steps_count = EXCLUDED.steps_count,
    active_energy_kcal = EXCLUDED.active_energy_kcal,
    exercise_minutes = EXCLUDED.exercise_minutes,
    walking_running_distance_m = EXCLUDED.walking_running_distance_m,
    resting_heart_rate_bpm = EXCLUDED.resting_heart_rate_bpm,
    calculation_version = EXCLUDED.calculation_version,
    evidence = EXCLUDED.evidence,
    source_id = EXCLUDED.source_id,
    import_job_id = EXCLUDED.import_job_id,
    updated_at = now()
  RETURNING id
)
INSERT INTO source_record_links (
  id, source_id, import_job_id, external_id, external_fingerprint,
  entity_type, entity_id, source_payload
)
SELECT $13::uuid, $11::uuid, $12::uuid, NULL, $14, $15, upserted.id, $16::jsonb
FROM upserted
ON CONFLICT (source_id, external_fingerprint) DO UPDATE SET
  import_job_id = EXCLUDED.import_job_id,
  entity_id = EXCLUDED.entity_id
`.trim()

export function buildCompactDailyStatement(input: {
  sourceId: string
  jobId: string
  day: ActivityDailySummary
  entityId?: string
  linkId?: string
}): AppleHealthClaimStatement {
  const fingerprint = activityDailyFingerprint(input.day.date, input.day.timezone)
  return {
    sql: UPSERT_ACTIVITY_DAILY_SUMMARY_SQL,
    fingerprint,
    entityType: ACTIVITY_DAILY_ENTITY,
    params: [
      input.entityId ?? randomUUID(),
      input.day.date,
      input.day.timezone,
      input.day.stepsCount,
      input.day.activeEnergyKcal,
      input.day.exerciseMinutes,
      input.day.walkingRunningDistanceM,
      input.day.restingHeartRateBpm,
      input.day.calculationVersion,
      JSON.stringify(input.day.evidence),
      input.sourceId,
      input.jobId,
      input.linkId ?? randomUUID(),
      fingerprint,
      ACTIVITY_DAILY_ENTITY,
      JSON.stringify({
        date: input.day.date,
        timezone: input.day.timezone,
        calculationVersion: input.day.calculationVersion,
      }),
    ],
  }
}

export function buildCompactIntervalStatement(input: {
  sourceId: string
  jobId: string
  record: NormalizedAppleHealthRecord
}): AppleHealthClaimStatement {
  if (input.record.kind === 'quantity') {
    throw new Error('Compact historical backfill does not write activity samples')
  }
  return buildAppleHealthClaimStatement(input)
}

export function chunkCompactStatements<T>(items: readonly T[], size = COMPACT_COMMIT_BATCH): T[][] {
  const chunks: T[][] = []
  for (let offset = 0; offset < items.length; offset += size) {
    chunks.push(items.slice(offset, offset + size))
  }
  return chunks
}

export function compactStatementIsIdempotent(sql: string): boolean {
  return sql.includes('ON CONFLICT')
}
