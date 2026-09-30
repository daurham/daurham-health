import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import {
  OWNER_EXERCISE_ORIGIN,
  exerciseDefinitionFromRow,
  exerciseDefinitionRowSchema,
  exerciseLibraryLastSessionSchema,
  ownerExerciseAnalyticsDefaults,
  ownerExerciseCoherenceError,
  ownerExerciseRequestSchema,
  planOwnerExercisePatch,
  type ExerciseDefinition,
  type ExerciseLibraryItem,
  type OwnerExerciseRequest,
} from '../../src/domain/training.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'

const TABLES_UNAVAILABLE = 'Training tables are not available. Apply pending migrations.'

const EXERCISE_COLUMNS = `id, external_id, name, measurement_kind, load_type, unilateral, metadata, gif_url, youtube_url, form_instructions, notes, is_active, created_at, updated_at`

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

function mapExercise(row: unknown): ExerciseDefinition {
  return exerciseDefinitionFromRow(exerciseDefinitionRowSchema.parse(row))
}

function mergePresentationMetadata(
  metadata: Record<string, unknown>,
  request: OwnerExerciseRequest,
): Record<string, unknown> {
  const next = { ...metadata }
  const apply = (key: string, value: unknown) => {
    if (value === undefined) return
    if (value === null || (Array.isArray(value) && value.length === 0)) delete next[key]
    else next[key] = value
  }
  apply('primary_muscle_group', request.primaryMuscleGroup)
  apply('secondary_muscle_groups', request.secondaryMuscleGroups)
  apply('movement_pattern', request.movementPattern)
  apply('aliases', request.aliases)
  return next
}

function calendarDate(value: unknown): string | null {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  const text = String(value)
  return text.includes('T') ? text.slice(0, 10) : text
}

function parseOwnerExerciseRequest(body: unknown): OwnerExerciseRequest {
  const parsed = ownerExerciseRequestSchema.safeParse(body)
  if (!parsed.success) {
    const error = parsed.error instanceof ZodError ? parsed.error : null
    throw new HttpError(400, error?.issues[0]?.message ?? 'Invalid exercise')
  }
  const coherence = ownerExerciseCoherenceError(parsed.data)
  if (coherence) {
    throw new HttpError(400, coherence)
  }
  return parsed.data
}

export async function getExerciseDefinition(id: string): Promise<ExerciseDefinition> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT ${EXERCISE_COLUMNS}
       FROM exercise_definitions
       WHERE id = $1
       LIMIT 1`,
      [id],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Exercise was not found')
  }
  return mapExercise(row)
}

async function exerciseIsUsed(id: string): Promise<boolean> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT 1
       FROM workout_session_exercises
       WHERE exercise_definition_id = $1
       LIMIT 1`,
      [id],
    ),
  )
  return rows.length > 0
}

export async function createOwnerExercise(body: unknown): Promise<{ exercise: ExerciseDefinition }> {
  const request = parseOwnerExerciseRequest(body)
  const analytics = ownerExerciseAnalyticsDefaults(request.measurementKind, request.unilateral)
  const id = randomUUID()
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `INSERT INTO exercise_definitions (
         id, external_id, name, measurement_kind, load_type, unilateral, metadata,
         performance_type, analytics_load_type, analytics_rep_mode,
         gif_url, youtube_url, form_instructions, notes
       ) VALUES (
         $1::uuid, NULL, $2, $3, $4, $5, $6::jsonb,
         $7, $8, $9, $10, $11, $12, $13
       )
       RETURNING ${EXERCISE_COLUMNS}`,
      [
        id,
        request.name,
        request.measurementKind,
        request.loadType,
        request.unilateral,
        JSON.stringify(mergePresentationMetadata(OWNER_EXERCISE_ORIGIN, request)),
        analytics.performanceType,
        analytics.analyticsLoadType,
        analytics.analyticsRepMode,
        request.gifUrl ?? null,
        request.youtubeUrl ?? null,
        request.formInstructions ?? null,
        request.notes ?? null,
      ],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new HttpError(500, 'Exercise could not be saved')
  }
  return { exercise: mapExercise(row) }
}


export async function ensureOwnerExercise(
  request: OwnerExerciseRequest,
): Promise<ExerciseDefinition> {
  const coherence = ownerExerciseCoherenceError(request)
  if (coherence) {
    throw new HttpError(400, coherence)
  }
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT ${EXERCISE_COLUMNS}
       FROM exercise_definitions
       WHERE external_id IS NULL
         AND metadata->>'origin' = 'owner'
         AND is_active = true
         AND lower(name) = lower($1)
         AND measurement_kind = $2
         AND load_type = $3
         AND unilateral = $4
       ORDER BY created_at
       LIMIT 1`,
      [request.name, request.measurementKind, request.loadType, request.unilateral],
    ),
  )
  if (rows[0]) {
    return mapExercise(rows[0])
  }
  return (await createOwnerExercise(request)).exercise
}

export async function updateOwnerExercise(
  id: string,
  body: unknown,
): Promise<{ exercise: ExerciseDefinition }> {
  const existing = await getExerciseDefinition(id)
  const request = parseOwnerExerciseRequest(body)
  const used = await exerciseIsUsed(id)
  const plan = planOwnerExercisePatch({ existing, next: request, used })
  if (!plan.ok) {
    throw new HttpError(plan.status, plan.message)
  }
  const metadata = mergePresentationMetadata(existing.metadata, request)
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `UPDATE exercise_definitions
       SET name = $2,
           measurement_kind = CASE WHEN $3::boolean THEN $4 ELSE measurement_kind END,
           load_type = CASE WHEN $3::boolean THEN $5 ELSE load_type END,
           unilateral = CASE WHEN $3::boolean THEN $6 ELSE unilateral END,
           performance_type = CASE WHEN $3::boolean THEN $7 ELSE performance_type END,
           analytics_load_type = CASE WHEN $3::boolean THEN $8 ELSE analytics_load_type END,
           analytics_rep_mode = CASE WHEN $3::boolean THEN $9 ELSE analytics_rep_mode END,
           gif_url = CASE WHEN $10::boolean THEN $11 ELSE gif_url END,
           youtube_url = CASE WHEN $12::boolean THEN $13 ELSE youtube_url END,
           form_instructions = CASE WHEN $14::boolean THEN $15 ELSE form_instructions END,
           notes = CASE WHEN $16::boolean THEN $17 ELSE notes END,
           metadata = $18::jsonb,
           updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${EXERCISE_COLUMNS}`,
      [
        id,
        plan.name,
        plan.semanticChanged,
        plan.measurementKind,
        plan.loadType,
        plan.unilateral,
        plan.analytics.performanceType,
        plan.analytics.analyticsLoadType,
        plan.analytics.analyticsRepMode,
        request.gifUrl !== undefined,
        request.gifUrl ?? null,
        request.youtubeUrl !== undefined,
        request.youtubeUrl ?? null,
        request.formInstructions !== undefined,
        request.formInstructions ?? null,
        request.notes !== undefined,
        request.notes ?? null,
        JSON.stringify(metadata),
      ],
    ),
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Exercise was not found')
  return { exercise: mapExercise(row) }
}

async function activeRoutineDependencies(ids: string[]) {
  if (ids.length === 0) return new Map<string, ExerciseLibraryItem['activeRoutines']>()
  const sql = await getSql()
  const rows = (await queryOrUnavailable(() =>
    sql.query(
      `SELECT slots.exercise_definition_id::text AS exercise_definition_id,
              templates.id::text AS id,
              templates.name,
              templates.routine_code,
              templates.origin_kind
       FROM workout_template_exercises slots
       JOIN workout_templates templates ON templates.id = slots.workout_template_id
       WHERE templates.is_active = true
         AND slots.exercise_definition_id = ANY($1::uuid[])
       ORDER BY templates.routine_code, templates.version`,
      [ids],
    ),
  )) as Array<{
    exercise_definition_id: string
    id: string
    name: string
    routine_code: string
    origin_kind: 'seeded' | 'owner'
  }>
  const grouped = new Map<string, ExerciseLibraryItem['activeRoutines']>()
  for (const row of rows) {
    const current = grouped.get(row.exercise_definition_id) ?? []
    if (!current.some((routine) => routine.id === row.id)) {
      current.push({ id: row.id, name: row.name, routineCode: row.routine_code, originKind: row.origin_kind })
    }
    grouped.set(row.exercise_definition_id, current)
  }
  return grouped
}

export async function listExerciseLibrary(): Promise<{ exercises: ExerciseLibraryItem[] }> {
  const sql = await getSql()
  const rows = (await queryOrUnavailable(() =>
    sql.query(
      `SELECT ${EXERCISE_COLUMNS},
              COALESCE((
                SELECT count(DISTINCT used.workout_session_id)
                FROM workout_session_exercises used
                WHERE used.exercise_definition_id = exercise_definitions.id
              ), 0)::int AS usage_count,
              (
                SELECT max(sessions.workout_date)
                FROM workout_session_exercises used
                JOIN workout_sessions sessions ON sessions.id = used.workout_session_id
                WHERE used.exercise_definition_id = exercise_definitions.id
              ) AS last_performed_date,
              (
                SELECT jsonb_build_object(
                  'date', sessions.workout_date::text,
                  'sets', COALESCE((
                    SELECT jsonb_agg(
                      jsonb_build_object(
                        'setNumber', sets.set_number,
                        'loadState', sets.load_state,
                        'weightKg', sets.weight_kg,
                        'reps', sets.reps,
                        'durationSec', sets.duration_sec,
                        'leftReps', sets.left_reps,
                        'rightReps', sets.right_reps,
                        'leftDurationSec', sets.left_duration_sec,
                        'rightDurationSec', sets.right_duration_sec,
                        'distanceM', sets.distance_m,
                        'completed', sets.completed
                      )
                      ORDER BY sets.set_number
                    )
                    FROM workout_sets sets
                    WHERE sets.workout_session_exercise_id = used.id
                  ), '[]'::jsonb)
                )
                FROM workout_session_exercises used
                JOIN workout_sessions sessions ON sessions.id = used.workout_session_id
                WHERE used.exercise_definition_id = exercise_definitions.id
                ORDER BY sessions.workout_date DESC, sessions.created_at DESC, used.position DESC
                LIMIT 1
              ) AS last_session
       FROM exercise_definitions
       ORDER BY external_id NULLS LAST, name, id`,
    ),
  )) as Array<Record<string, unknown> & {
    usage_count: number | string
    last_performed_date: unknown
    last_session: unknown
  }>
  const exercises = rows.map((row) => mapExercise(row))
  const dependencies = await activeRoutineDependencies(exercises.map((exercise) => exercise.id))
  return {
    exercises: exercises.map((exercise, index) => {
      const usageCount = Number(rows[index]?.usage_count ?? 0)
      return {
        exercise,
        usageCount,
        lastPerformedDate: calendarDate(rows[index]?.last_performed_date),
        lastSession:
          rows[index]?.last_session == null
            ? null
            : exerciseLibraryLastSessionSchema.parse(rows[index]?.last_session),
        activeRoutines: dependencies.get(exercise.id) ?? [],
        semanticEditable: exercise.externalId == null && exercise.metadata.origin === 'owner' && usageCount === 0,
        builtIn: exercise.externalId != null,
      }
    }),
  }
}

export async function archiveOwnerExercise(id: string): Promise<{ exercise: ExerciseDefinition }> {
  await getExerciseDefinition(id)
  const dependencies = (await activeRoutineDependencies([id])).get(id) ?? []
  if (dependencies.length > 0) {
    throw new HttpError(
      409,
      `Remove this exercise from active routines first: ${dependencies.map((routine) => routine.name).join(', ')}`,
    )
  }
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `UPDATE exercise_definitions
       SET is_active = false, updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${EXERCISE_COLUMNS}`,
      [id],
    ),
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Exercise was not found')
  return { exercise: mapExercise(row) }
}

export async function restoreExercise(id: string): Promise<{ exercise: ExerciseDefinition }> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `UPDATE exercise_definitions
       SET is_active = true, updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${EXERCISE_COLUMNS}`,
      [id],
    ),
  )
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Exercise was not found')
  return { exercise: mapExercise(row) }
}
