import { buildTrainingProgressionState, type TrainingProgressionExercise, type TrainingProgressionGoal, type TrainingProgressionSet, type TrainingProgressionState } from '../../src/domain/training-progression.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { getSql } from '../db.js'

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function textArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

export async function loadTrainingProgressionState(asOf: string): Promise<TrainingProgressionState> {
  const sql = await getSql()
  const start = addCalendarDays(asOf, -55)
  const [setRows, exerciseRows, goalRows] = await Promise.all([
    sql.query(
      [
        'SELECT sets.id::text AS set_id, sessions.id::text AS session_id, sessions.workout_date::text AS workout_date,',
        '       session_exercises.exercise_definition_id::text AS exercise_id, exercises.name AS exercise_name,',
        '       exercises.performance_type, exercises.load_type, exercises.metadata AS exercise_metadata,',
        '       sets.set_type, sets.completed, sets.weight_kg::text AS weight_kg, sets.reps, sets.left_reps, sets.right_reps,',
        '       sets.duration_sec, sets.left_duration_sec, sets.right_duration_sec, sets.distance_m::text AS distance_m,',
        '       sessions.bodyweight_kg::text AS bodyweight_kg, sets.rir, sets.rpe::text AS rpe,',
        '       sets.failure_kind, sets.left_failure_kind, sets.right_failure_kind, sessions.effort, sessions.limitation_kind',
        '  FROM workout_sets sets',
        '  JOIN workout_session_exercises session_exercises ON session_exercises.id = sets.workout_session_exercise_id',
        '  JOIN workout_sessions sessions ON sessions.id = session_exercises.workout_session_id',
        '  JOIN exercise_definitions exercises ON exercises.id = session_exercises.exercise_definition_id',
        ' WHERE sessions.session_type IN (\'programmed\',\'ad_hoc\',\'experiment\')',
        '   AND sessions.workout_date BETWEEN $1::date AND $2::date',
        ' ORDER BY sessions.workout_date, sessions.created_at, session_exercises.position, sets.set_number, sets.id',
      ].join('\n'),
      [start, asOf],
    ),
    sql.query(
      [
        'SELECT id::text AS id, name, performance_type, load_type, metadata',
        '  FROM exercise_definitions',
        ' WHERE is_active = true',
        ' ORDER BY name, id',
      ].join('\n'),
    ),
    sql.query(
      [
        'SELECT goals.id::text AS id, goals.goal_kind, goals.exercise_definition_id::text AS exercise_id,',
        '       exercises.name AS exercise_name',
        '  FROM goals',
        '  JOIN exercise_definitions exercises ON exercises.id = goals.exercise_definition_id',
        ' WHERE goals.status = \'active\'',
        '   AND goals.exercise_definition_id IS NOT NULL',
        '   AND goals.goal_kind IN (\'strength_e1rm\',\'training_reps\',\'training_duration\',\'training_distance\',\'training_pace\',\'training_skill\')',
        ' ORDER BY goals.created_at, goals.id',
      ].join('\n'),
    ),
  ])
  const sets: TrainingProgressionSet[] = (setRows as Array<Record<string, unknown>>).map((row) => {
    const metadata = metadataRecord(row.exercise_metadata)
    return {
      setId: String(row.set_id),
      sessionId: String(row.session_id),
      date: String(row.workout_date),
      exerciseId: String(row.exercise_id),
      exerciseName: String(row.exercise_name),
      performanceType: String(row.performance_type),
      loadType: String(row.load_type),
      movementPattern: typeof metadata.movement_pattern === 'string' ? metadata.movement_pattern : null,
      primaryMuscleGroup: typeof metadata.primary_muscle_group === 'string' ? metadata.primary_muscle_group : null,
      secondaryMuscleGroups: textArray(metadata.secondary_muscle_groups),
      setType: String(row.set_type),
      completed: row.completed == null ? null : row.completed === true,
      weightKg: numberOrNull(row.weight_kg),
      reps: numberOrNull(row.reps),
      leftReps: numberOrNull(row.left_reps),
      rightReps: numberOrNull(row.right_reps),
      durationSec: numberOrNull(row.duration_sec),
      leftDurationSec: numberOrNull(row.left_duration_sec),
      rightDurationSec: numberOrNull(row.right_duration_sec),
      distanceM: numberOrNull(row.distance_m),
      bodyweightKg: numberOrNull(row.bodyweight_kg),
      rir: numberOrNull(row.rir),
      rpe: numberOrNull(row.rpe),
      failureKind: row.failure_kind == null ? null : String(row.failure_kind),
      leftFailureKind: row.left_failure_kind == null ? null : String(row.left_failure_kind),
      rightFailureKind: row.right_failure_kind == null ? null : String(row.right_failure_kind),
      sessionEffort: numberOrNull(row.effort),
      limitationKind: row.limitation_kind == null ? null : String(row.limitation_kind),
    }
  })
  const exercises: TrainingProgressionExercise[] = (exerciseRows as Array<Record<string, unknown>>).map((row) => {
    const metadata = metadataRecord(row.metadata)
    return {
      id: String(row.id),
      name: String(row.name),
      performanceType: String(row.performance_type),
      loadType: String(row.load_type),
      movementPattern: typeof metadata.movement_pattern === 'string' ? metadata.movement_pattern : null,
      primaryMuscleGroup: typeof metadata.primary_muscle_group === 'string' ? metadata.primary_muscle_group : null,
      secondaryMuscleGroups: textArray(metadata.secondary_muscle_groups),
    }
  })
  const goals: TrainingProgressionGoal[] = (goalRows as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    label: String(row.exercise_name) + ' ' + String(row.goal_kind).replaceAll('_', ' '),
    kind: String(row.goal_kind),
    exerciseId: String(row.exercise_id),
  }))
  return buildTrainingProgressionState({ asOf, sets, exercises, goals })
}
