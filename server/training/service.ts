import { randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import {
  exerciseDefinitionFromRow,
  exerciseDefinitionRowSchema,
  exerciseListResponseSchema,
  manualWorkoutRequestSchema,
  manualWorkoutRequestValuesSchema,
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
  type SessionSourceKind,
  type TemplateListResponse,
  type WorkoutSession,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
} from '../../src/domain/training.js'
import {
  HOME_AI_PIPELINE,
  HOME_AI_SOURCE_KEY,
  WORKOUT_IMAGE_SOURCE_KEY,
  WORKOUT_SESSION_ENTITY,
  homeAiJobFingerprint,
  provenancePayload,
} from '../../src/domain/training-transcription.js'
import { poundsToKilograms } from '../../src/domain/units.js'
import {
  applyPaperInheritanceToManualRequest,
  fieldErrorCountSummary,
  fieldErrorsForPaperExercises,
} from '../../src/domain/paper-load.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import type { HomeAiClient } from '../integrations/home-ai/client.js'
import { getHomeAiClient } from '../integrations/home-ai/client.js'
import { recordTranscriptionJobCommitted } from './job-store.js'
import { CLAIM_AND_INSERT_WORKOUT_SQL } from './commit-sql.js'

const TABLES_UNAVAILABLE = 'Training tables are not available. Apply pending migrations.'

function decimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new HttpError(400, 'Invalid number')
  }
  return value.toString()
}

export function parseManualWorkoutRequest(body: unknown): ManualWorkoutRequest {
  const loose = manualWorkoutRequestValuesSchema.safeParse(body)
  if (!loose.success) {
    throw new HttpError(400, firstZodMessage(loose.error))
  }
  const fieldErrors = fieldErrorsForPaperExercises(loose.data.exercises)
  if (fieldErrors.length > 0) {
    throw new HttpError(400, fieldErrorCountSummary(fieldErrors.length), fieldErrors)
  }
  const inherited = applyPaperInheritanceToManualRequest(loose.data)
  const parsed = manualWorkoutRequestSchema.safeParse(inherited)
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
  sourceKind: SessionSourceKind
  metadata: Record<string, unknown>
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
  sourceKind?: SessionSourceKind
  metadata?: Record<string, unknown>
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
    sourceKind: input.sourceKind ?? 'manual',
    metadata: { entry_mass_unit: 'lb', ...(input.metadata ?? {}) },
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

async function homeAiSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = await queryOrUnavailable(() =>
    sql.query('SELECT id FROM data_sources WHERE key = $1 LIMIT 1', [HOME_AI_SOURCE_KEY]),
  )
  const sourceId = (rows[0] as { id?: string } | undefined)?.id
  if (!sourceId) {
    throw new HttpError(500, 'Home AI data source is not configured')
  }
  return sourceId
}

export async function findSessionIdByHomeAiJob(jobId: string): Promise<string | null> {
  const sql = await getSql()
  const sourceId = await homeAiSourceId()
  const rows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT entity_id
       FROM source_record_links
       WHERE source_id = $1
         AND entity_type = $2
         AND external_fingerprint = $3
       LIMIT 1`,
      [sourceId, WORKOUT_SESSION_ENTITY, homeAiJobFingerprint(jobId)],
    ),
  )
  const entityId = (rows[0] as { entity_id?: string } | undefined)?.entity_id
  return entityId ?? null
}

export async function createImportedSession(
  body: unknown,
  jobId: string,
  client?: HomeAiClient,
): Promise<SessionDetailResponse> {
  const existingId = await findSessionIdByHomeAiJob(jobId)
  if (existingId) {
    await recordTranscriptionJobCommitted(jobId, existingId).catch(() => undefined)
    return getSession(existingId)
  }

  const homeAi = client ?? (await getHomeAiClient())
  const job = await homeAi.getWorkoutTranscriptionJob(jobId)
  if (job.status !== 'completed' || !job.candidate) {
    throw new HttpError(409, 'Transcription result is no longer available. Import the photo again.')
  }

  const request = parseManualWorkoutRequest(body)
  const exercisesById = await loadExercisesById(
    request.exercises.map((exercise) => exercise.exerciseDefinitionId),
  )
  const template =
    request.workoutTemplateId == null ? null : await loadTemplateById(request.workoutTemplateId)
  const provenance = provenancePayload({
    jobId,
    candidate: job.candidate,
    review: job.review,
  })
  const prepared = prepareManualSession({
    request,
    exercisesById,
    template,
    sourceKind: 'imported_candidate',
    metadata: {
      transcription: {
        originating_source: WORKOUT_IMAGE_SOURCE_KEY,
        interpreter: HOME_AI_SOURCE_KEY,
        pipeline: HOME_AI_PIPELINE,
        home_ai_job_id: jobId,
        transcription_status: job.candidate.transcription_status,
        review_status: job.review?.review_status ?? job.review?.status ?? null,
        save_ready: job.review?.save_ready ?? null,
      },
    },
  })

  const sql = await getSql()
  const sourceId = await homeAiSourceId()
  const importJobId = randomUUID()
  const linkId = randomUUID()

  try {
    await sql.transaction([
      sql.query(
        `INSERT INTO import_jobs (
           id, source_id, imported_at, source_filename, format_version, status,
           record_count, inserted_count, matched_count, skipped_count, error_count, content_hash, metadata
         ) VALUES (
           $1::uuid, $2::uuid, now(), NULL, $3, 'completed',
           1, 1, 0, 0, 0, NULL, $4::jsonb
         )`,
        [
          importJobId,
          sourceId,
          HOME_AI_PIPELINE,
          JSON.stringify({
            originating_source: WORKOUT_IMAGE_SOURCE_KEY,
            home_ai_job_id: jobId,
            pipeline: HOME_AI_PIPELINE,
            transcription_status: job.candidate.transcription_status,
            review_status: job.review?.review_status ?? job.review?.status ?? null,
            save_ready: job.review?.save_ready ?? null,
          }),
        ],
      ),
      sql.query(CLAIM_AND_INSERT_WORKOUT_SQL, [
        linkId,
        sourceId,
        importJobId,
        jobId,
        homeAiJobFingerprint(jobId),
        WORKOUT_SESSION_ENTITY,
        prepared.sessionId,
        JSON.stringify(provenance),
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
      ]),
      ...buildSessionInsertQueries(sql, prepared).slice(1),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    const raced = await findSessionIdByHomeAiJob(jobId)
    if (raced) {
      await recordTranscriptionJobCommitted(jobId, raced).catch(() => undefined)
      return getSession(raced)
    }
    throw new HttpError(500, 'Workout could not be saved')
  }

  const claimedId = (await findSessionIdByHomeAiJob(jobId)) ?? prepared.sessionId
  await recordTranscriptionJobCommitted(jobId, claimedId).catch(() => undefined)
  return getSession(claimedId)
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
