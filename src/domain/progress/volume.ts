import { isCompletedWorkingSet, volumeRepsForSet } from './exercise-performance.js'
import { supportsLoadedRepStrength } from './exercise-classification.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from './types.js'

export function setExternalVolumeKg(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): number | null {
  if (!supportsLoadedRepStrength(exercise) || !isCompletedWorkingSet(set)) {
    return null
  }
  if (set.loadState !== 'external' || set.weightKg == null || !Number.isFinite(set.weightKg) || set.weightKg < 0) {
    return null
  }
  const reps = volumeRepsForSet(set, exercise)
  if (reps == null) {
    return null
  }
  return set.weightKg * reps
}

export function sessionExternalVolumeKg(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): number | null {
  if (!supportsLoadedRepStrength(exercise)) {
    return null
  }
  let total = 0
  let counted = 0
  for (const set of sets) {
    const volume = setExternalVolumeKg(set, exercise)
    if (volume == null) {
      continue
    }
    total += volume
    counted += 1
  }
  return counted === 0 ? null : total
}

export function periodExternalVolume(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): { kg: number; observations: number } {
  let kg = 0
  let observations = 0
  for (const set of sets) {
    const volume = setExternalVolumeKg(set, exercise)
    if (volume == null) {
      continue
    }
    kg += volume
    observations += 1
  }
  return { kg, observations }
}