import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { isPerSideExercise, supportsLoadedRepStrength, supportsTimedExternal } from './exercise-classification.js'
import type {
  AnalyzableTimedSet,
  AnalyzableWorkingSet,
  CanonicalEvidence,
  CanonicalSetRecord,
  EstimatedStrengthPoint,
  LatestPerformance,
  ProgressExerciseDefinition,
  SessionStrengthPoint,
} from './types.js'

export function compareSetChronology(left: CanonicalSetRecord, right: CanonicalSetRecord): number {
  if (left.sessionDate !== right.sessionDate) {
    return left.sessionDate < right.sessionDate ? -1 : 1
  }
  if (left.sessionCreatedAt !== right.sessionCreatedAt) {
    return left.sessionCreatedAt < right.sessionCreatedAt ? -1 : 1
  }
  if (left.sessionId !== right.sessionId) {
    return left.sessionId < right.sessionId ? -1 : 1
  }
  if (left.sessionExercisePosition !== right.sessionExercisePosition) {
    return left.sessionExercisePosition - right.sessionExercisePosition
  }
  if (left.setNumber !== right.setNumber) {
    return left.setNumber - right.setNumber
  }
  return left.setId < right.setId ? -1 : left.setId > right.setId ? 1 : 0
}

export function isCompletedWorkingSet(set: CanonicalSetRecord): boolean {
  return set.setType === 'working'
}

export function epleyEstimated1RmKg(loadKg: number, reps: number): number {
  return loadKg * (1 + reps / 30)
}

export function e1rmConfidence(reps: number): EstimatedStrengthPoint['confidence'] | null {
  if (!Number.isInteger(reps) || reps < 1) {
    return null
  }
  if (reps <= PROGRESS_ANALYTICS_CONFIG.e1rm.highConfidenceMaxReps) {
    return 'high'
  }
  if (reps <= PROGRESS_ANALYTICS_CONFIG.e1rm.lowConfidenceMaxReps) {
    return 'low'
  }
  return null
}

function positiveInt(value: number | null): number | null {
  if (value == null || !Number.isInteger(value) || value < 1) {
    return null
  }
  return value
}

/** Strength reps: bilateral `reps`, or min(left, right) when both sides are present. Never sum sides. */
export function strengthRepsForSet(set: CanonicalSetRecord, exercise: ProgressExerciseDefinition): number | null {
  if (isPerSideExercise(exercise)) {
    const left = positiveInt(set.leftReps)
    const right = positiveInt(set.rightReps)
    if (left == null || right == null) {
      return null
    }
    return Math.min(left, right)
  }
  return positiveInt(set.reps)
}

/**
 * Volume reps: bilateral `reps`, or the sum of performed side reps.
 * A missing side is omitted from the sum (not invented as zero work for the other side's
 * strength), because each logged side is independently completed work.
 */
export function volumeRepsForSet(set: CanonicalSetRecord, exercise: ProgressExerciseDefinition): number | null {
  if (isPerSideExercise(exercise)) {
    const left = positiveInt(set.leftReps)
    const right = positiveInt(set.rightReps)
    if (left == null && right == null) {
      return null
    }
    return (left ?? 0) + (right ?? 0)
  }
  return positiveInt(set.reps)
}

/** Timed duration: `durationSec`, or min(left, right) duration when both sides are present. */
export function timedDurationSecForSet(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): number | null {
  if (isPerSideExercise(exercise)) {
    const left = positiveInt(set.leftDurationSec)
    const right = positiveInt(set.rightDurationSec)
    if (left == null || right == null) {
      return null
    }
    return Math.min(left, right)
  }
  return positiveInt(set.durationSec)
}

function hasExternalLoad(set: CanonicalSetRecord): set is CanonicalSetRecord & { weightKg: number } {
  return (
    set.loadState === 'external' &&
    set.weightKg != null &&
    Number.isFinite(set.weightKg) &&
    set.weightKg >= 0
  )
}

export function asAnalyzableLoadedRepSet(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): AnalyzableWorkingSet | null {
  if (!supportsLoadedRepStrength(exercise)) {
    return null
  }
  if (!isCompletedWorkingSet(set) || !hasExternalLoad(set)) {
    return null
  }
  const reps = strengthRepsForSet(set, exercise)
  if (reps == null) {
    return null
  }
  return { ...set, weightKg: set.weightKg, reps }
}

export function asAnalyzableTimedSet(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): AnalyzableTimedSet | null {
  if (!supportsTimedExternal(exercise)) {
    return null
  }
  if (!isCompletedWorkingSet(set) || !hasExternalLoad(set)) {
    return null
  }
  const durationSec = timedDurationSecForSet(set, exercise)
  if (durationSec == null) {
    return null
  }
  return { ...set, weightKg: set.weightKg, durationSec }
}

export function estimatedStrengthForSet(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): EstimatedStrengthPoint | null {
  const analyzable = asAnalyzableLoadedRepSet(set, exercise)
  if (!analyzable) {
    return null
  }
  const confidence = e1rmConfidence(analyzable.reps)
  if (confidence == null) {
    return null
  }
  return {
    value: epleyEstimated1RmKg(analyzable.weightKg, analyzable.reps),
    formula: PROGRESS_ANALYTICS_CONFIG.e1rm.formula,
    confidence,
    sourceSet: analyzable,
  }
}

export function sessionStrengthPoint(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): SessionStrengthPoint | null {
  let best: EstimatedStrengthPoint | null = null
  for (const set of sets) {
    const estimate = estimatedStrengthForSet(set, exercise)
    if (!estimate || estimate.confidence !== 'high') {
      continue
    }
    if (
      best == null ||
      estimate.value > best.value ||
      (estimate.value === best.value && compareSetChronology(estimate.sourceSet, best.sourceSet) < 0)
    ) {
      best = estimate
    }
  }
  if (!best) {
    return null
  }
  return {
    sessionId: best.sourceSet.sessionId,
    sessionExerciseId: best.sourceSet.sessionExerciseId,
    exerciseId: best.sourceSet.exerciseId,
    date: best.sourceSet.sessionDate,
    estimated1RmKg: best.value,
    sourceSet: best.sourceSet,
  }
}

function latestFromSet(
  set: CanonicalSetRecord,
  estimated1RmKg: number | null,
): LatestPerformance {
  return {
    sessionId: set.sessionId,
    sessionExerciseId: set.sessionExerciseId,
    exerciseId: set.exerciseId,
    date: set.sessionDate,
    loadKg: set.weightKg ?? 0,
    reps: set.reps,
    durationSec: set.durationSec,
    estimated1RmKg,
    sourceSetId: set.setId,
    leftReps: set.leftReps,
    rightReps: set.rightReps,
  }
}

export function latestLoadedPerformance(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): LatestPerformance | null {
  const analyzable = [...sets]
    .map((set) => asAnalyzableLoadedRepSet(set, exercise))
    .filter((set): set is AnalyzableWorkingSet => set != null)
    .sort(compareSetChronology)
  if (analyzable.length === 0) {
    return null
  }
  const last = analyzable[analyzable.length - 1]!
  const sessionSets = sets.filter((set) => set.sessionId === last.sessionId)
  const strength = sessionStrengthPoint(sessionSets, exercise)
  const source = strength?.sourceSet ?? last
  return latestFromSet(source, strength?.estimated1RmKg ?? null)
}

export function latestTimedPerformance(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): LatestPerformance | null {
  const analyzable = [...sets]
    .map((set) => asAnalyzableTimedSet(set, exercise))
    .filter((set): set is AnalyzableTimedSet => set != null)
    .sort(compareSetChronology)
  if (analyzable.length === 0) {
    return null
  }
  const last = analyzable[analyzable.length - 1]!
  return {
    ...latestFromSet(last, null),
    reps: null,
    durationSec: last.durationSec,
  }
}

export type SetAnalyticsExclusion = {
  setId: string
  exerciseId: string
  reason: string
}

export function exclusionReasonForSet(
  set: CanonicalSetRecord,
  exercise: ProgressExerciseDefinition,
): string | null {
  if (!isCompletedWorkingSet(set)) {
    return 'not_working'
  }
  if (supportsLoadedRepStrength(exercise)) {
    if (!hasExternalLoad(set)) {
      return 'missing_external_load'
    }
    if (strengthRepsForSet(set, exercise) == null) {
      return isPerSideExercise(exercise) ? 'incomplete_unilateral_reps' : 'missing_reps'
    }
    return null
  }
  if (supportsTimedExternal(exercise)) {
    if (!hasExternalLoad(set)) {
      return 'missing_external_load'
    }
    if (timedDurationSecForSet(set, exercise) == null) {
      return isPerSideExercise(exercise) ? 'incomplete_unilateral_duration' : 'missing_duration'
    }
    return null
  }
  return `unsupported_performance_type:${exercise.performanceType}`
}

export function evidenceFromSet(set: CanonicalSetRecord, extra?: Partial<CanonicalEvidence>): CanonicalEvidence {
  return {
    domain: 'training',
    sessionId: set.sessionId,
    sessionExerciseId: set.sessionExerciseId,
    setId: set.setId,
    exerciseId: set.exerciseId,
    date: set.sessionDate,
    setNumber: set.setNumber,
    loadKg: set.weightKg,
    reps: set.reps,
    leftReps: set.leftReps,
    rightReps: set.rightReps,
    durationSec: set.durationSec,
    leftDurationSec: set.leftDurationSec,
    rightDurationSec: set.rightDurationSec,
    ...extra,
  }
}
