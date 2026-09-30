import { z } from 'zod'
import { distanceToMeters, poundsToKilograms } from './units.js'

const uuidSchema = z.uuid()
const timestamptzSchema = z.coerce.date()
const jsonRecordSchema = z.record(z.string(), z.unknown())

function nullableNumber() {
  return z.any().transform((value, ctx) => {
    if (value == null || value === '') {
      return null
    }
    const parsed = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(parsed)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid number' })
      return z.NEVER
    }
    return parsed
  })
}

function nullableInt() {
  return nullableNumber().transform((value, ctx) => {
    if (value == null) {
      return null
    }
    if (!Number.isInteger(value)) {
      ctx.addIssue({ code: 'custom', message: 'Invalid integer' })
      return z.NEVER
    }
    return value
  })
}

function isoDateFromUnknown() {
  return z.any().transform((value, ctx) => {
    if (typeof value === 'string') {
      const date = value.includes('T') ? value.slice(0, 10) : value
      if (!isCalendarDate(date)) {
        ctx.addIssue({ code: 'custom', message: 'Date must be YYYY-MM-DD' })
        return z.NEVER
      }
      return date
    }
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      const year = value.getUTCFullYear()
      const month = String(value.getUTCMonth() + 1).padStart(2, '0')
      const day = String(value.getUTCDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    ctx.addIssue({ code: 'custom', message: 'Date must be YYYY-MM-DD' })
    return z.NEVER
  })
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function isCalendarDate(value: string): boolean {
  const match = ISO_DATE.exec(value)
  if (!match) {
    return false
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const utc = new Date(Date.UTC(year, month - 1, day))
  return (
    utc.getUTCFullYear() === year &&
    utc.getUTCMonth() === month - 1 &&
    utc.getUTCDate() === day
  )
}

export const isoDateSchema = z
  .string()
  .regex(ISO_DATE, 'Date must be YYYY-MM-DD')
  .refine(isCalendarDate, 'Date is not a valid calendar day')

export const MEASUREMENT_KINDS = [
  'reps',
  'duration',
  'reps_per_side',
  'duration_per_side',
  'distance',
  'distance_duration',
  'completion',
] as const

export const measurementKindSchema = z.enum(MEASUREMENT_KINDS)
export type MeasurementKind = z.infer<typeof measurementKindSchema>

export const SET_TYPES = ['working', 'warmup', 'drop', 'other'] as const
export const setTypeSchema = z.enum(SET_TYPES)
export type SetType = z.infer<typeof setTypeSchema>

export const LOAD_STATES = ['external', 'bodyweight', 'unknown'] as const
export const loadStateSchema = z.enum(LOAD_STATES)
export type LoadState = z.infer<typeof loadStateSchema>

export const SESSION_SOURCE_KINDS = ['manual', 'imported_candidate'] as const
export const sessionSourceKindSchema = z.enum(SESSION_SOURCE_KINDS)
export type SessionSourceKind = z.infer<typeof sessionSourceKindSchema>

export const TRAINING_SESSION_TYPES = ['programmed', 'ad_hoc', 'experiment'] as const
export const trainingSessionTypeSchema = z.enum(TRAINING_SESSION_TYPES)
export type TrainingSessionType = z.infer<typeof trainingSessionTypeSchema>

export const EXPERIMENT_SESSION_MESSAGE =
  'Experiment sessions require a linked Experiment or Benchmark.'

export const OWNER_EXERCISE_LOAD_TYPES = [
  'bodyweight',
  'barbell',
  'dumbbell',
  'kettlebell',
  'dumbbell_or_kettlebell',
  'cable',
  'machine',
  'band',
  'other',
  'none',
] as const
export const ownerExerciseLoadTypeSchema = z.enum(OWNER_EXERCISE_LOAD_TYPES)
export type OwnerExerciseLoadType = z.infer<typeof ownerExerciseLoadTypeSchema>

export const OWNER_EXERCISE_ORIGIN = {
  origin: 'owner',
  created_via: 'ad_hoc_training',
} as const

export const sessionNameSchema = z
  .union([z.string().max(200), z.null()])
  .optional()
  .transform((value) => {
    if (value == null) {
      return null
    }
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  })

export const effortSchema = z.int().min(1).max(5)
export const painLevelSchema = z.int().min(0).max(3)

const optionalNotesSchema = z
  .string()
  .trim()
  .nullable()
  .optional()
  .transform((value) => (value == null || value === '' ? null : value))

function nonemptyText(label: string) {
  return z.string().trim().min(1, `${label} is required`)
}

export const templatePrescriptionSchema = z
  .object({
    measurement: measurementKindSchema,
    min: z.number().optional(),
    max: z.number().optional(),
    min_sec: z.number().optional(),
    max_sec: z.number().optional(),
    min_distance_m: z.number().positive().optional(),
    max_distance_m: z.number().positive().optional(),
    completion: z.boolean().optional(),
  })
  .passthrough()

export type TemplatePrescription = z.infer<typeof templatePrescriptionSchema>

export const exerciseDefinitionRowSchema = z.object({
  id: uuidSchema,
  external_id: z.string().min(1).nullable(),
  name: nonemptyText('Exercise name'),
  measurement_kind: measurementKindSchema,
  load_type: nonemptyText('Load type'),
  unilateral: z.boolean(),
  metadata: jsonRecordSchema,
  gif_url: z.string().nullable(),
  youtube_url: z.string().nullable(),
  form_instructions: z.string().nullable(),
  notes: z.string().nullable(),
  is_active: z.boolean(),
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type ExerciseDefinitionRow = z.infer<typeof exerciseDefinitionRowSchema>

export const exerciseDefinitionSchema = z.object({
  id: uuidSchema,
  externalId: z.string().min(1).nullable(),
  name: nonemptyText('Exercise name'),
  measurementKind: measurementKindSchema,
  loadType: nonemptyText('Load type'),
  unilateral: z.boolean(),
  metadata: jsonRecordSchema,
  gifUrl: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  formInstructions: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
})

export type ExerciseDefinition = z.infer<typeof exerciseDefinitionSchema>

export function exerciseDefinitionFromRow(row: ExerciseDefinitionRow): ExerciseDefinition {
  return exerciseDefinitionSchema.parse({
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    measurementKind: row.measurement_kind,
    loadType: row.load_type,
    unilateral: row.unilateral,
    metadata: row.metadata,
    gifUrl: row.gif_url,
    youtubeUrl: row.youtube_url,
    formInstructions: row.form_instructions,
    notes: row.notes,
    isActive: row.is_active,
  })
}

export const TEMPLATE_ORIGINS = ['seeded', 'owner'] as const
export const templateOriginSchema = z.enum(TEMPLATE_ORIGINS)
export type TemplateOrigin = z.infer<typeof templateOriginSchema>

export const exerciseLibraryRoutineSchema = z.object({
  id: uuidSchema,
  name: nonemptyText('Routine name'),
  routineCode: nonemptyText('Routine'),
  originKind: templateOriginSchema,
})
export type ExerciseLibraryRoutine = z.infer<typeof exerciseLibraryRoutineSchema>

export const exerciseLibraryLastSetSchema = z.object({
  setNumber: z.number().int().positive(),
  loadState: z.enum(['external', 'bodyweight', 'unknown']),
  weightKg: z.number().nullable(),
  reps: z.number().int().nonnegative().nullable(),
  durationSec: z.number().int().nonnegative().nullable(),
  leftReps: z.number().int().nonnegative().nullable(),
  rightReps: z.number().int().nonnegative().nullable(),
  leftDurationSec: z.number().int().nonnegative().nullable(),
  rightDurationSec: z.number().int().nonnegative().nullable(),
  distanceM: z.number().positive().nullable(),
  completed: z.boolean().nullable(),
})
export type ExerciseLibraryLastSet = z.infer<typeof exerciseLibraryLastSetSchema>

export const exerciseLibraryLastSessionSchema = z.object({
  date: isoDateSchema,
  sets: z.array(exerciseLibraryLastSetSchema),
})
export type ExerciseLibraryLastSession = z.infer<typeof exerciseLibraryLastSessionSchema>

export const exerciseLibraryItemSchema = z.object({
  exercise: exerciseDefinitionSchema,
  usageCount: z.number().int().nonnegative(),
  lastPerformedDate: isoDateSchema.nullable(),
  lastSession: exerciseLibraryLastSessionSchema.nullable(),
  activeRoutines: z.array(exerciseLibraryRoutineSchema),
  semanticEditable: z.boolean(),
  builtIn: z.boolean(),
})
export type ExerciseLibraryItem = z.infer<typeof exerciseLibraryItemSchema>

export const exerciseLibraryResponseSchema = z.object({
  exercises: z.array(exerciseLibraryItemSchema),
})
export type ExerciseLibraryResponse = z.infer<typeof exerciseLibraryResponseSchema>

export const workoutTemplateRowSchema = z.object({
  id: uuidSchema,
  routine_code: nonemptyText('Routine'),
  version: nonemptyText('Version'),
  name: nonemptyText('Template name'),
  metadata: jsonRecordSchema,
  is_active: z.boolean(),
  origin_kind: templateOriginSchema,
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type WorkoutTemplateRow = z.infer<typeof workoutTemplateRowSchema>

export const workoutTemplateExerciseRowSchema = z.object({
  id: uuidSchema,
  workout_template_id: uuidSchema,
  exercise_definition_id: uuidSchema,
  slot_id: nonemptyText('Slot'),
  position: z.coerce.number().int().positive(),
  planned_sets: nullableInt(),
  prescription: templatePrescriptionSchema,
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type WorkoutTemplateExerciseRow = z.infer<typeof workoutTemplateExerciseRowSchema>

export const workoutTemplateExerciseSchema = z.object({
  id: uuidSchema,
  slotId: nonemptyText('Slot'),
  position: z.int().positive(),
  plannedSets: z.int().positive().nullable(),
  prescription: templatePrescriptionSchema,
  exercise: exerciseDefinitionSchema,
})

export type WorkoutTemplateExercise = z.infer<typeof workoutTemplateExerciseSchema>

export const workoutTemplateSchema = z.object({
  id: uuidSchema,
  routineCode: nonemptyText('Routine'),
  version: nonemptyText('Version'),
  name: nonemptyText('Template name'),
  metadata: jsonRecordSchema,
  isActive: z.boolean(),
  originKind: templateOriginSchema,
  exercises: z.array(workoutTemplateExerciseSchema),
})

export type WorkoutTemplate = z.infer<typeof workoutTemplateSchema>

export const workoutSetRowSchema = z.object({
  id: uuidSchema,
  workout_session_exercise_id: uuidSchema,
  set_number: z.coerce.number().int().positive(),
  set_type: setTypeSchema,
  load_state: loadStateSchema,
  weight_kg: nullableNumber(),
  reps: nullableInt(),
  duration_sec: nullableInt(),
  left_reps: nullableInt(),
  right_reps: nullableInt(),
  left_duration_sec: nullableInt(),
  right_duration_sec: nullableInt(),
  distance_m: nullableNumber(),
  completed: z.boolean().nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type WorkoutSetRow = z.infer<typeof workoutSetRowSchema>

const nonnegativeInt = z.int().nonnegative()

export const workoutSetSchema = z
  .object({
    id: uuidSchema,
    setNumber: z.int().positive(),
    setType: setTypeSchema,
    loadState: loadStateSchema,
    weightKg: z.number().nonnegative().nullable(),
    reps: nonnegativeInt.nullable(),
    durationSec: nonnegativeInt.nullable(),
    leftReps: nonnegativeInt.nullable(),
    rightReps: nonnegativeInt.nullable(),
    leftDurationSec: nonnegativeInt.nullable(),
    rightDurationSec: nonnegativeInt.nullable(),
    distanceM: z.number().positive().nullable().optional().transform((value) => value ?? null),
    completed: z.boolean().nullable().optional().transform((value) => value ?? null),
    notes: z.string().nullable(),
  })
  .superRefine((set, ctx) => addSetInvariantIssues(set, ctx))

export type WorkoutSet = z.infer<typeof workoutSetSchema>

export const trainingPerformanceBestViewSchema = z.object({
  kind: z.enum(['reps', 'duration', 'distance', 'pace', 'skill']),
  value: z.number(),
  unit: z.enum(['reps', 'sec', 'mi', 'sec/mi', 'completion']),
  date: isoDateSchema,
  sessionId: uuidSchema,
  setId: uuidSchema,
  distanceM: z.number().positive().nullable(),
  durationSec: z.number().int().positive().nullable(),
  completed: z.boolean().nullable(),
})

export type TrainingPerformanceBestView = z.infer<typeof trainingPerformanceBestViewSchema>

export const workoutSessionExerciseRowSchema = z.object({
  id: uuidSchema,
  workout_session_id: uuidSchema,
  exercise_definition_id: uuidSchema,
  position: z.coerce.number().int().positive(),
  slot_id: z.string().min(1).nullable(),
  exercise_external_id: z.string().min(1).nullable(),
  exercise_name: nonemptyText('Exercise name'),
  measurement_kind: measurementKindSchema.optional(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
})

export type WorkoutSessionExerciseRow = z.infer<typeof workoutSessionExerciseRowSchema>

export const workoutSessionExerciseSchema = z.object({
  id: uuidSchema,
  exerciseDefinitionId: uuidSchema,
  position: z.int().positive(),
  slotId: z.string().min(1).nullable(),
  exerciseExternalId: z.string().min(1).nullable(),
  exerciseName: nonemptyText('Exercise name'),
  measurementKind: measurementKindSchema.optional(),
  notes: z.string().nullable(),
  sets: z.array(workoutSetSchema).min(1),
  performanceBests: z.array(trainingPerformanceBestViewSchema).default([]),
})

export type WorkoutSessionExercise = z.infer<typeof workoutSessionExerciseSchema>

export const workoutSessionRowSchema = z.object({
  id: uuidSchema,
  workout_date: isoDateFromUnknown(),
  workout_template_id: uuidSchema.nullable(),
  routine_code: z.string().min(1).nullable(),
  template_version: z.string().min(1).nullable(),
  template_name: z.string().min(1).nullable(),
  session_type: trainingSessionTypeSchema,
  session_name: z
    .string()
    .nullable()
    .refine((value) => value == null || value.trim() !== '', 'Session name cannot be blank'),
  experiment_id: uuidSchema.nullish(),
  benchmark_protocol_version_id: uuidSchema.nullish(),
  duration_min: nullableNumber(),
  effort: nullableInt(),
  pain_level: nullableInt(),
  bodyweight_kg: nullableNumber(),
  notes: z.string().nullable(),
  source_kind: sessionSourceKindSchema,
  metadata: jsonRecordSchema,
  created_at: timestamptzSchema,
  updated_at: timestamptzSchema,
})

export type WorkoutSessionRow = z.infer<typeof workoutSessionRowSchema>

export const workoutSessionSummarySchema = z.object({
  id: uuidSchema,
  workoutDate: isoDateSchema,
  workoutTemplateId: uuidSchema.nullable(),
  routineCode: z.string().min(1).nullable(),
  templateVersion: z.string().min(1).nullable(),
  templateName: z.string().min(1).nullable(),
  sessionType: trainingSessionTypeSchema,
  sessionName: z
    .string()
    .nullable()
    .refine((value) => value == null || value.trim() !== '', 'Session name cannot be blank'),
  experimentId: uuidSchema.nullish(),
  benchmarkProtocolVersionId: uuidSchema.nullish(),
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  sourceKind: sessionSourceKindSchema,
  hasProgrammedExtras: z.boolean().optional(),
})

export type WorkoutSessionSummary = z.infer<typeof workoutSessionSummarySchema>

export const workoutSessionSchema = workoutSessionSummarySchema.extend({
  bodyweightKg: z.number().positive().nullable(),
  notes: z.string().nullable(),
  metadata: jsonRecordSchema,
  exercises: z.array(workoutSessionExerciseSchema).min(1),
})

export type WorkoutSession = z.infer<typeof workoutSessionSchema>

export const exerciseListResponseSchema = z.object({
  exercises: z.array(exerciseDefinitionSchema),
})

export type ExerciseListResponse = z.infer<typeof exerciseListResponseSchema>

export const templateListResponseSchema = z.object({
  templates: z.array(workoutTemplateSchema),
})

export type TemplateListResponse = z.infer<typeof templateListResponseSchema>

export const sessionListResponseSchema = z.object({
  sessions: z.array(workoutSessionSummarySchema),
})

export type SessionListResponse = z.infer<typeof sessionListResponseSchema>

export const sessionDetailResponseSchema = z.object({
  session: workoutSessionSchema,
})

export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>

export const createSessionResponseSchema = sessionDetailResponseSchema
export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>

type SetMeasurementFields = {
  loadState: LoadState
  weightKg?: number | null
  weightLb?: number | null
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
  distanceM?: number | null
  distance?: number | null
  completed?: boolean | null
}

export type MeasurementFamily =
  | 'reps'
  | 'duration'
  | 'reps_per_side'
  | 'duration_per_side'
  | 'distance'
  | 'distance_duration'
  | 'completion'
  | 'mixed'
  | 'empty'

export function measurementFamilyOf(set: {
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
  distanceM?: number | null
  distance?: number | null
  completed?: boolean | null
}): MeasurementFamily {
  const hasReps = set.reps != null
  const hasDuration = set.durationSec != null
  const hasUnilateralReps = set.leftReps != null || set.rightReps != null
  const hasUnilateralDuration = set.leftDurationSec != null || set.rightDurationSec != null
  const hasDistance = (set.distanceM ?? set.distance) != null
  const hasCompletion = set.completed != null
  if (hasCompletion) {
    return hasReps || hasDuration || hasUnilateralReps || hasUnilateralDuration || hasDistance ? 'mixed' : 'completion'
  }
  if (hasReps || hasUnilateralReps || hasUnilateralDuration) {
    const present = [hasReps, hasDuration, hasUnilateralReps, hasUnilateralDuration, hasDistance].filter(Boolean).length
    if (present > 1) return 'mixed'
    if (hasReps) return 'reps'
    if (hasUnilateralReps) return 'reps_per_side'
    return 'duration_per_side'
  }
  if (hasDuration && hasDistance) return 'distance_duration'
  if (hasDistance) return 'distance'
  if (hasDuration) return 'duration'
  return 'empty'
}

export function measurementFamilyMatches(kind: MeasurementKind, family: MeasurementFamily): boolean {
  if (kind === 'distance_duration') return family === 'duration' || family === 'distance_duration'
  return kind === family
}

function addLoadIssues(
  set: { loadState: LoadState; weightKg?: number | null; weightLb?: number | null },
  ctx: z.RefinementCtx,
  weightKey: 'weightKg' | 'weightLb',
): void {
  const weight = weightKey === 'weightKg' ? set.weightKg : set.weightLb
  if (set.loadState === 'external') {
    if (weight == null) {
      ctx.addIssue({
        code: 'custom',
        path: [weightKey],
        message: 'External load requires a weight',
      })
    }
    return
  }
  if (weight != null) {
    ctx.addIssue({
      code: 'custom',
      path: [weightKey],
      message: `${set.loadState} load cannot include a weight`,
    })
  }
}

function addMeasurementFamilyIssues(set: SetMeasurementFields, ctx: z.RefinementCtx): void {
  const family = measurementFamilyOf(set)
  if (family === 'empty') {
    ctx.addIssue({
      code: 'custom',
      message: 'Each set needs a measurement',
    })
    return
  }
  if (family === 'mixed') {
    ctx.addIssue({
      code: 'custom',
      message: 'A set cannot mix reps, duration, bilateral, and unilateral values',
    })
  }
}

function addSetInvariantIssues(set: SetMeasurementFields, ctx: z.RefinementCtx, weightKey: 'weightKg' | 'weightLb' = 'weightKg'): void {
  addLoadIssues(set, ctx, weightKey)
  addMeasurementFamilyIssues(set, ctx)
}

const nullableNonnegativeNumber = z.number().nonnegative().nullable()
const nullableNonnegativeInt = z.int().nonnegative().nullable()

export const distanceUnitSchema = z.enum(['mi', 'km'])
export type DistanceUnit = z.infer<typeof distanceUnitSchema>

export const manualWorkoutSetValuesSchema = z.object({
  setNumber: z.int().positive(),
  setType: setTypeSchema.default('working'),
  loadState: loadStateSchema,
  weightLb: nullableNonnegativeNumber,
  reps: nullableNonnegativeInt,
  durationSec: nullableNonnegativeInt,
  leftReps: nullableNonnegativeInt,
  rightReps: nullableNonnegativeInt,
  leftDurationSec: nullableNonnegativeInt,
  rightDurationSec: nullableNonnegativeInt,
  distance: z.number().positive().nullable().optional().transform((value) => value ?? null),
  distanceUnit: distanceUnitSchema.nullable().optional().transform((value) => value ?? null),
  completed: z.boolean().nullable().optional().transform((value) => value ?? null),
  notes: optionalNotesSchema,
})

export const manualWorkoutSetInputSchema = manualWorkoutSetValuesSchema.superRefine((set, ctx) => {
  addSetInvariantIssues(
    {
      loadState: set.loadState,
      weightLb: set.weightLb,
      reps: set.reps,
      durationSec: set.durationSec,
      leftReps: set.leftReps,
      rightReps: set.rightReps,
      leftDurationSec: set.leftDurationSec,
      rightDurationSec: set.rightDurationSec,
      distance: set.distance,
      completed: set.completed,
    },
    ctx,
    'weightLb',
  )
  if (set.distance != null && set.distanceUnit == null) {
    ctx.addIssue({ code: 'custom', path: ['distanceUnit'], message: 'Distance unit is required when distance is recorded' })
  }
  if (set.distance == null && set.distanceUnit != null) {
    ctx.addIssue({ code: 'custom', path: ['distanceUnit'], message: 'Distance unit requires a distance' })
  }
})

export type ManualWorkoutSetInput = z.infer<typeof manualWorkoutSetInputSchema>
export type ManualWorkoutSetInputDraft = z.input<typeof manualWorkoutSetInputSchema>

export const manualWorkoutExerciseValuesSchema = z.object({
  exerciseDefinitionId: uuidSchema,
  slotId: z.string().trim().min(1).nullable(),
  notes: optionalNotesSchema,
  sets: z.array(manualWorkoutSetValuesSchema).min(1, 'Each exercise needs at least one set'),
})

export const manualWorkoutExerciseInputSchema = z.object({
  exerciseDefinitionId: uuidSchema,
  slotId: z.string().trim().min(1).nullable(),
  notes: optionalNotesSchema,
  sets: z.array(manualWorkoutSetInputSchema).min(1, 'Each exercise needs at least one set'),
})

export type ManualWorkoutExerciseInput = z.infer<typeof manualWorkoutExerciseInputSchema>

export const manualWorkoutRequestSchema = z.object({
  workoutDate: isoDateSchema,
  workoutTemplateId: uuidSchema.nullable(),
  sessionType: trainingSessionTypeSchema,
  sessionName: sessionNameSchema,
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  bodyweightLb: z.number().positive().nullable(),
  notes: optionalNotesSchema,
  experimentId: uuidSchema.nullish(),
  benchmarkProtocolVersionId: uuidSchema.nullish(),
  exercises: z.array(manualWorkoutExerciseInputSchema).min(1, 'Log at least one exercise'),
})

export type ManualWorkoutRequest = z.infer<typeof manualWorkoutRequestSchema>
export type ManualWorkoutRequestInput = z.input<typeof manualWorkoutRequestSchema>

export const manualWorkoutRequestValuesSchema = z.object({
  workoutDate: isoDateSchema,
  workoutTemplateId: uuidSchema.nullable(),
  sessionType: trainingSessionTypeSchema,
  sessionName: sessionNameSchema,
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  bodyweightLb: z.number().positive().nullable(),
  notes: optionalNotesSchema,
  experimentId: uuidSchema.nullish(),
  benchmarkProtocolVersionId: uuidSchema.nullish(),
  exercises: z.array(manualWorkoutExerciseValuesSchema).min(1, 'Log at least one exercise'),
})

export type ManualWorkoutRequestValues = z.infer<typeof manualWorkoutRequestValuesSchema>

export type CanonicalWorkoutSetInsert = {
  setNumber: number
  setType: SetType
  loadState: LoadState
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
  distanceM: number | null
  completed: boolean | null
  notes: string | null
}

export function toCanonicalSetInsert(set: ManualWorkoutSetInput): CanonicalWorkoutSetInsert {
  return {
    setNumber: set.setNumber,
    setType: set.setType,
    loadState: set.loadState,
    weightKg: set.loadState === 'external' && set.weightLb != null ? poundsToKilograms(set.weightLb) : null,
    reps: set.reps,
    durationSec: set.durationSec,
    leftReps: set.leftReps,
    rightReps: set.rightReps,
    leftDurationSec: set.leftDurationSec,
    rightDurationSec: set.rightDurationSec,
    distanceM: set.distance == null ? null : distanceToMeters(set.distance, set.distanceUnit!),
    completed: set.completed,
    notes: set.notes ?? null,
  }
}

export type DraftSetFields = {
  loadState: LoadState
  weightLb: string
  reps: string
  durationSec: string
  leftReps: string
  rightReps: string
  leftDurationSec: string
  rightDurationSec: string
  distance?: string
  distanceUnit?: DistanceUnit
  completed?: boolean | null
  notes: string
  transcribedLoadState?: LoadState
  transcribedWeightLb?: string
}

function parseOptionalNumber(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

function parseOptionalInt(value: string): number | null {
  const parsed = parseOptionalNumber(value)
  if (parsed == null) {
    return null
  }
  if (!Number.isInteger(parsed)) {
    return Number.NaN
  }
  return parsed
}

export function isDraftSetUntouched(set: DraftSetFields): boolean {
  return (
    set.loadState === 'external' &&
    set.weightLb.trim() === '' &&
    set.reps.trim() === '' &&
    set.durationSec.trim() === '' &&
    set.leftReps.trim() === '' &&
    set.rightReps.trim() === '' &&
    set.leftDurationSec.trim() === '' &&
    set.rightDurationSec.trim() === '' &&
    (set.distance?.trim() ?? '') === '' &&
    set.completed == null &&
    set.notes.trim() === ''
  )
}

export function draftSetToManualInput(
  setNumber: number,
  set: DraftSetFields & { setType?: SetType },
): ManualWorkoutSetInputDraft {
  return {
    setNumber,
    setType: set.setType ?? 'working',
    loadState: set.loadState,
    weightLb: parseOptionalNumber(set.weightLb),
    reps: parseOptionalInt(set.reps),
    durationSec: parseOptionalInt(set.durationSec),
    leftReps: parseOptionalInt(set.leftReps),
    rightReps: parseOptionalInt(set.rightReps),
    leftDurationSec: parseOptionalInt(set.leftDurationSec),
    rightDurationSec: parseOptionalInt(set.rightDurationSec),
    distance: parseOptionalNumber(set.distance ?? ''),
    distanceUnit: (set.distance?.trim() ?? '') === '' ? null : (set.distanceUnit ?? 'mi'),
    completed: set.completed,
    notes: set.notes.trim() === '' ? null : set.notes.trim(),
  }
}

export function omitUntouchedDraftSets<T extends DraftSetFields>(sets: T[]): T[] {
  return sets.filter((set) => !isDraftSetUntouched(set))
}

export function sessionSummaryFromRow(row: WorkoutSessionRow): WorkoutSessionSummary {
  return workoutSessionSummarySchema.parse({
    id: row.id,
    workoutDate: row.workout_date,
    workoutTemplateId: row.workout_template_id,
    routineCode: row.routine_code,
    templateVersion: row.template_version,
    templateName: row.template_name,
    sessionType: row.session_type,
    sessionName: row.session_name,
    experimentId: row.experiment_id ?? null,
    benchmarkProtocolVersionId: row.benchmark_protocol_version_id ?? null,
    durationMin: row.duration_min,
    effort: row.effort,
    painLevel: row.pain_level,
    sourceKind: row.source_kind,
    ...(row.metadata.has_programmed_extras === true ? { hasProgrammedExtras: true } : {}),
  })
}

export function workoutSetFromRow(row: WorkoutSetRow): WorkoutSet {
  return workoutSetSchema.parse({
    id: row.id,
    setNumber: row.set_number,
    setType: row.set_type,
    loadState: row.load_state,
    weightKg: row.weight_kg,
    reps: row.reps,
    durationSec: row.duration_sec,
    leftReps: row.left_reps,
    rightReps: row.right_reps,
    leftDurationSec: row.left_duration_sec,
    rightDurationSec: row.right_duration_sec,
    distanceM: row.distance_m,
    completed: row.completed,
    notes: row.notes,
  })
}

export function classifyHistoricalTrainingSession(row: {
  workoutTemplateId?: string | null
  routineCode?: string | null
  templateVersion?: string | null
  templateName?: string | null
}): 'programmed' | 'ad_hoc' {
  if (row.workoutTemplateId || row.routineCode || row.templateVersion || row.templateName) {
    return 'programmed'
  }
  return 'ad_hoc'
}

export function trainingSessionDisplayName(session: {
  sessionType: TrainingSessionType
  sessionName?: string | null
  templateName?: string | null
  routineCode?: string | null
  hasProgrammedExtras?: boolean
}): string {
  if (session.sessionType === 'ad_hoc') {
    const name = session.sessionName?.trim()
    return name ? name : 'Ad-hoc workout'
  }
  if (session.sessionType === 'experiment') {
    const name = session.sessionName?.trim()
    return name ? name : 'Experiment workout'
  }
  const suffix = session.hasProgrammedExtras ? '+' : ''
  const templateName = session.templateName?.trim()
  if (templateName) {
    return `${templateName}${suffix}`
  }
  const routineCode = session.routineCode?.trim()
  if (routineCode) {
    return `Routine ${routineCode}${suffix}`
  }
  return 'Workout'
}

export function sessionIntentLabel(sessionType: TrainingSessionType): string {
  switch (sessionType) {
    case 'programmed':
      return 'Programmed'
    case 'ad_hoc':
      return 'Ad-hoc'
    case 'experiment':
      return 'Experiment'
  }
}

export function trainingSessionCountsAsTraining(sessionType: TrainingSessionType): boolean {
  return (TRAINING_SESSION_TYPES as readonly string[]).includes(sessionType)
}

export function sessionTypeEditError(
  existing: TrainingSessionType,
  next: TrainingSessionType,
): { status: 409; message: string } | null {
  if (existing !== next) {
    return { status: 409, message: 'Session type cannot change.' }
  }
  return null
}

export function programmedTemplateEditError(
  existingTemplateId: string | null,
  requestedTemplateId: string | null,
): string | null {
  if (requestedTemplateId != null && requestedTemplateId !== existingTemplateId) {
    return 'Programmed template identity cannot change.'
  }
  return null
}

export function trainingSessionCoherenceError(input: {
  sessionType: TrainingSessionType
  workoutTemplateId: string | null
  slotIds: ReadonlyArray<string | null>
  experimentId?: string | null
  benchmarkProtocolVersionId?: string | null
}): { status: 400 | 409; message: string } | null {
  const experimentId = input.experimentId ?? null
  const benchmarkProtocolVersionId = input.benchmarkProtocolVersionId ?? null
  if (input.sessionType !== 'experiment') {
    if (experimentId != null || benchmarkProtocolVersionId != null) {
      return { status: 400, message: 'Programmed and ad-hoc workouts cannot link a Personal Lab parent.' }
    }
  }
  if (input.sessionType === 'experiment') {
    if (experimentId == null && benchmarkProtocolVersionId == null) {
      return { status: 409, message: EXPERIMENT_SESSION_MESSAGE }
    }
    if (input.workoutTemplateId != null) {
      return { status: 400, message: 'An experiment workout cannot use a template.' }
    }
    if (input.slotIds.some((slotId) => slotId != null)) {
      return { status: 400, message: 'An experiment exercise cannot use a template slot.' }
    }
    return null
  }
  if (input.sessionType === 'programmed' && input.workoutTemplateId == null) {
    return { status: 400, message: 'A programmed workout needs a template.' }
  }
  if (input.sessionType === 'ad_hoc' && input.workoutTemplateId != null) {
    return { status: 400, message: 'An ad-hoc workout cannot use a template.' }
  }
  if (input.sessionType === 'ad_hoc' && input.slotIds.some((slotId) => slotId != null)) {
    return { status: 400, message: 'An ad-hoc exercise cannot use a template slot.' }
  }
  return null
}

export function ownerExerciseAnalyticsDefaults(
  measurementKind: MeasurementKind,
  unilateral: boolean,
): {
  performanceType: 'other' | 'distance' | 'skill'
  analyticsLoadType: 'none'
  analyticsRepMode: 'standard' | 'per_side'
} {
  const perSide =
    unilateral || measurementKind === 'reps_per_side' || measurementKind === 'duration_per_side'
  return {
    performanceType: measurementKind === 'distance' || measurementKind === 'distance_duration'
      ? 'distance'
      : measurementKind === 'completion'
        ? 'skill'
        : 'other',
    analyticsLoadType: 'none',
    analyticsRepMode: perSide ? 'per_side' : 'standard',
  }
}

export function ownerExerciseCoherenceError(input: {
  measurementKind: MeasurementKind
  unilateral: boolean
}): string | null {
  const perSide = input.measurementKind === 'reps_per_side' || input.measurementKind === 'duration_per_side'
  if (input.unilateral !== perSide) {
    return 'Unilateral must match the measurement family.'
  }
  return null
}

export function isOwnerCreatedExercise(exercise: {
  externalId: string | null
  metadata: Record<string, unknown>
}): boolean {
  return exercise.externalId == null && exercise.metadata.origin === 'owner'
}

function optionalExerciseText(max: number) {
  return z.union([z.string().trim().min(1).max(max), z.null()]).optional()
}

const optionalExerciseUrlSchema = z
  .union([z.string().trim().min(1).max(1000), z.null()])
  .optional()
  .refine((value) => value == null || /^https?:\/\/[^\s]+$/i.test(value), 'Use an http(s) URL')

export const ownerExerciseRequestSchema = z.object({
  name: z.string().trim().min(1, 'Exercise name is required').max(120),
  measurementKind: measurementKindSchema,
  loadType: ownerExerciseLoadTypeSchema,
  unilateral: z.boolean(),
  gifUrl: optionalExerciseUrlSchema,
  youtubeUrl: optionalExerciseUrlSchema,
  formInstructions: optionalExerciseText(3000),
  notes: optionalExerciseText(2000),
  primaryMuscleGroup: optionalExerciseText(80),
  secondaryMuscleGroups: z.array(z.string().trim().min(1).max(80)).max(12).nullable().optional(),
  movementPattern: optionalExerciseText(80),
  aliases: z.array(z.string().trim().min(1).max(80)).max(20).nullable().optional(),
})

export type OwnerExerciseRequest = z.infer<typeof ownerExerciseRequestSchema>

export const ownerRoutineSlotSchema = z.object({
  exerciseDefinitionId: uuidSchema,
  plannedSets: z.int().min(1).max(20),
  prescription: templatePrescriptionSchema,
})

export const ownerRoutineRequestSchema = z.object({
  name: z.string().trim().min(1, 'Routine name is required').max(120),
  slots: z.array(ownerRoutineSlotSchema).min(1, 'Add at least one exercise').max(30),
}).strict()

export type OwnerRoutineRequest = z.infer<typeof ownerRoutineRequestSchema>

function positiveRangeError(min: number | undefined, max: number | undefined, label: string, integer = false): string | null {
  for (const value of [min, max]) {
    if (value != null && (!Number.isFinite(value) || value <= 0 || (integer && !Number.isInteger(value)))) {
      return `${label} values must be positive${integer ? ' whole numbers' : ''}.`
    }
  }
  if (min != null && max != null && min > max) return `${label} minimum cannot exceed maximum.`
  return null
}

export function ownerRoutinePrescriptionError(
  measurementKind: MeasurementKind,
  prescription: TemplatePrescription,
): string | null {
  if (prescription.measurement !== measurementKind) return 'Routine prescription must match the exercise measurement.'
  const repsPresent = prescription.min != null || prescription.max != null
  const durationPresent = prescription.min_sec != null || prescription.max_sec != null
  const distancePresent = prescription.min_distance_m != null || prescription.max_distance_m != null
  const completionPresent = prescription.completion != null

  if (measurementKind === 'reps' || measurementKind === 'reps_per_side') {
    if (durationPresent || distancePresent || completionPresent) return 'Reps prescriptions cannot contain duration, distance, or completion fields.'
    return positiveRangeError(prescription.min, prescription.max, 'Rep prescription', true)
  }
  if (measurementKind === 'duration' || measurementKind === 'duration_per_side') {
    if (repsPresent || distancePresent || completionPresent) return 'Duration prescriptions cannot contain reps, distance, or completion fields.'
    return positiveRangeError(prescription.min_sec, prescription.max_sec, 'Duration prescription', true)
  }
  if (measurementKind === 'distance') {
    if (repsPresent || durationPresent || completionPresent) return 'Distance prescriptions cannot contain reps, duration, or completion fields.'
    return positiveRangeError(prescription.min_distance_m, prescription.max_distance_m, 'Distance prescription')
  }
  if (measurementKind === 'distance_duration') {
    if (repsPresent || completionPresent) return 'Distance + duration prescriptions cannot contain reps or completion fields.'
    return positiveRangeError(prescription.min_distance_m, prescription.max_distance_m, 'Distance prescription') ??
      positiveRangeError(prescription.min_sec, prescription.max_sec, 'Duration prescription', true)
  }
  if (repsPresent || durationPresent || distancePresent) return 'Skill prescriptions cannot contain reps, duration, or distance fields.'
  if (prescription.completion != null && prescription.completion !== true) return 'Skill routine prescriptions must represent an achievement attempt.'
  return null
}

export function planOwnerExercisePatch(input: {
  existing: {
    externalId: string | null
    metadata: Record<string, unknown>
    name: string
    measurementKind: MeasurementKind
    loadType: string
    unilateral: boolean
  }
  next: OwnerExerciseRequest
  used: boolean
}):
  | {
      ok: true
      name: string
      measurementKind: MeasurementKind
      loadType: OwnerExerciseLoadType
      unilateral: boolean
      semanticEditable: boolean
      semanticChanged: boolean
      analytics: ReturnType<typeof ownerExerciseAnalyticsDefaults>
    }
  | { ok: false; status: 400 | 409; message: string } {
  const coherence = ownerExerciseCoherenceError(input.next)
  if (coherence) {
    return { ok: false, status: 400, message: coherence }
  }
  const ownerCreated = isOwnerCreatedExercise(input.existing)
  const semanticChange =
    input.next.measurementKind !== input.existing.measurementKind ||
    input.next.unilateral !== input.existing.unilateral ||
    input.next.loadType !== input.existing.loadType
  if (!ownerCreated && semanticChange) {
    return {
      ok: false,
      status: 409,
      message: 'Built-in exercise measurement settings are locked.',
    }
  }
  if (input.used && semanticChange) {
    return {
      ok: false,
      status: 409,
      message: 'This exercise already has workout history. Create a new exercise to change its measurement settings.',
    }
  }
  return {
    ok: true,
    name: input.next.name,
    measurementKind: input.next.measurementKind,
    loadType: input.next.loadType,
    unilateral: input.next.unilateral,
    semanticEditable: ownerCreated && !input.used,
    semanticChanged: semanticChange,
    analytics: ownerExerciseAnalyticsDefaults(input.next.measurementKind, input.next.unilateral),
  }
}

export function formatPrescription(plannedSets: number | null, prescription: TemplatePrescription): string {
  const setsLabel = plannedSets == null ? '' : `${plannedSets} × `
  if (prescription.measurement === 'duration' || prescription.measurement === 'duration_per_side') {
    const min = prescription.min_sec
    const max = prescription.max_sec
    const range = min != null && max != null ? `${min}–${max} sec` : 'duration'
    const side = prescription.measurement === 'duration_per_side' ? ' per side' : ''
    return `${setsLabel}${range}${side}`.trim()
  }
  if (prescription.measurement === 'distance' || prescription.measurement === 'distance_duration') {
    const distance = prescription.min_distance_m != null && prescription.max_distance_m != null
      ? `${Math.round(prescription.min_distance_m)}–${Math.round(prescription.max_distance_m)} m`
      : prescription.min_distance_m != null
        ? `≥ ${Math.round(prescription.min_distance_m)} m`
        : 'distance'
    const duration = prescription.measurement === 'distance_duration' && prescription.min_sec != null && prescription.max_sec != null
      ? ` · ${prescription.min_sec}–${prescription.max_sec} sec`
      : ''
    return `${setsLabel}${distance}${duration}`.trim()
  }
  if (prescription.measurement === 'completion') {
    return `${setsLabel}skill attempt`.trim()
  }
  const min = prescription.min
  const max = prescription.max
  const range = min != null && max != null ? `${min}–${max}` : 'reps'
  const side = prescription.measurement === 'reps_per_side' ? ' per side' : ''
  return `${setsLabel}${range}${side}`.trim()
}
