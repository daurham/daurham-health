import { z } from 'zod'
import {
  effortSchema,
  isCalendarDate,
  loadStateSchema,
  measurementKindSchema,
  painLevelSchema,
  setTypeSchema,
  templatePrescriptionSchema,
  workoutTemplateSchema,
  type LoadState,
  type SetType,
  type WorkoutTemplate,
} from './training.js'

export const HOME_AI_SOURCE_KEY = 'home_ai'
export const WORKOUT_IMAGE_SOURCE_KEY = 'workout_image'
export const WORKOUT_SESSION_ENTITY = 'workout_session'
export const HOME_AI_PIPELINE = 'workout-v1.3.1'
export const WORKOUT_PHOTO_MAX_BYTES = 12 * 1024 * 1024

export const HOME_AI_JOB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isHomeAiJobId(value: string): boolean {
  return HOME_AI_JOB_ID_RE.test(value)
}

export function homeAiJobFingerprint(jobId: string): string {
  return `${HOME_AI_PIPELINE}-job:${jobId}`
}

export const homeAiJobStatusSchema = z.enum(['queued', 'processing', 'completed', 'failed'])
export type HomeAiJobStatus = z.infer<typeof homeAiJobStatusSchema>

const jsonRecordSchema = z.record(z.string(), z.unknown())

export const homeAiErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  details: jsonRecordSchema.optional(),
})
export type HomeAiError = z.infer<typeof homeAiErrorSchema>

export const homeAiAmbiguitySchema = z.object({
  location: z.string().optional(),
  field: z.string().optional(),
  reason: z.string().optional(),
  detected_value: z.unknown().optional(),
})

const nullableNumber = z.number().nullable().optional()

export const homeAiCandidateSetSchema = z.object({
  set_number: z.number().int().positive(),
  type: z.string().nullable().optional(),
  weight_lb: nullableNumber,
  load_state: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  reps: nullableNumber,
  duration_sec: nullableNumber,
  left_reps: nullableNumber,
  right_reps: nullableNumber,
  left_duration_sec: nullableNumber,
  right_duration_sec: nullableNumber,
})

export const homeAiCandidateExerciseSchema = z.object({
  slot_id: z.string().min(1),
  exercise_id: z.string().min(1),
  notes: z.string().nullable().optional(),
  sets: z.array(homeAiCandidateSetSchema),
})

export const homeAiCandidateWorkoutSchema = z.object({
  date: z.string().nullable().optional(),
  routine: z.string().nullable().optional(),
  template_version: z.string().nullable().optional(),
  duration_min: nullableNumber,
  effort: nullableNumber,
  pain: z
    .object({
      level: nullableNumber,
      areas: z.array(z.unknown()).optional(),
      notes: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  bodyweight_lb: nullableNumber,
  notes: z.string().nullable().optional(),
  exercises: z.array(homeAiCandidateExerciseSchema).default([]),
})

export const homeAiCandidateSchema = z.object({
  schema_version: z.string().optional(),
  transcription_status: z.enum(['VALID', 'REVIEW_REQUIRED', 'INVALID']),
  ambiguities: z.array(homeAiAmbiguitySchema).optional(),
  workout: homeAiCandidateWorkoutSchema,
})
export type HomeAiCandidate = z.infer<typeof homeAiCandidateSchema>

export const homeAiReviewIssueSchema = z.object({
  code: z.string().optional(),
  location: z.string().optional(),
  message: z.string().optional(),
})

export const homeAiReviewSchema = z.object({
  status: z.string().nullable().optional(),
  issues: z.array(homeAiReviewIssueSchema).optional(),
  schema_valid: z.boolean().optional(),
  semantic_valid: z.boolean().optional(),
  review_status: z.string().nullable().optional(),
  save_ready: z.boolean().optional(),
  blocking_issues: z.array(z.string()).optional(),
  non_blocking_issues: z.array(z.string()).optional(),
})
export type HomeAiReview = z.infer<typeof homeAiReviewSchema>

export const homeAiCreatedJobSchema = z.object({
  ok: z.literal(true),
  job: z.object({
    id: z.string().regex(HOME_AI_JOB_ID_RE),
    status: z.literal('queued'),
  }),
})

export const homeAiJobSchema = z.object({
  ok: z.literal(true),
  job: z
    .object({
      id: z.string().regex(HOME_AI_JOB_ID_RE),
      status: homeAiJobStatusSchema,
      elapsed_ms: z.number().nonnegative().optional(),
      candidate: z.unknown().optional(),
      review: z.unknown().optional(),
      error: homeAiErrorSchema.optional(),
    })
    .superRefine((job, ctx) => {
      if (job.status === 'completed' && job.candidate == null) {
        ctx.addIssue({ code: 'custom', message: 'Completed job is missing a candidate' })
      }
      if (job.status === 'failed' && job.error == null) {
        ctx.addIssue({ code: 'custom', message: 'Failed job is missing an error' })
      }
    }),
})

export const transcriptionGuidanceSchema = z.object({
  code: z.string().min(1),
  message: z.string().min(1),
  path: z.string().min(1).optional(),
})
export type TranscriptionGuidance = z.infer<typeof transcriptionGuidanceSchema>

export const transcriptionDraftSetSchema = z.object({
  setNumber: z.int().positive(),
  setType: setTypeSchema,
  loadState: loadStateSchema,
  weightLb: z.string(),
  reps: z.string(),
  durationSec: z.string(),
  leftReps: z.string(),
  rightReps: z.string(),
  leftDurationSec: z.string(),
  rightDurationSec: z.string(),
  notes: z.string(),
  transcribedLoadState: loadStateSchema.optional(),
  transcribedWeightLb: z.string().optional(),
})

export const transcriptionDraftExerciseSchema = z.object({
  exerciseDefinitionId: z.uuid(),
  slotId: z.string().min(1).nullable(),
  name: z.string().min(1),
  measurementKind: measurementKindSchema,
  plannedSets: z.int().positive().nullable(),
  prescription: templatePrescriptionSchema,
  notes: z.string(),
  sets: z.array(transcriptionDraftSetSchema).min(1),
})

export const transcriptionDraftSchema = z.object({
  workoutDate: z.string(),
  workoutTemplateId: z.uuid().nullable(),
  durationMin: z.string(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  bodyweightLb: z.string(),
  notes: z.string(),
  exercises: z.array(transcriptionDraftExerciseSchema),
})
export type TranscriptionDraft = z.infer<typeof transcriptionDraftSchema>

export const transcriptionJobSummarySchema = z.object({
  id: z.string().regex(HOME_AI_JOB_ID_RE),
  status: homeAiJobStatusSchema,
  elapsedMs: z.number().nonnegative().nullable(),
})

export const transcriptionAnalysisSchema = z.object({
  transcriptionStatus: z.enum(['VALID', 'REVIEW_REQUIRED', 'INVALID']).nullable(),
  reviewStatus: z.string().nullable(),
  saveReady: z.boolean().nullable(),
  guidance: z.array(transcriptionGuidanceSchema),
})

export const createTranscriptionJobResponseSchema = z.object({
  job: z.object({
    id: z.string().regex(HOME_AI_JOB_ID_RE),
    status: z.literal('queued'),
  }),
})
export type CreateTranscriptionJobResponse = z.infer<typeof createTranscriptionJobResponseSchema>

export const pendingTranscriptionJobSchema = z.object({
  id: z.string().regex(HOME_AI_JOB_ID_RE),
  status: z.enum(['queued', 'processing', 'completed', 'failed']),
  filename: z.string().nullable(),
  failureMessage: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type PendingTranscriptionJob = z.infer<typeof pendingTranscriptionJobSchema>

export const transcriptionJobListResponseSchema = z.object({
  jobs: z.array(pendingTranscriptionJobSchema),
})
export type TranscriptionJobListResponse = z.infer<typeof transcriptionJobListResponseSchema>

export const transcriptionJobResponseSchema = z.object({
  job: transcriptionJobSummarySchema,
  analysis: transcriptionAnalysisSchema.nullable(),
  draft: transcriptionDraftSchema.nullable(),
  template: workoutTemplateSchema.nullable(),
  canAdapt: z.boolean(),
  failure: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
    })
    .nullable(),
})
export type TranscriptionJobResponse = z.infer<typeof transcriptionJobResponseSchema>

export const commitImportedWorkoutRequestSchema = z.object({
  jobId: z.string().regex(HOME_AI_JOB_ID_RE),
})
export type CommitImportedWorkoutRequest = z.infer<typeof commitImportedWorkoutRequestSchema>

export function sanitizeHomeAiCandidate(value: unknown): HomeAiCandidate {
  return homeAiCandidateSchema.parse(value)
}

export function sanitizeHomeAiReview(value: unknown): HomeAiReview {
  return homeAiReviewSchema.parse(value)
}

export function homeAiFailureMessage(code: string): string {
  switch (code) {
    case 'REGISTRATION_FAILED':
      return "Couldn't align the workout sheet. Make sure all four corner markers are visible."
    case 'UNSUPPORTED_IMAGE':
      return 'Use a JPEG or PNG workout photo.'
    case 'UPLOAD_TOO_LARGE':
      return 'That photo is too large. Use a JPEG or PNG under 12 MB.'
    case 'MISSING_IMAGE':
      return 'Choose a JPEG or PNG workout photo.'
    case 'INVALID_IMAGE':
      return "Couldn't read that photo. Try another JPEG or PNG."
    case 'PIPELINE_INTERRUPTED':
      return 'Analysis was interrupted on the home server. Try the photo again.'
    case 'JOB_NOT_FOUND':
      return 'That analysis job was not found.'
    case 'INVALID_JOB_ID':
      return 'That analysis job id is invalid.'
    case 'PIPELINE_FAILED':
    default:
      return 'Workout analysis failed. Try the photo again.'
  }
}

function looksLikePath(value: string): boolean {
  return value.includes('/home/') || value.includes('\\') || value.includes('stack')
}

export function guidanceFromCandidate(candidate: HomeAiCandidate, review: HomeAiReview | null): TranscriptionGuidance[] {
  const guidance: TranscriptionGuidance[] = []
  const date = candidate.workout.date
  if (date == null || date === '' || !isCalendarDate(date)) {
    guidance.push({
      code: 'DATE_NEEDS_CONFIRMATION',
      message: 'Date needs confirmation',
      path: 'workoutDate',
    })
  }

  for (const ambiguity of candidate.ambiguities ?? []) {
    const blob = `${ambiguity.location ?? ''} ${ambiguity.field ?? ''} ${ambiguity.reason ?? ''}`
    if (/date/i.test(blob) && !guidance.some((item) => item.code === 'DATE_NEEDS_CONFIRMATION')) {
      guidance.push({
        code: 'DATE_NEEDS_CONFIRMATION',
        message: 'Date needs confirmation',
        path: 'workoutDate',
      })
      continue
    }
    const setMatch = /set[_\s-]*(\d+)/i.exec(blob)
    const setNumber = setMatch ? setMatch[1] : null
    if (/load|weight/i.test(blob)) {
      guidance.push({
        code: 'UNREADABLE_LOAD',
        message: setNumber ? `Set ${setNumber} load could not be read` : 'A set load could not be read',
        path: setNumber ? `sets.${setNumber}.weightLb` : undefined,
      })
      continue
    }
    if (/right/i.test(blob) && /rep/i.test(blob)) {
      guidance.push({
        code: 'MISSING_RIGHT_REPS',
        message: 'Right-side reps are missing',
      })
      continue
    }
    if (/left/i.test(blob) && /rep/i.test(blob)) {
      guidance.push({
        code: 'MISSING_LEFT_REPS',
        message: 'Left-side reps are missing',
      })
    }
  }

  for (const issue of review?.issues ?? []) {
    const code = issue.code ?? 'REVIEW_ISSUE'
    if (guidance.some((item) => item.code === code || item.code === 'DATE_NEEDS_CONFIRMATION' && /date/i.test(code))) {
      continue
    }
    if (/date/i.test(`${issue.code ?? ''} ${issue.location ?? ''}`)) {
      if (!guidance.some((item) => item.code === 'DATE_NEEDS_CONFIRMATION')) {
        guidance.push({
          code: 'DATE_NEEDS_CONFIRMATION',
          message: 'Date needs confirmation',
          path: 'workoutDate',
        })
      }
      continue
    }
    const message = issue.message?.trim()
    if (message && !looksLikePath(message)) {
      guidance.push({ code, message })
    }
  }

  if (review?.save_ready || review?.review_status === 'AUTO_ACCEPT' || review?.status === 'AUTO_ACCEPT') {
    guidance.push({
      code: 'STILL_NEEDS_HUMAN_REVIEW',
      message: 'Home AI marked this as save-ready. Review the whole workout anyway — it can still be wrong.',
    })
  }

  if (candidate.transcription_status === 'INVALID') {
    guidance.push({
      code: 'INVALID_CANDIDATE',
      message: 'Home AI flagged this sheet as invalid. Correct every blocking field before saving.',
    })
  }

  return uniqueGuidance(guidance)
}

function uniqueGuidance(items: TranscriptionGuidance[]): TranscriptionGuidance[] {
  const seen = new Set<string>()
  const out: TranscriptionGuidance[] = []
  for (const item of items) {
    const key = `${item.code}:${item.path ?? ''}:${item.message}`
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    out.push(item)
  }
  return out
}

export function parsePaperTemplateVersion(
  routine: string | null | undefined,
  templateVersion: string | null | undefined,
): { routineCode: string | null; version: string | null; paperForm: string | null } {
  const routineCode = normalizeRoutine(routine)
  const raw = templateVersion?.trim() || null
  if (raw == null) {
    return { routineCode, version: null, paperForm: null }
  }
  const paper = /^([ABC])-(.+)$/i.exec(raw)
  if (paper) {
    const fromPaper = paper[1]!.toUpperCase()
    const version = paper[2]!
    if (routineCode != null && routineCode !== fromPaper) {
      return { routineCode: null, version: null, paperForm: raw }
    }
    return { routineCode: fromPaper, version, paperForm: `${fromPaper}-${version}` }
  }
  return { routineCode, version: raw, paperForm: routineCode ? `${routineCode}-${raw}` : null }
}

function normalizeRoutine(value: string | null | undefined): string | null {
  const trimmed = value?.trim().toUpperCase() ?? ''
  if (trimmed === 'A' || trimmed === 'B' || trimmed === 'C') {
    return trimmed
  }
  return null
}

export function resolveWorkoutTemplate(
  routine: string | null | undefined,
  templateVersion: string | null | undefined,
  templates: readonly WorkoutTemplate[],
): { template: WorkoutTemplate | null; warnings: TranscriptionGuidance[] } {
  const parsed = parsePaperTemplateVersion(routine, templateVersion)
  const warnings: TranscriptionGuidance[] = []

  if (routine?.trim() && parsed.routineCode == null && !/^[ABC]-/i.test(templateVersion?.trim() ?? '')) {
    warnings.push({
      code: 'UNKNOWN_ROUTINE',
      message: 'Routine could not be resolved against Health templates.',
    })
  }
  if (
    routine?.trim() &&
    templateVersion?.trim() &&
    /^[ABC]-/i.test(templateVersion) &&
    parsed.routineCode == null
  ) {
    warnings.push({
      code: 'TEMPLATE_ROUTINE_CONFLICT',
      message: 'Routine and template version disagree. Choose the correct template before saving.',
    })
    return { template: null, warnings }
  }

  const matches = templates.filter((template) => {
    const paperForm = typeof template.metadata.paper_form === 'string' ? template.metadata.paper_form : null
    if (parsed.paperForm && paperForm === parsed.paperForm) {
      return true
    }
    if (parsed.routineCode && parsed.version) {
      return template.routineCode === parsed.routineCode && template.version === parsed.version
    }
    return false
  })

  if (matches.length === 1) {
    return { template: matches[0]!, warnings }
  }

  if (templateVersion?.trim() || routine?.trim()) {
    warnings.push({
      code: 'UNKNOWN_TEMPLATE',
      message: 'Template version could not be resolved against Health templates.',
    })
  }
  return { template: null, warnings }
}

function emptySet(setNumber: number): TranscriptionDraft['exercises'][number]['sets'][number] {
  return {
    setNumber,
    setType: 'working' as const,
    loadState: 'external' as const,
    weightLb: '',
    reps: '',
    durationSec: '',
    leftReps: '',
    rightReps: '',
    leftDurationSec: '',
    rightDurationSec: '',
    notes: '',
    transcribedLoadState: 'external',
    transcribedWeightLb: '',
  }
}

function stringifyNumber(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) {
    return ''
  }
  return String(value)
}

function mapSetType(value: string | null | undefined): SetType {
  if (value === 'warmup' || value === 'drop' || value === 'other' || value === 'working') {
    return value
  }
  return 'working'
}

function mapLoadState(value: string | null | undefined): LoadState {
  if (value === 'bodyweight' || value === 'unknown' || value === 'external') {
    return value
  }
  return 'external'
}

export type LibraryExercise = {
  id: string
  externalId: string | null
  name: string
  measurementKind: TranscriptionDraft['exercises'][number]['measurementKind']
  unilateral: boolean
}

export function adaptHomeAiCandidate(input: {
  candidate: HomeAiCandidate
  review: HomeAiReview | null
  templates: readonly WorkoutTemplate[]
  exercises: readonly LibraryExercise[]
}): {
  draft: TranscriptionDraft | null
  warnings: TranscriptionGuidance[]
  canAdapt: boolean
} {
  const warnings = [
    ...guidanceFromCandidate(input.candidate, input.review),
    ...resolveWorkoutTemplate(
      input.candidate.workout.routine,
      input.candidate.workout.template_version,
      input.templates,
    ).warnings,
  ]
  const { template } = resolveWorkoutTemplate(
    input.candidate.workout.routine,
    input.candidate.workout.template_version,
    input.templates,
  )

  const libraryByExternalId = new Map(
    input.exercises
      .filter((exercise) => exercise.externalId)
      .map((exercise) => [exercise.externalId!, exercise] as const),
  )
  const workout = input.candidate.workout
  const candidateBySlot = new Map(workout.exercises.map((exercise) => [exercise.slot_id, exercise] as const))
  const usedCandidateSlots = new Set<string>()
  const draftExercises: TranscriptionDraft['exercises'] = []

  const slots = template?.exercises ?? []
  for (const slot of slots) {
    const candidateExercise = candidateBySlot.get(slot.slotId)
    const planned = slot.plannedSets ?? 1
    const baseSets = Array.from({ length: planned }, (_, index) => emptySet(index + 1))
    if (!candidateExercise) {
      warnings.push({
        code: 'MISSING_SLOT',
        message: `No transcribed sets for ${slot.exercise.name}.`,
        path: `exercises.${slot.slotId}`,
      })
      draftExercises.push({
        exerciseDefinitionId: slot.exercise.id,
        slotId: slot.slotId,
        name: slot.exercise.name,
        measurementKind: slot.exercise.measurementKind,
        plannedSets: slot.plannedSets,
        prescription: slot.prescription,
        notes: '',
        sets: baseSets,
      })
      continue
    }
    usedCandidateSlots.add(slot.slotId)
    if (candidateExercise.exercise_id !== slot.exercise.externalId) {
      warnings.push({
        code: 'SLOT_EXERCISE_CONFLICT',
        message: `Slot ${slot.slotId} does not match ${candidateExercise.exercise_id} in Health.`,
        path: `exercises.${slot.slotId}`,
      })
      draftExercises.push({
        exerciseDefinitionId: slot.exercise.id,
        slotId: slot.slotId,
        name: slot.exercise.name,
        measurementKind: slot.exercise.measurementKind,
        plannedSets: slot.plannedSets,
        prescription: slot.prescription,
        notes: '',
        sets: baseSets,
      })
      continue
    }
    draftExercises.push({
      exerciseDefinitionId: slot.exercise.id,
      slotId: slot.slotId,
      name: slot.exercise.name,
      measurementKind: slot.exercise.measurementKind,
      plannedSets: slot.plannedSets,
      prescription: slot.prescription,
      notes: candidateExercise.notes ?? '',
      sets: overlaySets(baseSets, candidateExercise.sets),
    })
  }

  for (const candidateExercise of workout.exercises) {
    if (usedCandidateSlots.has(candidateExercise.slot_id)) {
      continue
    }
    const definition = libraryByExternalId.get(candidateExercise.exercise_id)
    if (!definition) {
      warnings.push({
        code: 'UNKNOWN_EXERCISE',
        message: `Exercise ${candidateExercise.exercise_id} is not in the Health library.`,
        path: `exercises.${candidateExercise.slot_id}`,
      })
      continue
    }
    if (template) {
      warnings.push({
        code: 'SLOT_NOT_ON_TEMPLATE',
        message: `Slot ${candidateExercise.slot_id} is not on the resolved Health template.`,
        path: `exercises.${candidateExercise.slot_id}`,
      })
    }
    draftExercises.push({
      exerciseDefinitionId: definition.id,
      slotId: template ? null : candidateExercise.slot_id,
      name: definition.name,
      measurementKind: definition.measurementKind,
      plannedSets: candidateExercise.sets.length || 1,
      prescription: { measurement: definition.measurementKind },
      notes: candidateExercise.notes ?? '',
      sets: overlaySets(
        Array.from({ length: Math.max(candidateExercise.sets.length, 1) }, (_, index) => emptySet(index + 1)),
        candidateExercise.sets,
      ),
    })
  }

  const date = workout.date
  const draft: TranscriptionDraft = {
    workoutDate: date != null && isCalendarDate(date) ? date : '',
    workoutTemplateId: template?.id ?? null,
    durationMin: stringifyNumber(workout.duration_min ?? null),
    effort: typeof workout.effort === 'number' && workout.effort >= 1 && workout.effort <= 5 ? workout.effort : null,
    painLevel:
      typeof workout.pain?.level === 'number' && workout.pain.level >= 0 && workout.pain.level <= 3
        ? workout.pain.level
        : null,
    bodyweightLb: stringifyNumber(workout.bodyweight_lb ?? null),
    notes: workout.notes ?? '',
    exercises: draftExercises,
  }

  const canAdapt = draft.exercises.length > 0
  if (!canAdapt) {
    warnings.push({
      code: 'UNADAPTABLE_CANDIDATE',
      message: 'This photo could not be turned into an editable workout.',
    })
    return { draft: null, warnings: uniqueGuidance(warnings), canAdapt: false }
  }

  return {
    draft: transcriptionDraftSchema.parse(draft),
    warnings: uniqueGuidance(warnings),
    canAdapt: true,
  }
}

function overlaySets(
  base: TranscriptionDraft['exercises'][number]['sets'],
  candidateSets: HomeAiCandidate['workout']['exercises'][number]['sets'],
): TranscriptionDraft['exercises'][number]['sets'] {
  const byNumber = new Map(base.map((set) => [set.setNumber, { ...set }]))
  for (const candidate of candidateSets) {
    const current = byNumber.get(candidate.set_number) ?? emptySet(candidate.set_number)
    const loadState = mapLoadState(candidate.load_state)
    const weightLb = loadState === 'external' ? stringifyNumber(candidate.weight_lb) : ''
    byNumber.set(candidate.set_number, {
      ...current,
      setType: mapSetType(candidate.type),
      loadState,
      weightLb,
      reps: stringifyNumber(candidate.reps),
      durationSec: stringifyNumber(candidate.duration_sec),
      leftReps: stringifyNumber(candidate.left_reps),
      rightReps: stringifyNumber(candidate.right_reps),
      leftDurationSec: stringifyNumber(candidate.left_duration_sec),
      rightDurationSec: stringifyNumber(candidate.right_duration_sec),
      notes: candidate.notes ?? '',
      transcribedLoadState: loadState,
      transcribedWeightLb: weightLb,
    })
  }
  return [...byNumber.values()].sort((a, b) => a.setNumber - b.setNumber)
}

export function provenancePayload(input: {
  jobId: string
  candidate: HomeAiCandidate
  review: HomeAiReview | null
}): Record<string, unknown> {
  return {
    originating_source: WORKOUT_IMAGE_SOURCE_KEY,
    interpreter: HOME_AI_SOURCE_KEY,
    pipeline: HOME_AI_PIPELINE,
    home_ai_job_id: input.jobId,
    transcription_status: input.candidate.transcription_status,
    review_status: input.review?.review_status ?? input.review?.status ?? null,
    save_ready: input.review?.save_ready ?? null,
    candidate: input.candidate,
    review: input.review,
  }
}
