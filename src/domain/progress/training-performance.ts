import { isPerSideExercise, supportsLoadedRepStrength } from './exercise-classification.js'
import {
  compareSetChronology,
  evidenceFromSet,
  isCompletedWorkingSet,
  strengthRepsForSet,
  timedDurationSecForSet,
} from './exercise-performance.js'
import type { CanonicalEvidence, CanonicalSetRecord, ProgressExerciseDefinition } from './types.js'
import { metersToMiles, secondsPerMile } from '../units.js'

export const TRAINING_PERFORMANCE_KINDS = ['reps', 'duration', 'distance', 'pace', 'skill'] as const
export type TrainingPerformanceKind = (typeof TRAINING_PERFORMANCE_KINDS)[number]
export type TrainingPerformanceUnit = 'reps' | 'sec' | 'mi' | 'sec/mi' | 'completion'

export type TrainingPerformanceExercise = ProgressExerciseDefinition & {
  loadType?: string | null
}

export type TrainingPerformanceObservation = {
  kind: TrainingPerformanceKind
  exerciseId: string
  exerciseName: string
  date: string
  value: number
  unit: TrainingPerformanceUnit
  distanceM: number | null
  durationSec: number | null
  completed: boolean | null
  perSide: boolean
  sourceSet: CanonicalSetRecord
  evidence: CanonicalEvidence
}

function positiveNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function unloadedRepsMeaningful(exercise: TrainingPerformanceExercise): boolean {
  if (supportsLoadedRepStrength(exercise)) return false
  if (exercise.measurementKind !== 'reps' && exercise.measurementKind !== 'reps_per_side') return false
  const unloaded = (exercise.loadType === 'bodyweight' || exercise.loadType === 'none') &&
    (exercise.analyticsLoadType === 'bodyweight' || exercise.analyticsLoadType === 'none')
  return unloaded && (exercise.performanceType === 'bodyweight_reps' || exercise.performanceType === 'other')
}

export function trainingPerformanceObservations(
  sets: readonly CanonicalSetRecord[],
  exercises: readonly TrainingPerformanceExercise[],
): TrainingPerformanceObservation[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  const observations: TrainingPerformanceObservation[] = []
  for (const set of [...sets].sort(compareSetChronology)) {
    if (!isCompletedWorkingSet(set)) continue
    const exercise = byId.get(set.exerciseId)
    if (!exercise) continue
    const perSide = isPerSideExercise(exercise) ||
      exercise.measurementKind === 'reps_per_side' ||
      exercise.measurementKind === 'duration_per_side'

    if (unloadedRepsMeaningful(exercise)) {
      const reps = strengthRepsForSet(set, {
        ...exercise,
        analyticsRepMode: perSide ? 'per_side' : 'standard',
      })
      if (reps != null) {
        observations.push({
          kind: 'reps',
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          date: set.sessionDate,
          value: reps,
          unit: 'reps',
          distanceM: null,
          durationSec: null,
          completed: null,
          perSide,
          sourceSet: set,
          evidence: evidenceFromSet(set),
        })
      }
    }

    if (
      exercise.measurementKind === 'duration' ||
      exercise.measurementKind === 'duration_per_side' ||
      exercise.measurementKind === 'distance_duration'
    ) {
      const duration = timedDurationSecForSet(set, {
        ...exercise,
        analyticsRepMode: perSide ? 'per_side' : 'standard',
      })
      if (duration != null) {
        observations.push({
          kind: 'duration',
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          date: set.sessionDate,
          value: duration,
          unit: 'sec',
          distanceM: positiveNumber(set.distanceM) ?? null,
          durationSec: duration,
          completed: null,
          perSide,
          sourceSet: set,
          evidence: evidenceFromSet(set),
        })
      }
    }

    if (exercise.measurementKind === 'distance' || exercise.measurementKind === 'distance_duration') {
      const distanceM = positiveNumber(set.distanceM)
      if (distanceM != null) {
        observations.push({
          kind: 'distance',
          exerciseId: exercise.id,
          exerciseName: exercise.name,
          date: set.sessionDate,
          value: metersToMiles(distanceM),
          unit: 'mi',
          distanceM,
          durationSec: positiveNumber(set.durationSec),
          completed: null,
          perSide: false,
          sourceSet: set,
          evidence: evidenceFromSet(set),
        })
        if (exercise.measurementKind === 'distance_duration') {
          const durationSec = positiveNumber(set.durationSec)
          const pace = durationSec == null ? null : secondsPerMile(distanceM, durationSec)
          if (pace != null) {
            observations.push({
              kind: 'pace',
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              date: set.sessionDate,
              value: pace,
              unit: 'sec/mi',
              distanceM,
              durationSec,
              completed: null,
              perSide: false,
              sourceSet: set,
              evidence: evidenceFromSet(set, { distanceM, durationSec }),
            })
          }
        }
      }
    }

    if (exercise.measurementKind === 'completion' && set.completed != null) {
      observations.push({
        kind: 'skill',
        exerciseId: exercise.id,
        exerciseName: exercise.name,
        date: set.sessionDate,
        value: set.completed ? 1 : 0,
        unit: 'completion',
        distanceM: null,
        durationSec: null,
        completed: set.completed,
        perSide: false,
        sourceSet: set,
        evidence: evidenceFromSet(set, { completed: set.completed }),
      })
    }
  }
  return observations
}

function better(
  kind: TrainingPerformanceKind,
  left: TrainingPerformanceObservation,
  right: TrainingPerformanceObservation,
): boolean {
  if (kind === 'pace') {
    return left.value < right.value ||
      (left.value === right.value && compareSetChronology(left.sourceSet, right.sourceSet) < 0)
  }
  if (kind === 'skill') {
    if (left.value !== right.value) return left.value > right.value
    return compareSetChronology(left.sourceSet, right.sourceSet) < 0
  }
  return left.value > right.value ||
    (left.value === right.value && compareSetChronology(left.sourceSet, right.sourceSet) < 0)
}

export function bestTrainingPerformance(
  observations: readonly TrainingPerformanceObservation[],
  input: { exerciseId: string; kind: TrainingPerformanceKind; minDistanceM?: number | null },
): TrainingPerformanceObservation | null {
  let best: TrainingPerformanceObservation | null = null
  for (const observation of observations) {
    if (observation.exerciseId !== input.exerciseId || observation.kind !== input.kind) continue
    if (input.kind === 'pace' && input.minDistanceM != null) {
      if (observation.distanceM == null || observation.distanceM + Number.EPSILON < input.minDistanceM) continue
    }
    if (input.kind === 'skill' && observation.completed !== true) continue
    if (!best || better(input.kind, observation, best)) best = observation
  }
  return best
}

export function latestTrainingPerformance(
  observations: readonly TrainingPerformanceObservation[],
  input: { exerciseId: string; kind: TrainingPerformanceKind },
): TrainingPerformanceObservation | null {
  return observations
    .filter((observation) => observation.exerciseId === input.exerciseId && observation.kind === input.kind)
    .sort((left, right) => compareSetChronology(left.sourceSet, right.sourceSet))
    .slice(-1)[0] ?? null
}
