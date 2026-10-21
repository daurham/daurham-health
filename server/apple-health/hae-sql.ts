import { randomUUID } from 'node:crypto'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import {
  HAE_BASIS,
  HAE_CALCULATION_VERSION,
  HAE_SOURCE,
  HAE_SOURCE_VERSION,
  type HaeDayPatch,
} from '../../src/domain/apple-health/hae.js'

export const HAE_COMMIT_BATCH = 40

export const HAE_SOURCE_SQL = `SELECT id FROM data_sources WHERE key = 'health_auto_export' LIMIT 1`

export const LATEST_HAE_JOB_SQL = `SELECT id, imported_at, status, source_filename, format_version, metadata
         FROM import_jobs
         WHERE source_id = $1
         ORDER BY imported_at DESC
         LIMIT 1`

export const LATEST_ACTIVITY_DAY_SQL = `SELECT MAX(summary_date)::text AS latest_day, COUNT(*)::int AS daily_rows
         FROM activity_daily_summaries
         WHERE timezone = $1`

/**
 * Absent metrics arrive as NULL and keep the stored value.
 * walking_running_distance_m is never written by this statement.
 */
const HAE_MERGED_EVIDENCE_SQL = `jsonb_set(
      COALESCE(activity_daily_summaries.evidence, '{}'::jsonb) || jsonb_build_object(
        'source', $12::text,
        'sourceVersion', $13::text,
        'basis', $14::text
      ),
      '{metrics}',
      COALESCE(activity_daily_summaries.evidence->'metrics', '{}'::jsonb)
        || COALESCE(EXCLUDED.evidence->'metrics', '{}'::jsonb),
      true
    )`

export const UPSERT_HAE_DAILY_SQL = `
WITH existing AS (
  SELECT id
  FROM activity_daily_summaries
  WHERE summary_date = $2::date AND timezone = $3
),
upserted AS (
  INSERT INTO activity_daily_summaries (
    id, summary_date, timezone, steps_count, active_energy_kcal, exercise_minutes,
    walking_running_distance_m, resting_heart_rate_bpm, calculation_version, evidence,
    source_id, import_job_id, updated_at
  ) VALUES (
    $1::uuid, $2::date, $3, $4::numeric, $5::numeric, $6::numeric,
    NULL, $7::numeric, $8, $9::jsonb, $10::uuid, $11::uuid, now()
  )
  ON CONFLICT (summary_date, timezone) DO UPDATE SET
    steps_count = COALESCE(EXCLUDED.steps_count, activity_daily_summaries.steps_count),
    active_energy_kcal = COALESCE(EXCLUDED.active_energy_kcal, activity_daily_summaries.active_energy_kcal),
    exercise_minutes = COALESCE(EXCLUDED.exercise_minutes, activity_daily_summaries.exercise_minutes),
    resting_heart_rate_bpm = COALESCE(EXCLUDED.resting_heart_rate_bpm, activity_daily_summaries.resting_heart_rate_bpm),
    calculation_version = EXCLUDED.calculation_version,
    evidence = ${HAE_MERGED_EVIDENCE_SQL},
    source_id = EXCLUDED.source_id,
    import_job_id = EXCLUDED.import_job_id,
    updated_at = now()
  WHERE activity_daily_summaries.steps_count IS DISTINCT FROM COALESCE(EXCLUDED.steps_count, activity_daily_summaries.steps_count)
     OR activity_daily_summaries.active_energy_kcal IS DISTINCT FROM COALESCE(EXCLUDED.active_energy_kcal, activity_daily_summaries.active_energy_kcal)
     OR activity_daily_summaries.exercise_minutes IS DISTINCT FROM COALESCE(EXCLUDED.exercise_minutes, activity_daily_summaries.exercise_minutes)
     OR activity_daily_summaries.resting_heart_rate_bpm IS DISTINCT FROM COALESCE(EXCLUDED.resting_heart_rate_bpm, activity_daily_summaries.resting_heart_rate_bpm)
     OR activity_daily_summaries.calculation_version IS DISTINCT FROM EXCLUDED.calculation_version
     OR activity_daily_summaries.evidence IS DISTINCT FROM ${HAE_MERGED_EVIDENCE_SQL}
     OR activity_daily_summaries.source_id IS DISTINCT FROM EXCLUDED.source_id
  RETURNING id
)
SELECT upserted.id, (existing.id IS NULL) AS inserted
FROM upserted
LEFT JOIN existing ON true
`.trim()

/** Conflict rows that are semantically unchanged return no rows from the upsert. */
export function tallyHaeDailyResults(rows: ReadonlyArray<ReadonlyArray<{ inserted: boolean }>>): {
  inserted: number
  updated: number
  unchanged: number
} {
  const counts = { inserted: 0, updated: 0, unchanged: 0 }
  for (const result of rows) {
    if (result.length === 0) counts.unchanged += 1
    else if (result[0]?.inserted) counts.inserted += 1
    else counts.updated += 1
  }
  return counts
}

export function haeDailyFingerprint(date: string, timezone = HEALTH_CALENDAR_TIME_ZONE): string {
  return `health_auto_export|activity_daily|${timezone}|${date}`
}

export function buildHaeDailyStatement(input: { sourceId: string; jobId: string; day: HaeDayPatch }) {
  const evidence = {
    source: HAE_SOURCE,
    sourceVersion: HAE_SOURCE_VERSION,
    basis: HAE_BASIS,
    metrics: input.day.metrics,
  }
  return {
    sql: UPSERT_HAE_DAILY_SQL,
    fingerprint: haeDailyFingerprint(input.day.date, input.day.timezone),
    params: [
      randomUUID(),
      input.day.date,
      input.day.timezone,
      input.day.stepsCount,
      input.day.activeEnergyKcal,
      input.day.exerciseMinutes,
      input.day.restingHeartRateBpm,
      HAE_CALCULATION_VERSION,
      JSON.stringify(evidence),
      input.sourceId,
      input.jobId,
      HAE_SOURCE,
      HAE_SOURCE_VERSION,
      HAE_BASIS,
    ],
  }
}
