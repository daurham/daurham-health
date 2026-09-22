import type { SleepIntervalRow, SleepNightlySummary, SleepObservationStatus, SleepSelectionReason } from '../../src/domain/sleep/index.js'
import type { ProgressSleepObservation } from '../../src/domain/progress/health-timeline.js'
import { getSql } from '../db.js'

export const LIST_SLEEP_INTERVALS_SQL = `SELECT id::text,
           start_at,
           end_at,
           stage,
           source_category,
           source_name,
           source_version,
           device_name,
           source_id::text
         FROM sleep_intervals
         ORDER BY start_at ASC, end_at ASC, id ASC`

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

export async function listSleepIntervals(): Promise<SleepIntervalRow[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_SLEEP_INTERVALS_SQL)) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    startAt: asIso(row.start_at),
    endAt: asIso(row.end_at),
    stage: String(row.stage),
    sourceCategory: String(row.source_category),
    sourceName: typeof row.source_name === 'string' ? row.source_name : null,
    sourceVersion: typeof row.source_version === 'string' ? row.source_version : null,
    deviceName: typeof row.device_name === 'string' ? row.device_name : null,
    sourceId: typeof row.source_id === 'string' ? row.source_id : null,
  }))
}

export const UPSERT_SLEEP_NIGHTLY_SUMMARY_SQL = `INSERT INTO sleep_nightly_summaries (
           sleep_date, timezone, logical_source_key, source_name, start_at, end_at,
           total_sleep_minutes, time_in_bed_minutes, awake_minutes,
           core_minutes, deep_minutes, rem_minutes, unspecified_sleep_minutes,
           stage_coverage_pct, stage_conflict_minutes,
           observation_status, analysis_eligible, stage_analysis_eligible, selection_reason,
           calculation_version, evidence, source_id, import_job_id, updated_at
         ) VALUES (
           $1::date, $2, $3, $4, $5::timestamptz, $6::timestamptz,
           $7::numeric, $8::numeric, $9::numeric,
           $10::numeric, $11::numeric, $12::numeric, $13::numeric,
           $14::numeric, $15::numeric,
           $16, $17::boolean, $18::boolean, $19,
           $20, $21::jsonb, $22::uuid, $23::uuid, now()
         )
         ON CONFLICT (sleep_date, timezone) DO UPDATE SET
           logical_source_key = EXCLUDED.logical_source_key,
           source_name = EXCLUDED.source_name,
           start_at = EXCLUDED.start_at,
           end_at = EXCLUDED.end_at,
           total_sleep_minutes = EXCLUDED.total_sleep_minutes,
           time_in_bed_minutes = EXCLUDED.time_in_bed_minutes,
           awake_minutes = EXCLUDED.awake_minutes,
           core_minutes = EXCLUDED.core_minutes,
           deep_minutes = EXCLUDED.deep_minutes,
           rem_minutes = EXCLUDED.rem_minutes,
           unspecified_sleep_minutes = EXCLUDED.unspecified_sleep_minutes,
           stage_coverage_pct = EXCLUDED.stage_coverage_pct,
           stage_conflict_minutes = EXCLUDED.stage_conflict_minutes,
           observation_status = EXCLUDED.observation_status,
           analysis_eligible = EXCLUDED.analysis_eligible,
           stage_analysis_eligible = EXCLUDED.stage_analysis_eligible,
           selection_reason = EXCLUDED.selection_reason,
           calculation_version = EXCLUDED.calculation_version,
           evidence = EXCLUDED.evidence,
           source_id = EXCLUDED.source_id,
           import_job_id = EXCLUDED.import_job_id,
           updated_at = now()
         WHERE sleep_nightly_summaries.logical_source_key IS DISTINCT FROM EXCLUDED.logical_source_key
            OR sleep_nightly_summaries.source_name IS DISTINCT FROM EXCLUDED.source_name
            OR sleep_nightly_summaries.start_at IS DISTINCT FROM EXCLUDED.start_at
            OR sleep_nightly_summaries.end_at IS DISTINCT FROM EXCLUDED.end_at
            OR sleep_nightly_summaries.total_sleep_minutes IS DISTINCT FROM EXCLUDED.total_sleep_minutes
            OR sleep_nightly_summaries.time_in_bed_minutes IS DISTINCT FROM EXCLUDED.time_in_bed_minutes
            OR sleep_nightly_summaries.awake_minutes IS DISTINCT FROM EXCLUDED.awake_minutes
            OR sleep_nightly_summaries.core_minutes IS DISTINCT FROM EXCLUDED.core_minutes
            OR sleep_nightly_summaries.deep_minutes IS DISTINCT FROM EXCLUDED.deep_minutes
            OR sleep_nightly_summaries.rem_minutes IS DISTINCT FROM EXCLUDED.rem_minutes
            OR sleep_nightly_summaries.unspecified_sleep_minutes IS DISTINCT FROM EXCLUDED.unspecified_sleep_minutes
            OR sleep_nightly_summaries.stage_coverage_pct IS DISTINCT FROM EXCLUDED.stage_coverage_pct
            OR sleep_nightly_summaries.stage_conflict_minutes IS DISTINCT FROM EXCLUDED.stage_conflict_minutes
            OR sleep_nightly_summaries.observation_status IS DISTINCT FROM EXCLUDED.observation_status
            OR sleep_nightly_summaries.analysis_eligible IS DISTINCT FROM EXCLUDED.analysis_eligible
            OR sleep_nightly_summaries.stage_analysis_eligible IS DISTINCT FROM EXCLUDED.stage_analysis_eligible
            OR sleep_nightly_summaries.selection_reason IS DISTINCT FROM EXCLUDED.selection_reason
            OR sleep_nightly_summaries.calculation_version IS DISTINCT FROM EXCLUDED.calculation_version
            OR sleep_nightly_summaries.evidence IS DISTINCT FROM EXCLUDED.evidence
            OR sleep_nightly_summaries.source_id IS DISTINCT FROM EXCLUDED.source_id
            OR sleep_nightly_summaries.import_job_id IS DISTINCT FROM EXCLUDED.import_job_id`

export const LIST_SLEEP_NIGHTLY_SUMMARIES_SQL = `SELECT sleep_date::text AS sleep_date,
           timezone,
           logical_source_key,
           source_name,
           start_at,
           end_at,
           total_sleep_minutes,
           time_in_bed_minutes,
           awake_minutes,
           core_minutes,
           deep_minutes,
           rem_minutes,
           unspecified_sleep_minutes,
           stage_coverage_pct,
           stage_conflict_minutes,
           observation_status,
           analysis_eligible,
           stage_analysis_eligible,
           selection_reason,
           calculation_version,
           evidence
         FROM sleep_nightly_summaries
         ORDER BY sleep_date ASC`

export const SLEEP_NIGHTLY_BACKFILL_BATCH = 40

export const DELETE_SLEEP_NIGHTS_SQL = `DELETE FROM sleep_nightly_summaries
         WHERE timezone = $1
           AND sleep_date = ANY($2::date[])`

function asNumber(value: unknown): number | null {
  if (value == null) {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function sleepNightlyUpsertParams(
  night: SleepNightlySummary,
  sourceId: string | null,
  importJobId: string | null = null,
): unknown[] {
  return [
    night.sleepDate,
    night.timezone,
    night.logicalSourceKey,
    night.sourceName,
    night.startAt,
    night.endAt,
    night.totalSleepMinutes,
    night.timeInBedMinutes,
    night.awakeMinutes,
    night.coreMinutes,
    night.deepMinutes,
    night.remMinutes,
    night.unspecifiedSleepMinutes,
    night.stageCoveragePct,
    night.stageConflictMinutes,
    night.observationStatus,
    night.analysisEligible,
    night.stageAnalysisEligible,
    night.selectionReason,
    night.calculationVersion,
    JSON.stringify(night.evidence),
    sourceId,
    importJobId,
  ]
}

export async function upsertSleepNightlySummaries(
  nights: readonly SleepNightlySummary[],
  sourceId: string | null,
): Promise<number> {
  const sql = await getSql()
  let written = 0
  for (let offset = 0; offset < nights.length; offset += SLEEP_NIGHTLY_BACKFILL_BATCH) {
    const chunk = nights.slice(offset, offset + SLEEP_NIGHTLY_BACKFILL_BATCH)
    await sql.transaction(chunk.map((night) => sql.query(UPSERT_SLEEP_NIGHTLY_SUMMARY_SQL, sleepNightlyUpsertParams(night, sourceId))))
    written += chunk.length
  }
  return written
}

export const LIST_SLEEP_OBSERVATIONS_SQL = `SELECT sleep_date::text AS sleep_date,
           timezone,
           source_name,
           start_at,
           end_at,
           total_sleep_minutes,
           time_in_bed_minutes,
           core_minutes,
           deep_minutes,
           rem_minutes,
           unspecified_sleep_minutes,
           analysis_eligible,
           stage_analysis_eligible,
           observation_status
         FROM sleep_nightly_summaries
         WHERE timezone = $1
         ORDER BY sleep_date ASC`

export async function listSleepObservationsForProgress(timezone = 'America/Phoenix'): Promise<ProgressSleepObservation[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_SLEEP_OBSERVATIONS_SQL, [timezone])) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    sleepDate: String(row.sleep_date),
    sourceName: String(row.source_name),
    startAt: asIso(row.start_at),
    endAt: asIso(row.end_at),
    totalSleepMinutes: asNumber(row.total_sleep_minutes),
    timeInBedMinutes: asNumber(row.time_in_bed_minutes),
    coreMinutes: asNumber(row.core_minutes),
    deepMinutes: asNumber(row.deep_minutes),
    remMinutes: asNumber(row.rem_minutes),
    unspecifiedSleepMinutes: asNumber(row.unspecified_sleep_minutes),
    analysisEligible: Boolean(row.analysis_eligible),
    stageAnalysisEligible: Boolean(row.stage_analysis_eligible),
    observationStatus: String(row.observation_status) as SleepObservationStatus,
  }))
}

export async function listSleepNightlySummaries(): Promise<SleepNightlySummary[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_SLEEP_NIGHTLY_SUMMARIES_SQL)) as Array<Record<string, unknown>>
  return rows.map((row) => {
    const evidence = typeof row.evidence === 'object' && row.evidence != null ? row.evidence : {}
    return {
      sleepDate: String(row.sleep_date),
      timezone: String(row.timezone),
      logicalSourceKey: String(row.logical_source_key),
      sourceName: String(row.source_name),
      startAt: asIso(row.start_at),
      endAt: asIso(row.end_at),
      totalSleepMinutes: asNumber(row.total_sleep_minutes),
      timeInBedMinutes: asNumber(row.time_in_bed_minutes),
      awakeMinutes: asNumber(row.awake_minutes),
      coreMinutes: asNumber(row.core_minutes),
      deepMinutes: asNumber(row.deep_minutes),
      remMinutes: asNumber(row.rem_minutes),
      unspecifiedSleepMinutes: asNumber(row.unspecified_sleep_minutes),
      stageCoveragePct: asNumber(row.stage_coverage_pct),
      stageConflictMinutes: asNumber(row.stage_conflict_minutes) ?? 0,
      observationStatus: String(row.observation_status) as SleepObservationStatus,
      analysisEligible: Boolean(row.analysis_eligible),
      stageAnalysisEligible: Boolean(row.stage_analysis_eligible),
      selectionReason: String(row.selection_reason) as SleepSelectionReason,
      calculationVersion: String(row.calculation_version),
      evidence: evidence as SleepNightlySummary['evidence'],
    }
  })
}
