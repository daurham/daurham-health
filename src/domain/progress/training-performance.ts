import { supportsLoadedRepStrength } from './exercise-classification.js'
import {
  compareSetChronology,
  isCompletedWorkingSet,
  strengthRepsForSet,
  timedDurationSecForSet,
  evidenceFromSet,
} from './exercise-performance.js'
import { secondsPerMile, metersToMiles } from '../units.js'
import type { CanonicalEvidence, CanonicalSetRecord, ProgressExerciseDefinition } from './types.js'

export type TrainingPerformanceKind = 'reps' | 'duration' | 'distance' | 'pace' | 'skill'

export type TrainingPerformanceObservation = {
  kind: TrainingPerformanceKind
  exerciseId: string
  value: number
  unit: 'reps' | 'sec' | 'm' | 'sec/mi' | 'completion'
  date: string
  sourceSet: CanonicalSetRecord
  evidence: CanonicalEvidence
}

function positive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

export function repsPerformanceObservation(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation | null {
  if (!isCompletedWorkingSet(set) || supportsLoadedRepStrength(exercise)) return null
  if (exercise.measurementKind !== 'reps' && exercise.measurementKind !== 'reps_per_side') return null
  const value = strengthRepsForSet(set, exercise)
  if (value == null || value <= 0) return null
  return { kind: 'reps', exerciseId: exercise.id, value, unit: 'reps', date: set.sessionDate, sourceSet: set, evidence: evidenceFromSet(set) }
}

export function durationPerformanceObservation(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation | null {
  if (!isCompletedWorkingSet(set)) return null
  if (!['duration', 'duration_per_side', 'distance_duration'].includes(exercise.measurementKind)) return null
  const value = exercise.measurementKind === 'distance_duration'
    ? positive(set.durationSec)
    : timedDurationSecForSet(set, exercise)
  if (value == null) return null
  return { kind: 'duration', exerciseId: exercise.id, value, unit: 'sec', date: set.sessionDate, sourceSet: set, evidence: evidenceFromSet(set) }
}

export function distancePerformanceObservation(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation | null {
  if (!isCompletedWorkingSet(set) || !['distance', 'distance_duration'].includes(exercise.measurementKind)) return null
  const value = positive(set.distanceM)
  if (value == null) return null
  return { kind: 'distance', exerciseId: exercise.id, value, unit: 'm', date: set.sessionDate, sourceSet: set, evidence: evidenceFromSet(set) }
}

export function pacePerformanceObservation(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation | null {
  if (!isCompletedWorkingSet(set) || exercise.measurementKind !== 'distance_duration') return null
  const distanceM = positive(set.distanceM)
  const durationSec = positive(set.durationSec)
  if (distanceM == null || durationSec == null) return null
  const pace = secondsPerMile(distanceM, durationSec)
  if (pace == null) return null
  return {
    kind: 'pace', exerciseId: exercise.id, value: pace, unit: 'sec/mi', date: set.sessionDate, sourceSet: set,
    evidence: evidenceFromSet(set, { secondsPerMile: pace }),
  }
}

export function skillPerformanceObservation(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation | null {
  if (!isCompletedWorkingSet(set) || exercise.measurementKind !== 'completion' || set.completed == null) return null
  return {
    kind: 'skill', exerciseId: exercise.id, value: set.completed ? 1 : 0, unit: 'completion', date: set.sessionDate,
    sourceSet: set, evidence: evidenceFromSet(set),
  }
}

export function trainingPerformanceObservations(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): TrainingPerformanceObservation[] {
  return [...sets].sort(compareSetChronology).flatMap((set) => {
    const results = [
      repsPerformanceObservation(set, exercise),
      durationPerformanceObservation(set, exercise),
      distancePerformanceObservation(set, exercise),
      pacePerformanceObservation(set, exercise),
      skillPerformanceObservation(set, exercise),
    ]
    return results.filter((item): item is TrainingPerformanceObservation => item != null)
  })
}

export function bestTrainingPerformance(
  observations: readonly TrainingPerformanceObservation[],
  kind: TrainingPerformanceKind,
  options: { minDistanceM?: number | null } = {},
): TrainingPerformanceObservation | null {
  const eligible = observations.filter((item) => {
    if (item.kind !== kind) return false
    if (kind === 'pace' && options.minDistanceM != null) return (item.sourceSet.distanceM ?? 0) >= options.minDistanceM
    if (kind === 'skill') return item.value >= 1
    return true
  })
  if (eligible.length === 0) return null
  return [...eligible].sort((a,b) => {
    if (kind === 'pace') return a.value - b.value || compareSetChronology(a.sourceSet,b.sourceSet)
    return b.value - a.value || compareSetChronology(a.sourceSet,b.sourceSet)
  })[0] ?? null
}

export function displayDistanceMiles(distanceM: number): number {
  return metersToMiles(distanceM)
}
