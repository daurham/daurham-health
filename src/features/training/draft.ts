import {
  draftSetToManualInput,
  isCalendarDate,
  isDraftSetUntouched,
  manualWorkoutRequestSchema,
  type DraftSetFields,
  type LoadState,
  type ManualWorkoutRequest,
  type MeasurementKind,
  type SetType,
  type TemplatePrescription,
  type TrainingSessionType,
  type WorkoutSession,
  type WorkoutTemplate,
} from '@/domain/training'
import { kilogramsToPounds, metersToMiles } from '@/domain/units'
import {
  fieldErrorCountSummary,
  interpretPaperSets,
  resolvedLoadState,
  resolvedWeightLb,
  validateInterpretedPaperSets,
  type ReviewFieldError,
} from '@/domain/paper-load'
import { localIsoDate } from './format'

export class DraftValidationError extends Error {
  readonly fields: ReviewFieldError[]

  constructor(fields: ReviewFieldError[]) {
    super(fieldErrorCountSummary(fields.length))
    this.name = 'DraftValidationError'
    this.fields = fields
  }
}

export type DraftSet = DraftSetFields & {
  setNumber: number
  setType: SetType
}

export type DraftExercise = {
  exerciseDefinitionId: string
  slotId: string | null
  name: string
  measurementKind: MeasurementKind
  plannedSets: number | null
  prescription: TemplatePrescription
  notes: string
  sets: DraftSet[]
}

export type WorkoutDraft = {
  template: WorkoutTemplate | null
  workoutTemplateId?: string | null
  sessionType: TrainingSessionType
  sessionName: string
  workoutDate: string
  durationMin: string
  effort: number | null
  painLevel: number | null
  bodyweightLb: string
  notes: string
  exercises: DraftExercise[]
  experimentId?: string | null
  benchmarkProtocolVersionId?: string | null
}

export function emptyDraftSet(setNumber: number, loadState: LoadState = 'external'): DraftSet {
  return {
    setNumber,
    setType: 'working',
    loadState,
    weightLb: '',
    reps: '',
    durationSec: '',
    leftReps: '',
    rightReps: '',
    leftDurationSec: '',
    rightDurationSec: '',
    distance: '',
    distanceUnit: 'mi',
    completed: null,
    notes: '',
    transcribedLoadState: loadState,
    transcribedWeightLb: '',
  }
}

function defaultExerciseLoadState(loadType: string | null | undefined): LoadState {
  return loadType === 'none' || loadType === 'bodyweight' ? 'bodyweight' : 'external'
}

export function draftFromTranscription(
  draft: {
    workoutDate: string
    durationMin: string
    effort: number | null
    painLevel: number | null
    bodyweightLb: string
    notes: string
    exercises: DraftExercise[]
  },
  template: WorkoutTemplate | null,
): WorkoutDraft {
  return {
    template,
    sessionType: 'programmed',
    sessionName: '',
    workoutDate: draft.workoutDate,
    durationMin: draft.durationMin,
    effort: draft.effort,
    painLevel: draft.painLevel,
    bodyweightLb: draft.bodyweightLb,
    notes: draft.notes,
    exercises: draft.exercises,
  }
}

export function draftFromTemplate(template: WorkoutTemplate, now = new Date()): WorkoutDraft {
  return {
    template,
    sessionType: 'programmed',
    sessionName: '',
    workoutDate: localIsoDate(now),
    durationMin: '',
    effort: null,
    painLevel: null,
    bodyweightLb: '',
    notes: '',
    exercises: template.exercises.map((slot) => ({
      exerciseDefinitionId: slot.exercise.id,
      slotId: slot.slotId,
      name: slot.exercise.name,
      measurementKind: slot.exercise.measurementKind,
      plannedSets: slot.plannedSets,
      prescription: slot.prescription,
      notes: '',
      sets: Array.from(
        { length: slot.plannedSets ?? 1 },
        (_, index) => emptyDraftSet(index + 1, defaultExerciseLoadState(slot.exercise.loadType)),
      ),
    })),
  }
}

export function addDraftSet(exercise: DraftExercise): DraftExercise {
  const nextNumber = exercise.sets.reduce((max, set) => Math.max(max, set.setNumber), 0) + 1
  return {
    ...exercise,
    sets: [...exercise.sets, emptyDraftSet(nextNumber, exercise.sets[0]?.loadState ?? 'external')],
  }
}

function parseOptionalPositive(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function validateWorkoutDraft(draft: WorkoutDraft): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  if (draft.workoutDate.trim() === '' || !isCalendarDate(draft.workoutDate)) {
    errors.push({ path: 'workoutDate', message: 'Date is required.' })
  }
  let performed = 0
  draft.exercises.forEach((exercise, exerciseIndex) => {
    const interpreted = interpretPaperSets(exercise.sets)
    performed += interpreted.filter((item) => !item.omitted).length
    errors.push(...validateInterpretedPaperSets(exerciseIndex, exercise.measurementKind, interpreted))
  })
  if (performed === 0) {
    errors.push({ path: 'exercises', message: 'Log at least one set.' })
  }
  return errors
}

export function buildManualWorkoutPayload(draft: WorkoutDraft): ManualWorkoutRequest {
  const errors = validateWorkoutDraft(draft)
  if (errors.length > 0) {
    throw new DraftValidationError(errors)
  }
  const exercises = draft.exercises.flatMap((exercise) => {
    const interpreted = interpretPaperSets(exercise.sets)
    const kept = interpreted.filter((item) => !item.omitted)
    if (kept.length === 0) {
      return []
    }
    return [
      {
        exerciseDefinitionId: exercise.exerciseDefinitionId,
        slotId: draft.sessionType === 'programmed' ? exercise.slotId : null,
        notes: exercise.notes.trim() === '' ? null : exercise.notes.trim(),
        sets: kept.map((item) =>
          draftSetToManualInput(item.set.setNumber, {
            ...item.set,
            loadState: resolvedLoadState(item.resolvedLoad),
            weightLb:
              resolvedWeightLb(item.resolvedLoad) == null ? '' : String(resolvedWeightLb(item.resolvedLoad)),
          }),
        ),
      },
    ]
  })

  const freeform = draft.sessionType !== 'programmed'
  return manualWorkoutRequestSchema.parse({
    workoutDate: draft.workoutDate,
    workoutTemplateId: freeform ? null : (draft.template?.id ?? draft.workoutTemplateId ?? null),
    sessionType: draft.sessionType,
    sessionName: freeform ? draft.sessionName : null,
    durationMin: parseOptionalPositive(draft.durationMin),
    effort: draft.effort,
    painLevel: draft.painLevel,
    bodyweightLb: parseOptionalPositive(draft.bodyweightLb),
    notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
    experimentId: draft.sessionType === 'experiment' ? (draft.experimentId ?? null) : null,
    benchmarkProtocolVersionId: draft.sessionType === 'experiment' ? (draft.benchmarkProtocolVersionId ?? null) : null,
    exercises,
  })
}

function numberField(value: number | null | undefined): string {
  return value == null ? '' : String(value)
}

export function draftForAdHocWorkout(now = new Date()): WorkoutDraft {
  return {
    template: null,
    workoutTemplateId: null,
    sessionType: 'ad_hoc',
    sessionName: '',
    workoutDate: localIsoDate(now),
    durationMin: '',
    effort: null,
    painLevel: null,
    bodyweightLb: '',
    notes: '',
    exercises: [],
  }
}

export function draftForExperimentWorkout(input: {
  experimentId?: string | null
  benchmarkProtocolVersionId?: string | null
  sessionName?: string
  now?: Date
}): WorkoutDraft {
  return {
    ...draftForAdHocWorkout(input.now),
    sessionType: 'experiment',
    sessionName: input.sessionName ?? '',
    experimentId: input.experimentId ?? null,
    benchmarkProtocolVersionId: input.benchmarkProtocolVersionId ?? null,
  }
}

export function draftExerciseFromDefinition(exercise: {
  id: string
  name: string
  measurementKind: MeasurementKind
  loadType?: string | null
}): DraftExercise {
  return {
    exerciseDefinitionId: exercise.id,
    slotId: null,
    name: exercise.name,
    measurementKind: exercise.measurementKind,
    plannedSets: null,
    prescription: { measurement: exercise.measurementKind },
    notes: '',
    sets: [emptyDraftSet(1, defaultExerciseLoadState(exercise.loadType))],
  }
}

export function draftFromSession(session: WorkoutSession, template: WorkoutTemplate | null): WorkoutDraft {
  return {
    template: session.sessionType === 'programmed' ? template : null,
    workoutTemplateId: session.sessionType === 'programmed' ? session.workoutTemplateId : null,
    sessionType: session.sessionType,
    sessionName: session.sessionName ?? '',
    workoutDate: session.workoutDate,
    durationMin: numberField(session.durationMin),
    effort: session.effort,
    painLevel: session.painLevel,
    bodyweightLb: session.bodyweightKg == null ? '' : String(Math.round(kilogramsToPounds(session.bodyweightKg) * 10) / 10),
    notes: session.notes ?? '',
    exercises: session.exercises.map((exercise) => ({
      exerciseDefinitionId: exercise.exerciseDefinitionId,
      slotId: exercise.slotId,
      name: exercise.exerciseName,
      measurementKind: template?.exercises.find((slot) => slot.slotId === exercise.slotId)?.exercise.measurementKind
        ?? exercise.measurementKind
        ?? (exercise.sets.some((set) => set.completed != null)
          ? 'completion'
          : exercise.sets.some((set) => set.distanceM != null && set.durationSec != null)
            ? 'distance_duration'
            : exercise.sets.some((set) => set.distanceM != null)
              ? 'distance'
              : exercise.sets.some((set) => set.leftDurationSec != null || set.rightDurationSec != null)
                ? 'duration_per_side'
                : exercise.sets.some((set) => set.leftReps != null || set.rightReps != null)
                  ? 'reps_per_side'
                  : exercise.sets.some((set) => set.durationSec != null)
                    ? 'duration'
                    : 'reps'),
      plannedSets: template?.exercises.find((slot) => slot.slotId === exercise.slotId)?.plannedSets ?? exercise.sets.length,
      prescription: template?.exercises.find((slot) => slot.slotId === exercise.slotId)?.prescription ?? { measurement: 'reps' },
      notes: exercise.notes ?? '',
      sets: exercise.sets.map((set) => ({
        setNumber: set.setNumber,
        setType: set.setType,
        loadState: set.loadState,
        weightLb: set.weightKg == null ? '' : String(Math.round(kilogramsToPounds(set.weightKg) * 10) / 10),
        reps: numberField(set.reps),
        durationSec: numberField(set.durationSec),
        leftReps: numberField(set.leftReps),
        rightReps: numberField(set.rightReps),
        leftDurationSec: numberField(set.leftDurationSec),
        rightDurationSec: numberField(set.rightDurationSec),
        distance: set.distanceM == null ? '' : String(Math.round(metersToMiles(set.distanceM) * 1000) / 1000),
        distanceUnit: 'mi',
        completed: set.completed ?? null,
        notes: set.notes ?? '',
        transcribedLoadState: set.loadState,
        transcribedWeightLb: set.weightKg == null ? '' : String(Math.round(kilogramsToPounds(set.weightKg) * 10) / 10),
      })),
    })),
  }
}

export function draftHasLoggedSets(draft: WorkoutDraft): boolean {
  return draft.exercises.some((exercise) => exercise.sets.some((set) => !isDraftSetUntouched(set)))
}

export type { LoadState }
