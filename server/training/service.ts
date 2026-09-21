import { randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import {
  exerciseDefinitionFromRow,
  exerciseDefinitionRowSchema,
  exerciseListResponseSchema,
  manualWorkoutRequestSchema,
  measurementFamilyOf,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  sessionSummaryFromRow,
  templateListResponseSchema,
  templatePrescriptionSchema,
  toCanonicalSetInsert,
  workoutSessionExerciseRowSchema,
  workoutSessionRowSchema,
  workoutSetFromRow,
  workoutSetRowSchema,
  workoutTemplateExerciseRowSchema,
  workoutTemplateRowSchema,
  workoutTemplateSchema,
  type CanonicalWorkoutSetInsert,
  type ExerciseDefinition,
  type ManualWorkoutRequest,
  type SessionDetailResponse,
  type SessionListResponse,
  type TemplateListResponse,
  type WorkoutSession,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
} from '../../src/domain/training.js'
import { poundsToKilograms } from '../../src/domain/units.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'

const TABLES_UNAVAILABLE = 'Training tables are not available. Apply pending migrations.'

function decimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new HttpError(400, 'Invalid number')
  }
  return value.toString()
}

export function parseManualWorkoutRequest(body: unknown): ManualWorkoutRequest {
  const parsed = manualWorkoutRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, firstZodMessage(parsed.error))
  }
  return parsed.data
}

function firstZodMessage(error: ZodError): string {
  return error.issues[0]?.message ?? 'Invalid request'
}

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

function mapExerciseRow(row: unknown): ExerciseDefinition {
  return exerciseDefinitionFromRow(exerciseDefinitionRowSchema.parse(row))
}

function mapTemplateExercise(
  slotRow: z.infer<typeof workoutTemplateExerciseRowSchema>,
  exercise: ExerciseDefinition,
): WorkoutTemplateExercise {
  return {
    id: slotRow.id,
    slotId: slotRow.slot_id,
    position: slotRow.position,
    plannedSets: slotRow.planned_sets,
    prescription: templatePrescriptionSchema.parse(slotRow.prescription),
    exercise,
  }
}

export async function listExercises(): Promise<{ exercises: ExerciseDefinition[] }> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, external_id, name, measurement_kind, load_type, unilateral, metadata, is_active, created_at, updated_at
       FROM exercise_definitions
       WHERE is_active = true
       ORDER BY external_id NULLS LAST, name`,
    ),
  )
  return exerciseListResponseSchema.parse({
    exercises: rows.map(mapExerciseRow),
  })
}

export async function listTemplates(): Promise<TemplateListResponse> {
  const sql = await getSql()
  const templateRows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, routine_code, version, name, metadata, is_active, created_at
       FROM workout_templates
       WHERE is_active = true
       ORDER BY routine_code, version`,
    ),
  )
  const parsedTemplates = z.array(workoutTemplateRowSchema).parse(templateRows)
  if (parsedTemplates.length === 0) {
    return templateListResponseSchema.parse({ templates: [] })
  }

  const slotRows = await sql.query(
    `SELECT id, workout_template_id, exercise_definition_id, slot_id, position, planned_sets, prescription, metadata, created_at
     FROM workout_template_exercises
     WHERE workout_template_id = ANY($1::uuid[])
     ORDER BY position`,
    [parsedTemplates.map((row) => row.id)],
  )
  const parsedSlots = z.array(workoutTemplateExerciseRowSchema).parse(slotRows)
  const exerciseIds = [...new Set(parsedSlots.map((slot) => slot.exercise_definition_id))]
  const exerciseRows =
    exerciseIds.length === 0
      ? []
      : await sql.query(
          `SELECT id, external_id, name, measurement_kind, load_type, unilateral, metadata, is_active, created_at, updated_at
           FROM exercise_definitions
           WHERE id = ANY($1::uuid[])`,
          [exerciseIds],
        )
  const exercisesById = new Map(exerciseRows.map((row) => {
    const exercise = mapExerciseRow(row)
    return [exercise.id, exercise] as const
  }))

  const templates = parsedTemplates.map((template) =>
    workoutTemplateSchema.parse({
      id: template.id,
      routineCode: template.routine_code,
      version: template.version,
      name: template.name,
      metadata: template.metadata,
      isActive: template.is_active,
      exercises: parsedSlots
        .filter((slot) => slot.workout_template_id === template.id)
        .map((slot) => {
          const exercise = exercisesById.get(slot.exercise_definition_id)
          if (!exercise) {
            throw new HttpError(500, 'Template exercise is missing its definition')
          }
          return mapTemplateExercise(slot, exercise)
        }),
    }),
  )

  return templateListResponseSchema.parse({ templates })
}

async function loadTemplateById(templateId: string): Promise<WorkoutTemplate> {
  const listed = await listTemplates()
  const template = listed.templates.find((item) => item.id === templateId)
  if (!template) {
    const sql = await getSql()
    const rows = await queryOrUnavailable(() =>
      sql.query(
        `SELECT id FROM workout_templates WHERE id = $1 LIMIT 1`,
        [templateId],
      ),
    )
    if (rows.length === 0) {
      throw new HttpError(400, 'Workout template was not found')
    }
    throw new HttpError(400, 'Workout template is not active')
  }
  return template
}

async function loadExercisesById(ids: string[]): Promise<Map<string, ExerciseDefinition>> {
  const unique = [...new Set(ids)]
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, external_id, name, measurement_kind, load_type, unilateral, metadata, is_active, created_at, updated_at
       FROM exercise_definitions
       WHERE id = ANY($1::uuid[])`,
      [unique],
    ),
  )
  const exercises = rows.map(mapExerciseRow)
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise] as const))
  for (const id of unique) {
    if (!byId.has(id)) {
      throw new HttpError(400, 'Exercise was not found')
    }
  }
  return byId
}

export type PreparedManualSession = {
  sessionId: string
  workoutDate: string
  workoutTemplateId: string | null
  routineCode: string | null
  templateVersion: string | null
  templateName: string | null
  durationMin: number | null
  effort: number | null
  painLevel: number | null
  bodyweightKg: number | null
  notes: string | null
  sourceKind: 'manual'
  metadata: { entry_mass_unit: 'lb' }
  exercises: Array<{
    id: string
    exerciseDefinitionId: string
    position: number
    slotId: string | null
    exerciseExternalId: string | null
    exerciseName: string
    notes: string | null
    sets: CanonicalWorkoutSetInsert[]
  }>
}

export function prepareManualSession(input: {
  request: ManualWorkoutRequest
  exercisesById: Map<string, ExerciseDefinition>
  template: WorkoutTemplate | null
  sessionId?: string
}): PreparedManualSession {
  const { request, exercisesById, template } = input
  if (request.workoutTemplateId != null) {
    if (!template || template.id !== request.workoutTemplateId) {
      throw new HttpError(400, 'Workout template was not found')
    }
  }

  const slotsById = new Map((template?.exercises ?? []).map((slot) => [slot.slotId, slot] as const))
  const exercises = request.exercises.map((exerciseInput, index) => {
    const definition = exercisesById.get(exerciseInput.exerciseDefinitionId)
    if (!definition) {
      throw new HttpError(400, 'Exercise was not found')
    }

    if (exerciseInput.slotId != null && template) {
      const slot = slotsById.get(exerciseInput.slotId)
      if (!slot) {
        throw new HttpError(400, `Slot ${exerciseInput.slotId} is not on the selected template`)
      }
      if (slot.exercise.id !== definition.id) {
        throw new HttpError(400, `Slot ${exerciseInput.slotId} does not match the selected exercise`)
      }
    }

    const sets = exerciseInput.sets.map((setInput) => {
      const canonical = toCanonicalSetInsert(setInput)
      const family = measurementFamilyOf(canonical)
      if (family !== definition.measurementKind) {
        throw new HttpError(
          400,
          `${definition.name} expects ${definition.measurementKind.replaceAll('_', ' ')}`,
        )
      }
      return canonical
    })

    const setNumbers = new Set(sets.map((set) => set.setNumber))
    if (setNumbers.size !== sets.length) {
      throw new HttpError(400, `Duplicate set numbers for ${definition.name}`)
    }

    return {
      id: randomUUID(),
      exerciseDefinitionId: definition.id,
      position: index + 1,
      slotId: exerciseInput.slotId,
      exerciseExternalId: definition.externalId,
      exerciseName: definition.name,
      notes: exerciseInput.notes ?? null,
      sets,
    }
  })

  return {
    sessionId: input.sessionId ?? randomUUID(),
    workoutDate: request.workoutDate,
    workoutTemplateId: template?.id ?? null,
    routineCode: template?.routineCode ?? null,
    templateVersion: template?.version ?? null,
    templateName: template?.name ?? null,
    durationMin: request.durationMin,
    effort: request.effort,
    painLevel: request.painLevel,
    bodyweightKg:
      request.bodyweightLb == null ? null : poundsToKilograms(request.bodyweightLb),
    notes: request.notes ?? null,
    sourceKind: 'manual',
    metadata: { entry_mass_unit: 'lb' },
    exercises,
  }
}

function buildSessionInsertQueries(
  sql: Awaited<ReturnType<typeof getSql>>,
  prepared: PreparedManualSession,
) {
  const queries = [
    sql.query(
      `INSERT INTO workout_sessions (
         id, workout_date, workout_template_id, routine_code, template_version, template_name,
         duration_min, effort, pain_level, bodyweight_kg, notes, source_kind, metadata
       ) VALUES (
         $1::uuid, $2::date, $3::uuid, $4, $5, $6,
         $7::numeric, $8::int, $9::int, $10::numeric, $11, $12, $13::jsonb
       )`,
      [
        prepared.sessionId,
        prepared.workoutDate,
        prepared.workoutTemplateId,
        prepared.routineCode,
        prepared.templateVersion,
        prepared.templateName,
        prepared.durationMin == null ? null : decimalString(prepared.durationMin),
        prepared.effort,
        prepared.painLevel,
        prepared.bodyweightKg == null ? null : decimalString(prepared.bodyweightKg),
        prepared.notes,
        prepared.sourceKind,
        JSON.stringify(prepared.metadata),
      ],
    ),
  ]

  for (const exercise of prepared.exercises) {
    queries.push(
      sql.query(
        `INSERT INTO workout_session_exercises (
           id, workout_session_id, exercise_definition_id, position, slot_id,
           exercise_external_id, exercise_name, notes
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::int, $5, $6, $7, $8
         )`,
        [
          exercise.id,
          prepared.sessionId,
          exercise.exerciseDefinitionId,
          exercise.position,
          exercise.slotId,
          exercise.exerciseExternalId,
          exercise.exerciseName,
          exercise.notes,
        ],
      ),
    )

    for (const set of exercise.sets) {
      queries.push(
        sql.query(
          `INSERT INTO workout_sets (
             workout_session_exercise_id, set_number, set_type, load_state, weight_kg,
             reps, duration_sec, left_reps, right_reps, left_duration_sec, right_duration_sec, notes
           ) VALUES (
             $1::uuid, $2::int, $3, $4, $5::numeric,
             $6::int, $7::int, $8::int, $9::int, $10::int, $11::int, $12
           )`,
          [
            exercise.id,
            set.setNumber,
            set.setType,
            set.loadState,
            set.weightKg == null ? null : decimalString(set.weightKg),
            set.reps,
            set.durationSec,
            set.leftReps,
            set.rightReps,
            set.leftDurationSec,
            set.rightDurationSec,
            set.notes,
          ],
        ),
      )
    }
  }

  return queries
}

export async function createManualSession(body: unknown): Promise<SessionDetailResponse> {
  const request = parseManualWorkoutRequest(body)
  const exercisesById = await loadExercisesById(
    request.exercises.map((exercise) => exercise.exerciseDefinitionId),
  )
  const template =
    request.workoutTemplateId == null ? null : await loadTemplateById(request.workoutTemplateId)
  const prepared = prepareManualSession({ request, exercisesById, template })
  const sql = await getSql()

  try {
    await sql.transaction(buildSessionInsertQueries(sql, prepared))
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw new HttpError(500, 'Workout could not be saved')
  }

  return getSession(prepared.sessionId)
}

export async function listSessions(): Promise<SessionListResponse> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, workout_date, workout_template_id, routine_code, template_version, template_name,
              duration_min, effort, pain_level, bodyweight_kg, notes, source_kind, metadata, created_at, updated_at
       FROM workout_sessions
       ORDER BY workout_date DESC, created_at DESC`,
    ),
  )
  return sessionListResponseSchema.parse({
    sessions: z.array(workoutSessionRowSchema).parse(rows).map(sessionSummaryFromRow),
  })
}

export async function getSession(sessionId: string): Promise<SessionDetailResponse> {
  const sql = await getSql()
  const sessionRows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, workout_date, workout_template_id, routine_code, template_version, template_name,
              duration_min, effort, pain_level, bodyweight_kg, notes, source_kind, metadata, created_at, updated_at
       FROM workout_sessions
       WHERE id = $1
       LIMIT 1`,
      [sessionId],
    ),
  )
  const sessionRow = z.array(workoutSessionRowSchema).parse(sessionRows)[0]
  if (!sessionRow) {
    throw new HttpError(404, 'Workout was not found')
  }

  const exerciseRows = await sql.query(
    `SELECT id, workout_session_id, exercise_definition_id, position, slot_id,
            exercise_external_id, exercise_name, notes, metadata, created_at
     FROM workout_session_exercises
     WHERE workout_session_id = $1
     ORDER BY position`,
    [sessionId],
  )
  const exercises = z.array(workoutSessionExerciseRowSchema).parse(exerciseRows)
  const exerciseIds = exercises.map((exercise) => exercise.id)
  const setRows =
    exerciseIds.length === 0
      ? []
      : await sql.query(
          `SELECT id, workout_session_exercise_id, set_number, set_type, load_state, weight_kg,
                  reps, duration_sec, left_reps, right_reps, left_duration_sec, right_duration_sec,
                  notes, metadata, created_at
           FROM workout_sets
           WHERE workout_session_exercise_id = ANY($1::uuid[])
           ORDER BY set_number`,
          [exerciseIds],
        )
  const sets = z.array(workoutSetRowSchema).parse(setRows)
  const setsByExercise = new Map<string, ReturnType<typeof workoutSetFromRow>[]>()
  for (const set of sets) {
    const mapped = workoutSetFromRow(set)
    const list = setsByExercise.get(set.workout_session_exercise_id) ?? []
    list.push(mapped)
    setsByExercise.set(set.workout_session_exercise_id, list)
  }

  const session: WorkoutSession = {
    ...sessionSummaryFromRow(sessionRow),
    bodyweightKg: sessionRow.bodyweight_kg,
    notes: sessionRow.notes,
    metadata: sessionRow.metadata,
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      exerciseDefinitionId: exercise.exercise_definition_id,
      position: exercise.position,
      slotId: exercise.slot_id,
      exerciseExternalId: exercise.exercise_external_id,
      exerciseName: exercise.exercise_name,
      notes: exercise.notes,
      sets: setsByExercise.get(exercise.id) ?? [],
    })),
  }

  return sessionDetailResponseSchema.parse({ session })
}
