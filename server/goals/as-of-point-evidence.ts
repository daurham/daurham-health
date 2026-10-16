import type { Sql } from '../db.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'

/** Goal Control point measurements, bound to the requested Health-local
 * as-of day BEFORE LIMIT and backed by a second source-date check.
 * This does not backcast goal lifecycle/versions or authorize advice.
 */
export const BODY_GOAL_AS_OF_SQL = `
SELECT metrics.value::text AS value, metrics.unit,
       sessions.measured_at::text AS measured_at, sessions.timezone
  FROM body_metrics metrics
  JOIN body_measurement_sessions sessions ON sessions.id = metrics.measurement_session_id
 WHERE metrics.metric_key = $1
   AND (sessions.measured_at AT TIME ZONE
        COALESCE(NULLIF(btrim(sessions.timezone), ''), $2))::date <= $3::date
 ORDER BY sessions.measured_at DESC, metrics.id DESC
 LIMIT 1
`
export async function loadBodyGoalPointAsOf(
  sql: Sql, metricKey: string, timezone: string, asOf: string,
): Promise<{ value: number; unit: string; observedOn: string } | null> {
  const rows = await sql.query(BODY_GOAL_AS_OF_SQL, [metricKey, timezone, asOf]) as Array<{
    value: string | number; unit: string; measured_at: string; timezone: string | null
  }>
  const item = rows[0]
  if (!item || typeof item.measured_at !== 'string') return null
  const instant = new Date(item.measured_at)
  if (!Number.isFinite(instant.getTime())) return null
  const localDate = calendarDateFromInstant(instant,
    typeof item.timezone === 'string' && item.timezone.trim()
      ? item.timezone : timezone)
  const value = Number(item.value)
  if (localDate > asOf || !Number.isFinite(value) ||
      typeof item.unit !== 'string' || !item.unit.trim()) return null
  return { value, unit: item.unit, observedOn: localDate }
}

/** Workout dates are DATE; use only sets on/before the requested date. */
export const STRENGTH_GOAL_AS_OF_SQL = `
SELECT sets.id::text AS set_id, sessions.id::text AS session_id,
       session_exercises.id::text AS session_exercise_id,
       session_exercises.exercise_definition_id::text AS exercise_id,
       sessions.workout_date::text AS session_date,
       sessions.created_at::text AS session_created_at,
       session_exercises.position AS session_exercise_position,
       sets.set_number, sets.set_type, sets.load_state,
       sets.weight_kg::text AS weight_kg, sets.reps, sets.duration_sec,
       sets.left_reps, sets.right_reps,
       sets.left_duration_sec, sets.right_duration_sec
  FROM workout_sets sets
  JOIN workout_session_exercises session_exercises
    ON session_exercises.id = sets.workout_session_exercise_id
  JOIN workout_sessions sessions
    ON sessions.id = session_exercises.workout_session_id
 WHERE session_exercises.exercise_definition_id = $1::uuid
   AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
   AND sessions.workout_date <= $2::date
 ORDER BY sessions.workout_date, sessions.created_at,
          session_exercises.position, sets.set_number, sets.id
`
export async function loadStrengthGoalSetsAsOf(
  sql: Sql, exerciseId: string, asOf: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = await sql.query(STRENGTH_GOAL_AS_OF_SQL, [exerciseId, asOf]) as Array<Record<string, unknown>>
  return rows.filter(row => typeof row.session_date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(row.session_date) &&
    row.session_date <= asOf)
}

export const BENCHMARK_GOAL_AS_OF_SQL = `
SELECT result_values.value::text AS value, result_values.unit,
       results.result_date::text AS result_date
  FROM benchmark_result_values result_values
  JOIN benchmark_results results ON results.id = result_values.benchmark_result_id
 WHERE results.benchmark_definition_id = $1::uuid
   AND results.protocol_version_id = $2::uuid
   AND results.status = 'valid'
   AND result_values.requirement_id = $3::uuid
   AND results.result_date <= $4::date
 ORDER BY results.result_date DESC, results.created_at DESC
 LIMIT 1
`
export async function loadBenchmarkGoalPointAsOf(
  sql: Sql, definitionId: string, protocolVersionId: string,
  requirementId: string, asOf: string,
): Promise<{ value: number; unit: string; observedOn: string } | null> {
  const rows = await sql.query(BENCHMARK_GOAL_AS_OF_SQL,
    [definitionId, protocolVersionId, requirementId, asOf]) as Array<{
    value: string | number; unit: string; result_date: string
  }>
  const item = rows[0]
  if (!item || typeof item.result_date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(item.result_date) ||
      item.result_date > asOf ||
      typeof item.unit !== 'string' || !item.unit.trim()) return null
  const value = Number(item.value)
  return Number.isFinite(value) ? { value, unit: item.unit, observedOn: item.result_date } : null
}
