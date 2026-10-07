import { randomUUID } from 'node:crypto'
import { z, ZodError } from 'zod'
import {
  EXPERIMENT_SESSION_MESSAGE,
  exerciseDefinitionFromRow,
  exerciseDefinitionRowSchema,
  exerciseListResponseSchema,
  manualWorkoutRequestSchema,
  manualWorkoutRequestValuesSchema,
  measurementFamilyAllowedForExercise,
  measurementFamilyOf,
  ownerRoutinePrescriptionError,
  ownerRoutineRequestSchema,
  sessionDetailResponseSchema,
  sessionListResponseSchema,
  sessionSummaryFromRow,
  templateListResponseSchema,
  templatePrescriptionSchema,
  toCanonicalSetInsert,
  programmedTemplateEditError,
  sessionTypeEditError,
  trainingSessionCoherenceError,
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
  type OwnerRoutineRequest,
  type SessionDetailResponse,
  type SessionListResponse,
  type SessionSourceKind,
  type TrainingSessionType,
  type TemplateListResponse,
  type WorkoutSession,
  type WorkoutTemplate,
  type WorkoutTemplateExercise,
} from '../../src/domain/training.js'
import { assertTrainingLabParents } from '../lab/service.js'
import {
  HOME_AI_PIPELINE,
  HOME_AI_SOURCE_KEY,
  WORKOUT_IMAGE_SOURCE_KEY,
  WORKOUT_SESSION_ENTITY,
  homeAiJobFingerprint,
  provenancePayload,
} from '../../src/domain/training-transcription.js'
import { poundsToKilograms } from '../../src/domain/units.js'
import { bestTrainingPerformance, trainingPerformanceObservations, TRAINING_PERFORMANCE_KINDS } from '../../src/domain/progress/training-performance.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from '../../src/domain/progress/types.js'
import type { TrainingPerformanceBestView } from '../../src/domain/training.js'
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

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
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
      `SELECT id, external_id, name, measurement_kind, load_type, unilateral, side_tracking_mode, metadata, gif_url, youtube_url, form_instructions, notes, is_active, created_at, updated_at
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
      `SELECT id, routine_code, version, name, metadata, is_active, origin_kind, created_at, updated_at
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
          `SELECT id, external_id, name, measurement_kind, load_type, unilateral, side_tracking_mode, metadata, gif_url, youtube_url, form_instructions, notes, is_active, created_at, updated_at
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
      originKind: template.origin_kind,
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
      `SELECT id, external_id, name, measurement_kind, load_type, unilateral, side_tracking_mode, metadata, gif_url, youtube_url, form_instructions, notes, is_active, created_at, updated_at
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
  limitationKind: ManualWorkoutRequest['limitationKind']
  limitationNote: string | null
  bodyweightKg: number | null
  notes: string | null
  sourceKind: SessionSourceKind
  sessionType: TrainingSessionType
  sessionName: string | null
  experimentId: string | null
  benchmarkProtocolVersionId: string | null
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
  const { request, exercisesById } = input
  const coherence = trainingSessionCoherenceError({
    sessionType: request.sessionType,
    workoutTemplateId: request.workoutTemplateId,
    slotIds: request.exercises.map((exercise) => exercise.slotId),
    experimentId: request.experimentId,
    benchmarkProtocolVersionId: request.benchmarkProtocolVersionId,
  })
  if (coherence) {
    throw new HttpError(coherence.status, coherence.message)
  }
  const template = request.sessionType === 'programmed' ? input.template : null
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
      if (!measurementFamilyAllowedForExercise(definition.measurementKind, definition.sideTrackingMode, family)) {
        throw new HttpError(
          400,
          `${definition.name} expects ${definition.measurementKind.replaceAll('_', ' ')}`,
        )
      }
      if (definition.sideTrackingMode !== 'independent' && (canonical.leftFailureKind != null || canonical.rightFailureKind != null)) {
        throw new HttpError(400, `${definition.name} does not support side-specific failure evidence`)
      }
      if (definition.sideTrackingMode === 'independent' && family === 'reps_per_side' && (canonical.leftReps == null || canonical.rightReps == null)) {
        throw new HttpError(400, `${definition.name} needs both left and right reps when using independent-side tracking`)
      }
      if (definition.sideTrackingMode === 'independent' && family === 'duration_per_side' && (canonical.leftDurationSec == null || canonical.rightDurationSec == null)) {
        throw new HttpError(400, `${definition.name} needs both left and right durations when using independent-side tracking`)
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
    limitationKind: request.limitationKind ?? null,
    limitationNote: request.limitationNote ?? null,
    bodyweightKg:
      request.bodyweightLb == null ? null : poundsToKilograms(request.bodyweightLb),
    notes: request.notes ?? null,
    sourceKind: input.sourceKind ?? 'manual',
    sessionType: request.sessionType,
    sessionName: request.sessionType === 'programmed' ? null : request.sessionName,
    experimentId: request.sessionType === 'experiment' ? (request.experimentId ?? null) : null,
    benchmarkProtocolVersionId:
      request.sessionType === 'experiment' ? (request.benchmarkProtocolVersionId ?? null) : null,
    metadata: {
      ...(input.metadata ?? {}),
      entry_mass_unit: 'lb',
      has_programmed_extras:
        request.sessionType === 'programmed' && request.exercises.some((exercise) => exercise.slotId == null),
    },
    exercises,
  }
}

export function buildSessionInsertQueries(
  sql: Awaited<ReturnType<typeof getSql>>,
  prepared: PreparedManualSession,
) {
  const queries = [
    sql.query(
      `INSERT INTO workout_sessions (
         id, workout_date, workout_template_id, routine_code, template_version, template_name,
         duration_min, effort, pain_level, limitation_kind, limitation_note, bodyweight_kg, notes, source_kind, metadata,
         session_type, session_name, experiment_id, benchmark_protocol_version_id
       ) VALUES (
         $1::uuid, $2::date, $3::uuid, $4, $5, $6,
         $7::numeric, $8::int, $9::int, $10, $11, $12::numeric, $13, $14, $15::jsonb,
         $16, $17, $18::uuid, $19::uuid
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
        prepared.limitationKind,
        prepared.limitationNote,
        prepared.bodyweightKg == null ? null : decimalString(prepared.bodyweightKg),
        prepared.notes,
        prepared.sourceKind,
        JSON.stringify(prepared.metadata),
        prepared.sessionType,
        prepared.sessionName,
        prepared.experimentId,
        prepared.benchmarkProtocolVersionId,
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
             reps, duration_sec, left_reps, right_reps, left_duration_sec, right_duration_sec,
             distance_m, completed, rir, rpe, failure_kind, left_failure_kind, right_failure_kind, notes
           ) VALUES (
             $1::uuid, $2::int, $3, $4, $5::numeric,
             $6::int, $7::int, $8::int, $9::int, $10::int, $11::int,
             $12::numeric, $13::boolean, $14::int, $15::numeric, $16, $17, $18, $19
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
            set.distanceM == null ? null : decimalString(set.distanceM),
            set.completed,
            set.rir,
            set.rpe == null ? null : decimalString(set.rpe),
            set.failureKind,
            set.leftFailureKind,
            set.rightFailureKind,
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
  await assertTrainingLabParents({
    sessionType: prepared.sessionType,
    experimentId: prepared.experimentId,
    benchmarkProtocolVersionId: prepared.benchmarkProtocolVersionId,
  })
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

export function importedSessionReuse(
  existingId: string | null,
  sessionFound: boolean,
): 'reuse' | 'deleted' | 'create' {
  if (!existingId) {
    return 'create'
  }
  return sessionFound ? 'reuse' : 'deleted'
}

export const UPDATE_WORKOUT_SESSION_SQL = `UPDATE workout_sessions
         SET workout_date = $2::date,
             workout_template_id = $3::uuid,
             routine_code = $4,
             template_version = $5,
             template_name = $6,
             duration_min = $7::numeric,
             effort = $8::int,
             pain_level = $9::int,
             limitation_kind = $10,
             limitation_note = $11,
             bodyweight_kg = $12::numeric,
             notes = $13,
             metadata = $14::jsonb,
             session_name = $15,
             updated_at = now()
         WHERE id = $1::uuid`

export const DELETE_WORKOUT_SESSION_EXERCISES_SQL = `DELETE FROM workout_session_exercises
         WHERE workout_session_id = $1::uuid`

export const DETACH_TRANSCRIPTION_SESSION_SQL = `UPDATE workout_transcription_jobs
         SET workout_session_id = NULL,
             updated_at = now()
         WHERE workout_session_id = $1::uuid`

export const DELETE_WORKOUT_SESSION_SQL = `DELETE FROM workout_sessions WHERE id = $1::uuid`

export async function createImportedSession(
  body: unknown,
  jobId: string,
  client?: HomeAiClient,
): Promise<SessionDetailResponse> {
  const existingId = await findSessionIdByHomeAiJob(jobId)
  if (existingId) {
    try {
      const existing = await getSession(existingId)
      await recordTranscriptionJobCommitted(jobId, existingId).catch(() => undefined)
      return existing
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 404) {
        throw new HttpError(409, 'This transcription was already committed. The workout was deleted.')
      }
      throw error
    }
  }

  const homeAi = client ?? (await getHomeAiClient())
  const job = await homeAi.getWorkoutTranscriptionJob(jobId)
  if (job.status !== 'completed' || !job.candidate) {
    throw new HttpError(409, 'Transcription result is no longer available. Import the photo again.')
  }

  const request = parseManualWorkoutRequest(body)
  if (request.sessionType === 'experiment') {
    throw new HttpError(409, EXPERIMENT_SESSION_MESSAGE)
  }
  if (request.sessionType !== 'programmed') {
    throw new HttpError(400, 'Imported workouts are programmed Training.')
  }
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
        prepared.limitationKind,
        prepared.limitationNote,
        prepared.bodyweightKg == null ? null : decimalString(prepared.bodyweightKg),
        prepared.notes,
        prepared.sourceKind,
        JSON.stringify(prepared.metadata),
        prepared.sessionType,
        prepared.sessionName,
      ]),
      ...buildSessionInsertQueries(sql, prepared).slice(1),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    const raced = await findSessionIdByHomeAiJob(jobId)
    if (raced) {
      try {
        const existing = await getSession(raced)
        await recordTranscriptionJobCommitted(jobId, raced).catch(() => undefined)
        return existing
      } catch (inner) {
        if (inner instanceof HttpError && inner.statusCode === 404) {
          throw new HttpError(409, 'This transcription was already committed. The workout was deleted.')
        }
        throw inner
      }
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
              session_type, session_name, experiment_id, benchmark_protocol_version_id,
              duration_min, effort, pain_level, limitation_kind, limitation_note, bodyweight_kg, notes, source_kind, metadata, created_at, updated_at
       FROM workout_sessions
       ORDER BY workout_date DESC, created_at DESC`,
    ),
  )
  return sessionListResponseSchema.parse({
    sessions: z.array(workoutSessionRowSchema).parse(rows).map(sessionSummaryFromRow),
  })
}

async function loadTrainingPerformanceBests(
  exerciseIds: readonly string[],
): Promise<Map<string, TrainingPerformanceBestView[]>> {
  const unique = [...new Set(exerciseIds)]
  if (unique.length === 0) return new Map()
  const sql = await getSql()
  const definitionRows = (await sql.query(
    `SELECT id::text AS id, name, external_id, performance_type, analytics_load_type,
            analytics_rep_mode, measurement_kind, load_type, unilateral
       FROM exercise_definitions
      WHERE id = ANY($1::uuid[])`,
    [unique],
  )) as Array<Record<string, unknown>>
  const exercises = definitionRows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    externalId: row.external_id == null ? null : String(row.external_id),
    performanceType: row.performance_type as ProgressExerciseDefinition['performanceType'],
    analyticsLoadType: row.analytics_load_type as ProgressExerciseDefinition['analyticsLoadType'],
    analyticsRepMode: row.analytics_rep_mode as ProgressExerciseDefinition['analyticsRepMode'],
    measurementKind: String(row.measurement_kind),
    loadType: String(row.load_type),
    unilateral: row.unilateral === true,
  }))
  const setRows = (await sql.query(
    `SELECT sets.id::text AS set_id, sessions.id::text AS session_id,
            session_exercises.id::text AS session_exercise_id,
            session_exercises.exercise_definition_id::text AS exercise_id,
            sessions.workout_date::text AS session_date,
            sessions.created_at::text AS session_created_at,
            session_exercises.position AS session_exercise_position,
            sets.set_number, sets.set_type, sets.load_state, sets.weight_kg::text AS weight_kg,
            sets.reps, sets.duration_sec, sets.left_reps, sets.right_reps,
            sets.left_duration_sec, sets.right_duration_sec,
            sets.distance_m::text AS distance_m, sets.completed
       FROM workout_sets sets
       JOIN workout_session_exercises session_exercises ON session_exercises.id = sets.workout_session_exercise_id
       JOIN workout_sessions sessions ON sessions.id = session_exercises.workout_session_id
      WHERE session_exercises.exercise_definition_id = ANY($1::uuid[])
        AND sessions.session_type IN ('programmed', 'ad_hoc', 'experiment')
      ORDER BY sessions.workout_date, sessions.created_at, sessions.id,
               session_exercises.position, sets.set_number, sets.id`,
    [unique],
  )) as Array<Record<string, unknown>>
  const records: CanonicalSetRecord[] = setRows.map((set) => ({
    setId: String(set.set_id),
    sessionId: String(set.session_id),
    sessionExerciseId: String(set.session_exercise_id),
    exerciseId: String(set.exercise_id),
    sessionDate: String(set.session_date),
    sessionCreatedAt: String(set.session_created_at),
    sessionExercisePosition: Number(set.session_exercise_position),
    setNumber: Number(set.set_number),
    setType: String(set.set_type),
    loadState: String(set.load_state),
    weightKg: numberOrNull(set.weight_kg),
    reps: numberOrNull(set.reps),
    durationSec: numberOrNull(set.duration_sec),
    leftReps: numberOrNull(set.left_reps),
    rightReps: numberOrNull(set.right_reps),
    leftDurationSec: numberOrNull(set.left_duration_sec),
    rightDurationSec: numberOrNull(set.right_duration_sec),
    distanceM: numberOrNull(set.distance_m),
    completed: set.completed == null ? null : set.completed === true,
  }))
  const observations = trainingPerformanceObservations(records, exercises)
  const byExercise = new Map<string, TrainingPerformanceBestView[]>()
  for (const exercise of exercises) {
    const bests = TRAINING_PERFORMANCE_KINDS.flatMap((kind) => {
      const best = bestTrainingPerformance(observations, { exerciseId: exercise.id, kind })
      if (!best) return []
      return [{
        kind: best.kind,
        value: best.value,
        unit: best.unit,
        date: best.date,
        sessionId: best.sourceSet.sessionId,
        setId: best.sourceSet.setId,
        distanceM: best.distanceM,
        durationSec: best.durationSec,
        completed: best.completed,
      } satisfies TrainingPerformanceBestView]
    })
    byExercise.set(exercise.id, bests)
  }
  return byExercise
}

export async function getSession(sessionId: string): Promise<SessionDetailResponse> {
  const sql = await getSql()
  const sessionRows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, workout_date, workout_template_id, routine_code, template_version, template_name,
              session_type, session_name, experiment_id, benchmark_protocol_version_id,
              duration_min, effort, pain_level, limitation_kind, limitation_note, bodyweight_kg, notes, source_kind, metadata, created_at, updated_at
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
    `SELECT session_exercises.id, session_exercises.workout_session_id,
            session_exercises.exercise_definition_id, session_exercises.position, session_exercises.slot_id,
            session_exercises.exercise_external_id, session_exercises.exercise_name,
            definitions.measurement_kind, definitions.side_tracking_mode, session_exercises.notes, session_exercises.metadata, session_exercises.created_at
     FROM workout_session_exercises session_exercises
     JOIN exercise_definitions definitions ON definitions.id = session_exercises.exercise_definition_id
     WHERE session_exercises.workout_session_id = $1
     ORDER BY session_exercises.position`,
    [sessionId],
  )
  const exercises = z.array(workoutSessionExerciseRowSchema).parse(exerciseRows)
  const exerciseIds = exercises.map((exercise) => exercise.id)
  const performanceBestsByExercise = await loadTrainingPerformanceBests(
    exercises.map((exercise) => exercise.exercise_definition_id),
  )
  const setRows =
    exerciseIds.length === 0
      ? []
      : await sql.query(
          `SELECT id, workout_session_exercise_id, set_number, set_type, load_state, weight_kg,
                  reps, duration_sec, left_reps, right_reps, left_duration_sec, right_duration_sec,
                  distance_m, completed, rir, rpe, failure_kind, left_failure_kind, right_failure_kind, notes, metadata, created_at
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
      measurementKind: exercise.measurement_kind,
      sideTrackingMode: exercise.side_tracking_mode,
      notes: exercise.notes,
      sets: setsByExercise.get(exercise.id) ?? [],
      performanceBests: performanceBestsByExercise.get(exercise.exercise_definition_id) ?? [],
    })),
  }

  return sessionDetailResponseSchema.parse({ session })
}

async function loadTemplateForEdit(templateId: string): Promise<WorkoutTemplate> {
  try {
    return await loadTemplateById(templateId)
  } catch (error) {
    if (!(error instanceof HttpError) || error.statusCode !== 400) {
      throw error
    }
  }
  const listed = await listTemplates()
  const active = listed.templates.find((item) => item.id === templateId)
  if (active) {
    return active
  }
  const sql = await getSql()
  const templateRows = await queryOrUnavailable(() =>
    sql.query(
      `SELECT id, routine_code, version, name, metadata, is_active, origin_kind, created_at, updated_at
       FROM workout_templates
       WHERE id = $1
       LIMIT 1`,
      [templateId],
    ),
  )
  const template = z.array(workoutTemplateRowSchema).parse(templateRows)[0]
  if (!template) {
    throw new HttpError(400, 'Workout template was not found')
  }
  const slotRows = await sql.query(
    `SELECT id, workout_template_id, exercise_definition_id, slot_id, position, planned_sets, prescription, metadata, created_at
     FROM workout_template_exercises
     WHERE workout_template_id = $1
     ORDER BY position`,
    [templateId],
  )
  const parsedSlots = z.array(workoutTemplateExerciseRowSchema).parse(slotRows)
  const exerciseIds = [...new Set(parsedSlots.map((slot) => slot.exercise_definition_id))]
  const exercisesById = await loadExercisesById(exerciseIds)
  return workoutTemplateSchema.parse({
    id: template.id,
    routineCode: template.routine_code,
    version: template.version,
    name: template.name,
    metadata: template.metadata,
    isActive: template.is_active,
    originKind: template.origin_kind,
    exercises: parsedSlots.map((slot) => {
      const exercise = exercisesById.get(slot.exercise_definition_id)
      if (!exercise) {
        throw new HttpError(500, 'Template exercise is missing its definition')
      }
      return mapTemplateExercise(slot, exercise)
    }),
  })
}


function parseOwnerRoutine(body: unknown): OwnerRoutineRequest {
  const parsed = ownerRoutineRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? 'Invalid Saved Routine')
  }
  return parsed.data
}

async function validateOwnerRoutineExercises(
  request: OwnerRoutineRequest,
): Promise<Map<string, ExerciseDefinition>> {
  const byId = await loadExercisesById(request.slots.map((slot) => slot.exerciseDefinitionId))
  for (const slot of request.slots) {
    const exercise = byId.get(slot.exerciseDefinitionId)
    if (!exercise || !exercise.isActive) {
      throw new HttpError(400, 'Saved Routines can use only active exercises.')
    }
    const prescriptionError = ownerRoutinePrescriptionError(exercise.measurementKind, slot.prescription)
    if (prescriptionError) {
      throw new HttpError(400, `${exercise.name}: ${prescriptionError}`)
    }
  }
  return byId
}

function ownerRoutineSlotQueries(
  sql: Awaited<ReturnType<typeof getSql>>,
  templateId: string,
  request: OwnerRoutineRequest,
) {
  return request.slots.map((slot, index) =>
    sql.query(
      `INSERT INTO workout_template_exercises (
         id, workout_template_id, exercise_definition_id, slot_id, position, planned_sets, prescription, metadata
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, $5::int, $6::int, $7::jsonb, '{}'::jsonb
       )`,
      [
        randomUUID(),
        templateId,
        slot.exerciseDefinitionId,
        `O${String(index + 1).padStart(2, '0')}`,
        index + 1,
        slot.plannedSets,
        JSON.stringify(slot.prescription),
      ],
    ),
  )
}

export async function createOwnerRoutine(body: unknown): Promise<WorkoutTemplate> {
  const request = parseOwnerRoutine(body)
  await validateOwnerRoutineExercises(request)
  const sql = await getSql()
  const id = randomUUID()
  const routineCode = `owner:${randomUUID()}`
  const now = new Date().toISOString()
  try {
    await sql.transaction([
      sql.query(
        `INSERT INTO workout_templates (
           id, routine_code, version, name, metadata, is_active, origin_kind, created_at, updated_at
         ) VALUES ($1::uuid, $2, '1', $3, '{}'::jsonb, true, 'owner', $4::timestamptz, $4::timestamptz)`,
        [id, routineCode, request.name, now],
      ),
      ...ownerRoutineSlotQueries(sql, id, request),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw new HttpError(500, 'Saved Routine could not be created')
  }
  return loadTemplateById(id)
}

export async function reviseOwnerRoutine(templateId: string, body: unknown): Promise<WorkoutTemplate> {
  const request = parseOwnerRoutine(body)
  await validateOwnerRoutineExercises(request)
  const sql = await getSql()
  const before = (await queryOrUnavailable(() =>
    sql.query(
      `SELECT origin_kind, is_active FROM workout_templates WHERE id = $1::uuid LIMIT 1`,
      [templateId],
    ),
  )) as Array<{ origin_kind?: string; is_active?: boolean }>
  if (!before[0]) {
    throw new HttpError(404, 'Saved Routine was not found')
  }
  if (before[0].origin_kind !== 'owner') {
    throw new HttpError(409, 'Built-in routines cannot be changed.')
  }
  if (before[0].is_active !== true) {
    throw new HttpError(409, 'Saved Routine changed since editing began.')
  }

  const nextId = randomUUID()
  const now = new Date().toISOString()
  try {
    await sql.transaction([
      sql.query(
        `WITH deactivated AS (
           UPDATE workout_templates
              SET is_active = false, updated_at = $4::timestamptz
            WHERE id = $1::uuid AND origin_kind = 'owner' AND is_active = true
            RETURNING routine_code, version
         )
         INSERT INTO workout_templates (
           id, routine_code, version, name, metadata, is_active, origin_kind, created_at, updated_at
         )
         SELECT $2::uuid, routine_code, (version::integer + 1)::text, $3, '{}'::jsonb,
                true, 'owner', $4::timestamptz, $4::timestamptz
         FROM deactivated
         WHERE version ~ '^[0-9]+$'
         RETURNING id::text AS id`,
        [templateId, nextId, request.name, now],
      ),
      ...ownerRoutineSlotQueries(sql, nextId, request),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    const after = (await sql.query(
      `SELECT origin_kind, is_active FROM workout_templates WHERE id = $1::uuid LIMIT 1`,
      [templateId],
    )) as Array<{ origin_kind?: string; is_active?: boolean }>
    if (!after[0] || after[0].origin_kind !== 'owner' || after[0].is_active !== true) {
      throw new HttpError(409, 'Saved Routine changed since editing began.')
    }
    throw new HttpError(500, 'Saved Routine could not be revised')
  }
  try {
    return await loadTemplateById(nextId)
  } catch {
    throw new HttpError(409, 'Saved Routine changed since editing began.')
  }
}

export async function archiveOwnerRoutine(templateId: string): Promise<{ ok: true }> {
  const sql = await getSql()
  const rows = (await queryOrUnavailable(() =>
    sql.query(
      `UPDATE workout_templates
          SET is_active = false, updated_at = now()
        WHERE id = $1::uuid AND origin_kind = 'owner' AND is_active = true
        RETURNING id::text AS id`,
      [templateId],
    ),
  )) as Array<{ id?: string }>
  if (!rows[0]?.id) {
    const existing = (await sql.query(
      `SELECT origin_kind, is_active FROM workout_templates WHERE id = $1::uuid LIMIT 1`,
      [templateId],
    )) as Array<{ origin_kind?: string; is_active?: boolean }>
    if (!existing[0]) {
      throw new HttpError(404, 'Saved Routine was not found')
    }
    if (existing[0].origin_kind !== 'owner') {
      throw new HttpError(409, 'Built-in routines cannot be changed.')
    }
    throw new HttpError(409, 'Saved Routine is no longer current.')
  }
  return { ok: true }
}

export async function updateManualSession(sessionId: string, body: unknown): Promise<SessionDetailResponse> {
  const existing = await getSession(sessionId)
  const request = parseManualWorkoutRequest(body)
  const typeError = sessionTypeEditError(existing.session.sessionType, request.sessionType)
  if (typeError) {
    throw new HttpError(typeError.status, typeError.message)
  }
  const exercisesById = await loadExercisesById(
    request.exercises.map((exercise) => exercise.exerciseDefinitionId),
  )
  let template: WorkoutTemplate | null = null
  let nextRequest = request
  if (existing.session.sessionType === 'ad_hoc') {
    nextRequest = { ...request, workoutTemplateId: null, sessionType: 'ad_hoc', experimentId: null, benchmarkProtocolVersionId: null }
  } else if (existing.session.sessionType === 'experiment') {
    nextRequest = {
      ...request,
      workoutTemplateId: null,
      sessionType: 'experiment',
      experimentId: existing.session.experimentId ?? null,
      benchmarkProtocolVersionId: existing.session.benchmarkProtocolVersionId ?? null,
    }
  } else {
    const templateError = programmedTemplateEditError(existing.session.workoutTemplateId, request.workoutTemplateId)
    if (templateError) {
      throw new HttpError(409, templateError)
    }
    const templateId = existing.session.workoutTemplateId
    if (templateId == null) {
      throw new HttpError(400, 'A programmed workout needs a template.')
    }
    template = await loadTemplateForEdit(templateId)
    nextRequest = { ...request, workoutTemplateId: templateId, sessionType: 'programmed', sessionName: null }
  }
  const prepared = prepareManualSession({
    request: nextRequest,
    exercisesById,
    template,
    sessionId,
    sourceKind: existing.session.sourceKind,
    metadata: existing.session.metadata,
  })
  const sql = await getSql()
  try {
    await sql.transaction([
      sql.query(UPDATE_WORKOUT_SESSION_SQL, [
        prepared.sessionId,
        prepared.workoutDate,
        prepared.workoutTemplateId,
        prepared.routineCode,
        prepared.templateVersion,
        prepared.templateName,
        prepared.durationMin == null ? null : decimalString(prepared.durationMin),
        prepared.effort,
        prepared.painLevel,
        prepared.limitationKind,
        prepared.limitationNote,
        prepared.bodyweightKg == null ? null : decimalString(prepared.bodyweightKg),
        prepared.notes,
        JSON.stringify(prepared.metadata),
        prepared.sessionName,
      ]),
      sql.query(DELETE_WORKOUT_SESSION_EXERCISES_SQL, [prepared.sessionId]),
      ...buildSessionInsertQueries(sql, prepared).slice(1),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw new HttpError(500, 'Workout could not be saved')
  }
  return getSession(prepared.sessionId)
}

export async function deleteManualSession(sessionId: string): Promise<void> {
  await getSession(sessionId)
  const sql = await getSql()
  try {
    await sql.transaction([
      sql.query(DETACH_TRANSCRIPTION_SESSION_SQL, [sessionId]),
      sql.query(DELETE_WORKOUT_SESSION_SQL, [sessionId]),
    ])
  } catch (error) {
    if (asMissingRelation(error)) {
      throw new HttpError(503, TABLES_UNAVAILABLE)
    }
    throw new HttpError(500, 'Workout could not be deleted')
  }
}
