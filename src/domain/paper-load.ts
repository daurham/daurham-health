import type { LoadState, MeasurementKind, ManualWorkoutRequestValues } from './training.js'

export type ReviewFieldError = {
  path: string
  message: string
}

export type PaperLoad =
  | { kind: 'external'; weightLb: number }
  | { kind: 'bodyweight' }

export type PaperLoadSource = 'transcribed' | 'edited' | 'inherited' | 'missing'

export type PaperSetFields = {
  loadState: LoadState
  weightLb: string | number | null | undefined
  reps: string | number | null | undefined
  durationSec: string | number | null | undefined
  leftReps: string | number | null | undefined
  rightReps: string | number | null | undefined
  leftDurationSec: string | number | null | undefined
  rightDurationSec: string | number | null | undefined
  notes?: string | number | null | undefined
  transcribedLoadState?: LoadState
  transcribedWeightLb?: string
}

function asTrimmed(value: string | number | null | undefined): string {
  if (value == null) {
    return ''
  }
  return String(value).trim()
}

function parseWeightLb(value: string | number | null | undefined): number | null {
  const trimmed = asTrimmed(value)
  if (trimmed === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

export function explicitPaperLoad(set: Pick<PaperSetFields, 'loadState' | 'weightLb'>): PaperLoad | null {
  if (set.loadState === 'bodyweight') {
    return { kind: 'bodyweight' }
  }
  if (set.loadState === 'external') {
    const weightLb = parseWeightLb(set.weightLb)
    if (weightLb != null) {
      return { kind: 'external', weightLb }
    }
  }
  return null
}

export function paperLoadsEqual(left: PaperLoad | null, right: PaperLoad | null): boolean {
  if (left == null || right == null) {
    return left == null && right == null
  }
  if (left.kind === 'bodyweight' || right.kind === 'bodyweight') {
    return left.kind === 'bodyweight' && right.kind === 'bodyweight'
  }
  return left.weightLb === right.weightLb
}

export function paperSetHasPerformance(set: PaperSetFields): boolean {
  return (
    asTrimmed(set.reps) !== '' ||
    asTrimmed(set.durationSec) !== '' ||
    asTrimmed(set.leftReps) !== '' ||
    asTrimmed(set.rightReps) !== '' ||
    asTrimmed(set.leftDurationSec) !== '' ||
    asTrimmed(set.rightDurationSec) !== ''
  )
}

export function isUnperformedPaperSet(set: PaperSetFields): boolean {
  return explicitPaperLoad(set) == null && !paperSetHasPerformance(set)
}

function transcribedPaperLoad(set: PaperSetFields): PaperLoad | null {
  if (set.transcribedLoadState == null && (set.transcribedWeightLb == null || set.transcribedWeightLb === '')) {
    return null
  }
  return explicitPaperLoad({
    loadState: set.transcribedLoadState ?? 'external',
    weightLb: set.transcribedWeightLb ?? '',
  })
}

export type InterpretedPaperSet<T extends PaperSetFields> = {
  set: T
  omitted: boolean
  source: PaperLoadSource
  resolvedLoad: PaperLoad | null
}

export function interpretPaperSets<T extends PaperSetFields>(sets: readonly T[]): InterpretedPaperSet<T>[] {
  let carried: PaperLoad | null = null
  return sets.map((set) => {
    if (isUnperformedPaperSet(set)) {
      return { set, omitted: true, source: 'transcribed' as const, resolvedLoad: null }
    }
    if (set.loadState === 'unknown') {
      const transcribedUnknown = set.transcribedLoadState === 'unknown'
      return {
        set,
        omitted: false,
        source: transcribedUnknown ? 'transcribed' : 'edited',
        resolvedLoad: null,
      }
    }
    const explicit = explicitPaperLoad(set)
    if (explicit) {
      carried = explicit
      const transcribed = transcribedPaperLoad(set)
      const source: PaperLoadSource = paperLoadsEqual(explicit, transcribed) ? 'transcribed' : 'edited'
      return { set, omitted: false, source, resolvedLoad: explicit }
    }
    if (carried) {
      return { set, omitted: false, source: 'inherited', resolvedLoad: carried }
    }
    return { set, omitted: false, source: 'missing', resolvedLoad: null }
  })
}

export function resolvedLoadState(load: PaperLoad | null): LoadState {
  if (load == null) {
    return 'unknown'
  }
  return load.kind === 'bodyweight' ? 'bodyweight' : 'external'
}

export function resolvedWeightLb(load: PaperLoad | null): number | null {
  return load?.kind === 'external' ? load.weightLb : null
}

function measurementField(kind: MeasurementKind): 'reps' | 'durationSec' | 'leftReps' | 'leftDurationSec' {
  if (kind === 'duration') {
    return 'durationSec'
  }
  if (kind === 'reps_per_side') {
    return 'leftReps'
  }
  if (kind === 'duration_per_side') {
    return 'leftDurationSec'
  }
  return 'reps'
}

function measurementRequiredMessage(kind: MeasurementKind): string {
  if (kind === 'duration' || kind === 'duration_per_side') {
    return 'Time required for this completed set.'
  }
  return 'Reps required for this completed set.'
}

export function paperSetFieldPath(exerciseIndex: number, setIndex: number, field: string): string {
  return `exercises.${exerciseIndex}.sets.${setIndex}.${field}`
}

export function validateInterpretedPaperSets<T extends PaperSetFields>(
  exerciseIndex: number,
  measurementKind: MeasurementKind,
  interpreted: readonly InterpretedPaperSet<T>[],
): ReviewFieldError[] {
  const errors: ReviewFieldError[] = []
  interpreted.forEach((item, setIndex) => {
    if (item.omitted) {
      return
    }
    if (item.resolvedLoad == null) {
      errors.push({
        path: paperSetFieldPath(exerciseIndex, setIndex, 'weightLb'),
        message: 'Load required — no previous load exists to inherit.',
      })
    }
    if (!paperSetHasPerformance(item.set)) {
      errors.push({
        path: paperSetFieldPath(exerciseIndex, setIndex, measurementField(measurementKind)),
        message: measurementRequiredMessage(measurementKind),
      })
    }
  })
  return errors
}

export function fieldErrorCountSummary(count: number): string {
  if (count === 1) {
    return '1 field needs attention'
  }
  return `${count} fields need attention`
}

export function measurementKindFromPaperSet(set: PaperSetFields): MeasurementKind {
  if (asTrimmed(set.leftDurationSec) !== '' || asTrimmed(set.rightDurationSec) !== '') {
    return 'duration_per_side'
  }
  if (asTrimmed(set.durationSec) !== '') {
    return 'duration'
  }
  if (asTrimmed(set.leftReps) !== '' || asTrimmed(set.rightReps) !== '') {
    return 'reps_per_side'
  }
  return 'reps'
}

export function fieldErrorsForPaperExercises(
  exercises: ReadonlyArray<{ measurementKind?: MeasurementKind; sets: readonly PaperSetFields[] }>,
): ReviewFieldError[] {
  return exercises.flatMap((exercise, exerciseIndex) => {
    const interpreted = interpretPaperSets(exercise.sets)
    const sample = interpreted.find((item) => !item.omitted)?.set ?? exercise.sets[0]
    const kind = exercise.measurementKind ?? (sample ? measurementKindFromPaperSet(sample) : 'reps')
    return validateInterpretedPaperSets(exerciseIndex, kind, interpreted)
  })
}

export function applyPaperInheritanceToManualRequest(
  request: ManualWorkoutRequestValues,
): ManualWorkoutRequestValues {
  return {
    ...request,
    exercises: request.exercises.flatMap((exercise) => {
      const interpreted = interpretPaperSets(
        exercise.sets.map((set) => ({
          loadState: set.loadState,
          weightLb: set.weightLb,
          reps: set.reps,
          durationSec: set.durationSec,
          leftReps: set.leftReps,
          rightReps: set.rightReps,
          leftDurationSec: set.leftDurationSec,
          rightDurationSec: set.rightDurationSec,
          notes: set.notes,
        })),
      )
      const kept = interpreted.flatMap((item, index) => {
        if (item.omitted) {
          return []
        }
        const original = exercise.sets[index]
        if (!original) {
          return []
        }
        return [
          {
            ...original,
            loadState: resolvedLoadState(item.resolvedLoad),
            weightLb: resolvedWeightLb(item.resolvedLoad),
          },
        ]
      })
      if (kept.length === 0) {
        return []
      }
      return [{ ...exercise, sets: kept }]
    }),
  }
}
