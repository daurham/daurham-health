import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { classificationForExternalId } from '../../src/domain/progress/exercise-classification.js'
import type {
  BodyObservation,
  CanonicalSetRecord,
  ProgressExerciseDefinition,
  ProgressWorkoutSummary,
} from '../../src/domain/progress/types.js'
import { PERFORMANCE_TYPES, ANALYTICS_LOAD_TYPES, ANALYTICS_REP_MODES } from '../../src/domain/progress/types.js'

const TABLES_UNAVAILABLE = 'Progress tables are not available. Apply pending migrations.'

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

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function asCalendarDate(value: unknown): string {
  if (typeof value === 'string') {
    return value.includes('T') ? value.slice(0, 10) : value
  }
  if (value instanceof Date) {
    const year = value.getUTCFullYear()
    const month = String(value.getUTCMonth() + 1).padStart(2, '0')
    const day = String(value.getUTCDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  return String(value)
}

function asNumber(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value)
  return parsed == null || !Number.isInteger(parsed) ? null : parsed
}

export type ProgressCanonicalRows = {
  exercises: ProgressExerciseDefinition[]
  workouts: ProgressWorkoutSummary[]
  sets: CanonicalSetRecord[]
  bodyObservations: BodyObservation[]
}

export async function loadProgressCanonicalRows(): Promise<ProgressCanonicalRows> {
  const sql = await getSql()
  const [exerciseRows, sessionRows, setRows, bodyRows] = await queryOrUnavailable(() =>
    Promise.all([
      sql.query(
        `SELECT id, external_id, name, measurement_kind, unilateral, performance_type, analytics_load_type, analytics_rep_mode
         FROM exercise_definitions
         WHERE is_active = true
         ORDER BY name, id`,
      ),
      sql.query(
        `SELECT id, workout_date, created_at
         FROM workout_sessions
         ORDER BY workout_date ASC, created_at ASC, id ASC`,
      ),
      sql.query(
        `SELECT
            sets.id AS set_id,
            sessions.id AS session_id,
            exercises.id AS session_exercise_id,
            exercises.exercise_definition_id AS exercise_id,
            sessions.workout_date AS session_date,
            sessions.created_at AS session_created_at,
            exercises.position AS session_exercise_position,
            sets.set_number,
            sets.set_type,
            sets.load_state,
            sets.weight_kg,
            sets.reps,
            sets.duration_sec,
            sets.left_reps,
            sets.right_reps,
            sets.left_duration_sec,
            sets.right_duration_sec
         FROM workout_sets AS sets
         JOIN workout_session_exercises AS exercises
           ON exercises.id = sets.workout_session_exercise_id
         JOIN workout_sessions AS sessions
           ON sessions.id = exercises.workout_session_id
         ORDER BY sessions.workout_date ASC, sessions.created_at ASC, sessions.id ASC,
                  exercises.position ASC, sets.set_number ASC, sets.id ASC`,
      ),
      sql.query(
        `SELECT
            metrics.id AS measurement_id,
            metrics.measurement_session_id,
            metrics.metric_key,
            metrics.value,
            metrics.unit,
            metrics.value_kind,
            sessions.measured_at,
            sessions.timezone
         FROM body_metrics AS metrics
         JOIN body_measurement_sessions AS sessions
           ON sessions.id = metrics.measurement_session_id
         ORDER BY sessions.measured_at ASC, metrics.id ASC`,
      ),
    ]),
  )

  const exercises: ProgressExerciseDefinition[] = (exerciseRows as Record<string, unknown>[]).map((row) => {
    const fallback = classificationForExternalId(typeof row.external_id === 'string' ? row.external_id : null)
    const performanceType = PERFORMANCE_TYPES.includes(row.performance_type as never)
      ? (row.performance_type as ProgressExerciseDefinition['performanceType'])
      : fallback.performanceType
    const analyticsLoadType = ANALYTICS_LOAD_TYPES.includes(row.analytics_load_type as never)
      ? (row.analytics_load_type as ProgressExerciseDefinition['analyticsLoadType'])
      : fallback.analyticsLoadType
    const analyticsRepMode = ANALYTICS_REP_MODES.includes(row.analytics_rep_mode as never)
      ? (row.analytics_rep_mode as ProgressExerciseDefinition['analyticsRepMode'])
      : fallback.analyticsRepMode
    return {
      id: String(row.id),
      name: String(row.name),
      externalId: typeof row.external_id === 'string' ? row.external_id : null,
      performanceType,
      analyticsLoadType,
      analyticsRepMode,
      measurementKind: String(row.measurement_kind),
      unilateral: Boolean(row.unilateral),
    }
  })

  const workouts: ProgressWorkoutSummary[] = (sessionRows as Record<string, unknown>[]).map((row) => ({
    sessionId: String(row.id),
    sessionDate: asCalendarDate(row.workout_date),
    createdAt: asIso(row.created_at),
  }))

  const sets: CanonicalSetRecord[] = (setRows as Record<string, unknown>[]).map((row) => ({
    setId: String(row.set_id),
    sessionId: String(row.session_id),
    sessionExerciseId: String(row.session_exercise_id),
    exerciseId: String(row.exercise_id),
    sessionDate: asCalendarDate(row.session_date),
    sessionCreatedAt: asIso(row.session_created_at),
    sessionExercisePosition: asInt(row.session_exercise_position) ?? 1,
    setNumber: asInt(row.set_number) ?? 1,
    setType: String(row.set_type),
    loadState: String(row.load_state),
    weightKg: asNumber(row.weight_kg),
    reps: asInt(row.reps),
    durationSec: asInt(row.duration_sec),
    leftReps: asInt(row.left_reps),
    rightReps: asInt(row.right_reps),
    leftDurationSec: asInt(row.left_duration_sec),
    rightDurationSec: asInt(row.right_duration_sec),
  }))

  const bodyObservations: BodyObservation[] = (bodyRows as Record<string, unknown>[]).map((row) => {
    const measuredAt = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
    const timezone = typeof row.timezone === 'string' ? row.timezone : null
    return {
      measurementId: String(row.measurement_id),
      measurementSessionId: String(row.measurement_session_id),
      key: String(row.metric_key),
      value: asNumber(row.value) ?? 0,
      unit: String(row.unit),
      valueKind: String(row.value_kind),
      measuredAt: asIso(measuredAt),
      timezone,
      calendarDate: calendarDateFromInstant(measuredAt, timezone),
    }
  })

  return { exercises, workouts, sets, bodyObservations }
}
