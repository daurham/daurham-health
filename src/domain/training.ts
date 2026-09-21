import { z } from 'zod'
import { poundsToKilograms } from './units.js'

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
    isActive: row.is_active,
  })
}

export const workoutTemplateRowSchema = z.object({
  id: uuidSchema,
  routine_code: nonemptyText('Routine'),
  version: nonemptyText('Version'),
  name: nonemptyText('Template name'),
  metadata: jsonRecordSchema,
  is_active: z.boolean(),
  created_at: timestamptzSchema,
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
    notes: z.string().nullable(),
  })
  .superRefine((set, ctx) => addSetInvariantIssues(set, ctx))

export type WorkoutSet = z.infer<typeof workoutSetSchema>

export const workoutSessionExerciseRowSchema = z.object({
  id: uuidSchema,
  workout_session_id: uuidSchema,
  exercise_definition_id: uuidSchema,
  position: z.coerce.number().int().positive(),
  slot_id: z.string().min(1).nullable(),
  exercise_external_id: z.string().min(1).nullable(),
  exercise_name: nonemptyText('Exercise name'),
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
  notes: z.string().nullable(),
  sets: z.array(workoutSetSchema).min(1),
})

export type WorkoutSessionExercise = z.infer<typeof workoutSessionExerciseSchema>

export const workoutSessionRowSchema = z.object({
  id: uuidSchema,
  workout_date: isoDateFromUnknown(),
  workout_template_id: uuidSchema.nullable(),
  routine_code: z.string().min(1).nullable(),
  template_version: z.string().min(1).nullable(),
  template_name: z.string().min(1).nullable(),
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
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  sourceKind: sessionSourceKindSchema,
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
}

export type MeasurementFamily = 'reps' | 'duration' | 'reps_per_side' | 'duration_per_side' | 'mixed' | 'empty'

export function measurementFamilyOf(set: {
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
}): MeasurementFamily {
  const hasReps = set.reps != null
  const hasDuration = set.durationSec != null
  const hasUnilateralReps = set.leftReps != null || set.rightReps != null
  const hasUnilateralDuration = set.leftDurationSec != null || set.rightDurationSec != null
  const present = [hasReps, hasDuration, hasUnilateralReps, hasUnilateralDuration].filter(Boolean).length
  if (present === 0) {
    return 'empty'
  }
  if (present > 1) {
    return 'mixed'
  }
  if (hasReps) {
    return 'reps'
  }
  if (hasDuration) {
    return 'duration'
  }
  if (hasUnilateralReps) {
    return 'reps_per_side'
  }
  return 'duration_per_side'
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
      message: 'Each set needs reps or duration',
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
  notes: optionalNotesSchema,
})

export const manualWorkoutSetInputSchema = manualWorkoutSetValuesSchema.superRefine((set, ctx) =>
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
    },
    ctx,
    'weightLb',
  ),
)

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
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  bodyweightLb: z.number().positive().nullable(),
  notes: optionalNotesSchema,
  exercises: z.array(manualWorkoutExerciseInputSchema).min(1, 'Log at least one exercise'),
})

export type ManualWorkoutRequest = z.infer<typeof manualWorkoutRequestSchema>
export type ManualWorkoutRequestInput = z.input<typeof manualWorkoutRequestSchema>

export const manualWorkoutRequestValuesSchema = z.object({
  workoutDate: isoDateSchema,
  workoutTemplateId: uuidSchema.nullable(),
  durationMin: z.number().positive().nullable(),
  effort: effortSchema.nullable(),
  painLevel: painLevelSchema.nullable(),
  bodyweightLb: z.number().positive().nullable(),
  notes: optionalNotesSchema,
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
    durationMin: row.duration_min,
    effort: row.effort,
    painLevel: row.pain_level,
    sourceKind: row.source_kind,
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
    notes: row.notes,
  })
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
  const min = prescription.min
  const max = prescription.max
  const range = min != null && max != null ? `${min}–${max}` : 'reps'
  const side = prescription.measurement === 'reps_per_side' ? ' per side' : ''
  return `${setsLabel}${range}${side}`.trim()
}
