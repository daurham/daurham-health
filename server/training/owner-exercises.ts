import { randomUUID } from 'node:crypto'
import { ZodError } from 'zod'
import {
  OWNER_EXERCISE_ORIGIN,
  exerciseDefinitionFromRow,
  exerciseDefinitionRowSchema,
  ownerExerciseAnalyticsDefaults,
  ownerExerciseCoherenceError,
  ownerExerciseRequestSchema,
  planOwnerExercisePatch,
  type ExerciseDefinition,
  type OwnerExerciseRequest,
} from '../../src/domain/training.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'

const TABLES_UNAVAILABLE = 'Training tables are not available. Apply pending migrations.'

const EXERCISE_COLUMNS = `id, external_id, name, measurement_kind, load_type, unilateral, metadata, is_active, created_at, updated_at`

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
         performance_type, analytics_load_type, analytics_rep_mode
       ) VALUES (
         $1::uuid, NULL, $2, $3, $4, $5, $6::jsonb,
         'other', 'none', $7
       )
       RETURNING ${EXERCISE_COLUMNS}`,
      [
        id,
        request.name,
        request.measurementKind,
        request.loadType,
        request.unilateral,
        JSON.stringify(OWNER_EXERCISE_ORIGIN),
        analytics.analyticsRepMode,
      ],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new HttpError(500, 'Exercise could not be saved')
  }
  return { exercise: mapExercise(row) }
}

export async function updateOwnerExercise(
  id: string,
  body: unknown,
): Promise<{ exercise: ExerciseDefinition }> {
  const existing = await getExerciseDefinition(id)
  const request = parseOwnerExerciseRequest(body)
  const plan = planOwnerExercisePatch({
    existing,
    next: request,
    used: await exerciseIsUsed(id),
  })
  if (!plan.ok) {
    throw new HttpError(plan.status, plan.message)
  }
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    plan.nameOnly
      ? sql.query(
          `UPDATE exercise_definitions
           SET name = $2,
               updated_at = now()
           WHERE id = $1::uuid
           RETURNING ${EXERCISE_COLUMNS}`,
          [id, plan.name],
        )
      : sql.query(
          `UPDATE exercise_definitions
           SET name = $2,
               measurement_kind = $3,
               load_type = $4,
               unilateral = $5,
               performance_type = 'other',
               analytics_load_type = 'none',
               analytics_rep_mode = $6,
               updated_at = now()
           WHERE id = $1::uuid
           RETURNING ${EXERCISE_COLUMNS}`,
          [id, plan.name, plan.measurementKind, plan.loadType, plan.unilateral, plan.analytics.analyticsRepMode],
        ),
  )
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Exercise was not found')
  }
  return { exercise: mapExercise(row) }
}

export async function archiveOwnerExercise(id: string): Promise<{ exercise: ExerciseDefinition }> {
  const existing = await getExerciseDefinition(id)
  const plan = planOwnerExercisePatch({
    existing,
    next: {
      name: existing.name,
      measurementKind: existing.measurementKind,
      loadType: existing.loadType as OwnerExerciseRequest['loadType'],
      unilateral: existing.unilateral,
    },
    used: false,
  })
  if (!plan.ok) {
    throw new HttpError(plan.status, plan.message)
  }
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `UPDATE exercise_definitions
       SET is_active = false,
           updated_at = now()
       WHERE id = $1::uuid
       RETURNING ${EXERCISE_COLUMNS}`,
      [id],
    ),
  )
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Exercise was not found')
  }
  return { exercise: mapExercise(row) }
}
