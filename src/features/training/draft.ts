import {
  draftSetToManualInput,
  isDraftSetUntouched,
  manualWorkoutRequestSchema,
  omitUntouchedDraftSets,
  type DraftSetFields,
  type LoadState,
  type ManualWorkoutRequest,
  type MeasurementKind,
  type TemplatePrescription,
  type WorkoutTemplate,
} from '@/domain/training'
import { localIsoDate } from './format'

export type DraftSet = DraftSetFields & {
  setNumber: number
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
  workoutDate: string
  durationMin: string
  effort: number | null
  painLevel: number | null
  bodyweightLb: string
  notes: string
  exercises: DraftExercise[]
}

export function emptyDraftSet(setNumber: number): DraftSet {
  return {
    setNumber,
    loadState: 'external',
    weightLb: '',
    reps: '',
    durationSec: '',
    leftReps: '',
    rightReps: '',
    leftDurationSec: '',
    rightDurationSec: '',
    notes: '',
  }
}

export function draftFromTemplate(template: WorkoutTemplate, now = new Date()): WorkoutDraft {
  return {
    template,
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
      sets: Array.from({ length: slot.plannedSets ?? 1 }, (_, index) => emptyDraftSet(index + 1)),
    })),
  }
}

export function addDraftSet(exercise: DraftExercise): DraftExercise {
  const nextNumber = exercise.sets.reduce((max, set) => Math.max(max, set.setNumber), 0) + 1
  return { ...exercise, sets: [...exercise.sets, emptyDraftSet(nextNumber)] }
}

function parseOptionalPositive(value: string): number | null {
  const trimmed = value.trim()
  if (trimmed === '') {
    return null
  }
  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function buildManualWorkoutPayload(draft: WorkoutDraft): ManualWorkoutRequest {
  const exercises = draft.exercises.flatMap((exercise) => {
    const kept = omitUntouchedDraftSets(exercise.sets)
    if (kept.length === 0) {
      return []
    }
    return [
      {
        exerciseDefinitionId: exercise.exerciseDefinitionId,
        slotId: exercise.slotId,
        notes: exercise.notes.trim() === '' ? null : exercise.notes.trim(),
        sets: kept.map((set) => draftSetToManualInput(set.setNumber, set)),
      },
    ]
  })

  return manualWorkoutRequestSchema.parse({
    workoutDate: draft.workoutDate,
    workoutTemplateId: draft.template?.id ?? null,
    durationMin: parseOptionalPositive(draft.durationMin),
    effort: draft.effort,
    painLevel: draft.painLevel,
    bodyweightLb: parseOptionalPositive(draft.bodyweightLb),
    notes: draft.notes.trim() === '' ? null : draft.notes.trim(),
    exercises,
  })
}

export function draftHasLoggedSets(draft: WorkoutDraft): boolean {
  return draft.exercises.some((exercise) => exercise.sets.some((set) => !isDraftSetUntouched(set)))
}

export type { LoadState }
