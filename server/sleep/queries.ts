import { DEFAULT_HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import type { SleepIntervalRow, SleepNightlySummary, SleepObservationStatus, SleepSelectionReason, SleepVitalMetricKey, SleepVitalObservation } from '../../src/domain/sleep/index.js'
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

export async function listSleepObservationsForProgress(timezone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE): Promise<ProgressSleepObservation[]> {
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

export function mapSleepNightlySummaryRow(row: Record<string, unknown>): SleepNightlySummary {
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
}

export async function readSleepNightRecord(
  sleepDate: string,
  timezone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): Promise<{ night: SleepNightlySummary; transportName: string | null; previousSleepDate: string | null; nextSleepDate: string | null } | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT nights.sleep_date::text AS sleep_date,
            nights.timezone,
            nights.logical_source_key,
            nights.source_name,
            nights.start_at,
            nights.end_at,
            nights.total_sleep_minutes,
            nights.time_in_bed_minutes,
            nights.awake_minutes,
            nights.core_minutes,
            nights.deep_minutes,
            nights.rem_minutes,
            nights.unspecified_sleep_minutes,
            nights.stage_coverage_pct,
            nights.stage_conflict_minutes,
            nights.observation_status,
            nights.analysis_eligible,
            nights.stage_analysis_eligible,
            nights.selection_reason,
            nights.calculation_version,
            nights.evidence,
            sources.display_name AS transport_name,
            (
              SELECT previous.sleep_date::text
              FROM sleep_nightly_summaries previous
              WHERE previous.timezone = nights.timezone AND previous.sleep_date < nights.sleep_date
              ORDER BY previous.sleep_date DESC
              LIMIT 1
            ) AS previous_sleep_date,
            (
              SELECT next_night.sleep_date::text
              FROM sleep_nightly_summaries next_night
              WHERE next_night.timezone = nights.timezone AND next_night.sleep_date > nights.sleep_date
              ORDER BY next_night.sleep_date ASC
              LIMIT 1
            ) AS next_sleep_date
     FROM sleep_nightly_summaries nights
     LEFT JOIN data_sources sources ON sources.id = nights.source_id
     WHERE nights.sleep_date = $1::date AND nights.timezone = $2`,
    [sleepDate, timezone],
  )) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) {
    return null
  }
  return {
    night: mapSleepNightlySummaryRow(row),
    transportName: typeof row.transport_name === 'string' ? row.transport_name : null,
    previousSleepDate: row.previous_sleep_date == null ? null : String(row.previous_sleep_date),
    nextSleepDate: row.next_sleep_date == null ? null : String(row.next_sleep_date),
  }
}

const SLEEP_VITAL_KEYS = new Set<string>([
  'heart_rate',
  'hrv_sdnn',
  'respiratory_rate',
  'oxygen_saturation',
  'sleeping_wrist_temperature',
])

export async function listSleepVitalSamples(episodeStart: string, episodeEnd: string): Promise<SleepVitalObservation[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id,
            metric_key,
            value_numeric,
            unit,
            observed_at,
            start_at,
            end_at,
            source_family,
            fingerprint
     FROM sleep_vital_samples
     WHERE observed_at >= $1::timestamptz
       AND observed_at < $2::timestamptz
     ORDER BY observed_at ASC, metric_key ASC, source_family ASC, id ASC`,
    [episodeStart, episodeEnd],
  )) as Array<Record<string, unknown>>
  const samples: SleepVitalObservation[] = []
  for (const row of rows) {
    const metricKey = String(row.metric_key)
    const value = asNumber(row.value_numeric)
    if (!SLEEP_VITAL_KEYS.has(metricKey) || value == null) {
      continue
    }
    const sourceFamily = String(row.source_family)
    const familyKeys: Record<string, string> = {
      'Apple Watch': 'apple_watch',
      Circular: 'circular',
      'Sleep Cycle': 'sleep_cycle',
      iPhone: 'iphone',
      'Unknown source': 'unknown',
    }
    samples.push({
      id: String(row.id),
      metricKey: metricKey as SleepVitalMetricKey,
      value,
      unit: String(row.unit),
      observedAt: asIso(row.observed_at),
      startAt: row.start_at == null ? null : asIso(row.start_at),
      endAt: row.end_at == null ? null : asIso(row.end_at),
      sourceFamily,
      sourceFamilyKey: familyKeys[sourceFamily] ?? 'unknown',
      fingerprint: String(row.fingerprint),
    })
  }
  return samples
}

export async function listSleepNightlySummaries(timezone?: string): Promise<SleepNightlySummary[]> {
  const sql = await getSql()
  const rows = timezone
    ? ((await sql.query(
        LIST_SLEEP_NIGHTLY_SUMMARIES_SQL.replace(
          'ORDER BY sleep_date ASC',
          'WHERE timezone = $1 ORDER BY sleep_date ASC',
        ),
        [timezone],
      )) as Array<Record<string, unknown>>)
    : ((await sql.query(LIST_SLEEP_NIGHTLY_SUMMARIES_SQL)) as Array<Record<string, unknown>>)
  return rows.map((row) => mapSleepNightlySummaryRow(row))
}

const LIST_SLEEP_NIGHTS_BETWEEN_SQL = `SELECT sleep_date::text AS sleep_date,
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
         WHERE timezone = $1
           AND sleep_date >= $2::date
           AND sleep_date <= $3::date
         ORDER BY sleep_date ASC`

export async function listSleepNightsBetween(start: string, end: string, timezone: string): Promise<SleepNightlySummary[]> {
  const sql = await getSql()
  const rows = (await sql.query(LIST_SLEEP_NIGHTS_BETWEEN_SQL, [timezone, start, end])) as Array<Record<string, unknown>>
  return rows.map((row) => mapSleepNightlySummaryRow(row))
}
