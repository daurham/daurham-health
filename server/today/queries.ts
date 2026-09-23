import type { ActivityDailyRow } from '../../src/domain/activity/analytics.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import type { ProgressSleepObservation } from '../../src/domain/progress/health-timeline.js'
import type { BodyObservation } from '../../src/domain/progress/types.js'
import type { SleepObservationStatus } from '../../src/domain/sleep/completeness.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import type { TodayTrainingSession } from '../../src/domain/today/index.js'
import type { IntelligenceTrainingSession } from '../../src/domain/intelligence/index.js'
import { getSql } from '../db.js'

const SLEEP_COLUMNS = `sleep_date::text AS sleep_date,
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
           observation_status`

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asIso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

function sleepRow(row: Record<string, unknown>): ProgressSleepObservation {
  return {
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
  }
}

function activityRow(row: Record<string, unknown>): ActivityDailyRow {
  return {
    date: String(row.summary_date),
    timezone: String(row.timezone),
    stepsCount: asNumber(row.steps_count),
    activeEnergyKcal: asNumber(row.active_energy_kcal),
    exerciseMinutes: asNumber(row.exercise_minutes),
    walkingRunningDistanceM: asNumber(row.walking_running_distance_m),
    restingHeartRateBpm: asNumber(row.resting_heart_rate_bpm),
    updatedAt: row.updated_at == null ? null : asIso(row.updated_at),
  }
}

export async function listActivityDaysBetween(start: string, end: string): Promise<ActivityDailyRow[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT summary_date::text AS summary_date,
            timezone,
            steps_count,
            active_energy_kcal,
            exercise_minutes,
            walking_running_distance_m,
            resting_heart_rate_bpm,
            updated_at
     FROM activity_daily_summaries
     WHERE timezone = $1 AND summary_date >= $2::date AND summary_date <= $3::date
     ORDER BY summary_date ASC`,
    [HEALTH_CALENDAR_TIME_ZONE, start, end],
  )) as Array<Record<string, unknown>>
  return rows.map(activityRow)
}

export async function listSleepNightsBetween(start: string, end: string): Promise<ProgressSleepObservation[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT ${SLEEP_COLUMNS}
     FROM sleep_nightly_summaries
     WHERE timezone = $1 AND sleep_date >= $2::date AND sleep_date <= $3::date
     ORDER BY sleep_date ASC`,
    [HEALTH_CALENDAR_TIME_ZONE, start, end],
  )) as Array<Record<string, unknown>>
  return rows.map(sleepRow)
}

export async function latestCompleteSleepNight(asOf: string): Promise<ProgressSleepObservation | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT ${SLEEP_COLUMNS}
     FROM sleep_nightly_summaries
     WHERE timezone = $1 AND analysis_eligible = true AND sleep_date <= $2::date
     ORDER BY sleep_date DESC
     LIMIT 1`,
    [HEALTH_CALENDAR_TIME_ZONE, asOf],
  )) as Array<Record<string, unknown>>
  return rows[0] ? sleepRow(rows[0]) : null
}

export async function listTrainingSessionsBetween(start: string, end: string): Promise<IntelligenceTrainingSession[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id, workout_date::text AS workout_date, effort, pain_level
     FROM workout_sessions
     WHERE workout_date >= $1::date AND workout_date <= $2::date
     ORDER BY workout_date ASC, created_at ASC, id ASC`,
    [start, end],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    sessionId: String(row.id),
    sessionDate: String(row.workout_date).slice(0, 10),
    effort: asInt(row.effort),
    painLevel: asInt(row.pain_level),
  }))
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value)
  return parsed == null || !Number.isInteger(parsed) ? null : parsed
}

function sessionName(templateName: string | null, routineCode: string | null): string {
  if (templateName && templateName.trim().length > 0) {
    return templateName
  }
  if (routineCode && routineCode.trim().length > 0) {
    return `Routine ${routineCode}`
  }
  return 'Workout'
}

export async function listTrainingToday(date: string): Promise<TodayTrainingSession[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT sessions.id::text AS id,
            sessions.template_name,
            sessions.routine_code,
            COUNT(DISTINCT exercises.id)::int AS exercise_count,
            COUNT(sets.id) FILTER (WHERE sets.set_type = 'working')::int AS working_set_count
     FROM workout_sessions AS sessions
     LEFT JOIN workout_session_exercises AS exercises
       ON exercises.workout_session_id = sessions.id
     LEFT JOIN workout_sets AS sets
       ON sets.workout_session_exercise_id = exercises.id
     WHERE sessions.workout_date = $1::date
     GROUP BY sessions.id, sessions.template_name, sessions.routine_code, sessions.created_at
     ORDER BY sessions.created_at ASC, sessions.id ASC`,
    [date],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    name: sessionName(typeof row.template_name === 'string' ? row.template_name : null, typeof row.routine_code === 'string' ? row.routine_code : null),
    exerciseCount: asInt(row.exercise_count) ?? 0,
    workingSetCount: asInt(row.working_set_count) ?? 0,
  }))
}

export async function listBodyWeights(): Promise<BodyObservation[]> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT metrics.id::text AS measurement_id,
            metrics.measurement_session_id::text AS measurement_session_id,
            metrics.value,
            metrics.unit,
            metrics.value_kind,
            sessions.measured_at,
            sessions.timezone
     FROM body_metrics AS metrics
     JOIN body_measurement_sessions AS sessions
       ON sessions.id = metrics.measurement_session_id
     WHERE metrics.metric_key = 'weight'
     ORDER BY sessions.measured_at ASC, metrics.id ASC`,
  )) as Array<Record<string, unknown>>
  const weights: BodyObservation[] = []
  for (const row of rows) {
    const value = asNumber(row.value)
    if (value == null) {
      continue
    }
    const measuredAt = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
    const timezone = typeof row.timezone === 'string' ? row.timezone : null
    weights.push({
      measurementId: String(row.measurement_id),
      measurementSessionId: String(row.measurement_session_id),
      key: 'weight',
      value,
      unit: String(row.unit),
      valueKind: String(row.value_kind),
      measuredAt: measuredAt.toISOString(),
      timezone,
      calendarDate: calendarDateFromInstant(measuredAt, timezone),
    })
  }
  return weights
}
