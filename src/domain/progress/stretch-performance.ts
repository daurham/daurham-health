import { supportsLoadedRepStrength } from './exercise-classification.js'
import {
  compareSetChronology,
  estimatedStrengthForSet,
  evidenceFromSet,
  isCompletedWorkingSet,
  strengthRepsForSet,
  timedDurationSecForSet,
} from './exercise-performance.js'
import { addCalendarDays } from './dates.js'
import { isCalendarDate } from '../training.js'
import { kilogramsToPounds } from '../units.js'
import type { CanonicalEvidence, CanonicalSetRecord, ProgressExerciseDefinition } from './types.js'

export const STRETCH_STRATEGIES = ['strength_e1rm', 'reps', 'duration'] as const
export type StretchStrategy = (typeof STRETCH_STRATEGIES)[number]
export type StretchUnit = 'lb' | 'reps' | 'sec'

/** These records are loaded only from existing canonical Training tables. */
export type StretchSetRecord = CanonicalSetRecord & { sessionType: string }
export type StretchExerciseDefinition = ProgressExerciseDefinition & { loadType: string }

export type StretchPerformanceEvidence = CanonicalEvidence & {
  domain: 'training'
  sessionId: string
  sessionExerciseId: string
  setId: string
  exerciseId: string
  strategy: StretchStrategy
  value: number
  unit: StretchUnit
  estimated1RmKg?: number
  formula?: 'epley'
  confidence?: 'high'
  performanceType?: string
  analyticsLoadType?: string
  analyticsRepMode?: string
  exerciseLoadType?: string
}

export type StretchObservationSnapshot = {
  strategy: StretchStrategy
  exerciseId: string
  exerciseName: string
  measurementKind: string
  perSide: boolean
  date: string
  value: number
  unit: StretchUnit
  sourceCreatedAt: string
  evidence: StretchPerformanceEvidence
}

export type StretchPerformanceObservation = StretchObservationSnapshot & { sourceSet: StretchSetRecord }

export type StretchBaseline = {
  observation: StretchPerformanceObservation
  appearances: number
  latestDate: string
}

const CANONICAL_SESSION_TYPES = new Set(['programmed', 'ad_hoc', 'experiment'])

function perSideDefinition(exercise: StretchExerciseDefinition): ProgressExerciseDefinition {
  return {
    ...exercise,
    // Owner-created measurement is explicit even when classification has old defaults.
    analyticsRepMode: exercise.measurementKind.endsWith('_per_side') ? 'per_side' : 'standard',
  }
}

function isUnloaded(exercise: StretchExerciseDefinition, set: StretchSetRecord): boolean {
  return (
    (exercise.loadType === 'bodyweight' || exercise.loadType === 'none') &&
    (exercise.analyticsLoadType === 'bodyweight' || exercise.analyticsLoadType === 'none') &&
    (set.loadState === 'bodyweight' || set.loadState === 'none') &&
    (set.weightKg == null || set.weightKg === 0)
  )
}

/** One exact, currently existing working set is the observation authority. */
export function stretchObservations(
  sets: readonly StretchSetRecord[],
  exercises: readonly StretchExerciseDefinition[],
): StretchPerformanceObservation[] {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]))
  return [...sets].sort(compareSetChronology).flatMap((set) => {
    const exercise = byId.get(set.exerciseId)
    if (
      !exercise || !CANONICAL_SESSION_TYPES.has(set.sessionType) || !isCompletedWorkingSet(set) ||
      !isCalendarDate(set.sessionDate) || !Number.isFinite(Date.parse(set.sessionCreatedAt)) ||
      !set.setId || !set.sessionId || !set.sessionExerciseId
    ) return []

    let strategy: StretchStrategy
    let value: number | null
    let unit: StretchUnit
    let strengthEvidence: Partial<StretchPerformanceEvidence> = {}
    const isReps = exercise.measurementKind === 'reps' || exercise.measurementKind === 'reps_per_side'
    const isDuration = exercise.measurementKind === 'duration' || exercise.measurementKind === 'duration_per_side'
    if (supportsLoadedRepStrength(exercise) && isReps) {
      const estimate = estimatedStrengthForSet(set, exercise)
      if (!estimate || estimate.confidence !== 'high') return []
      strategy = 'strength_e1rm'
      value = kilogramsToPounds(estimate.value)
      unit = 'lb'
      strengthEvidence = {
        estimated1RmKg: estimate.value,
        formula: estimate.formula,
        confidence: 'high',
        strengthReps: estimate.sourceSet.reps,
      }
    } else {
      if (!isUnloaded(exercise, set)) return []
      if (isReps) {
        if (exercise.performanceType !== 'other' && exercise.performanceType !== 'bodyweight_reps') return []
        strategy = 'reps'
        value = strengthRepsForSet(set, perSideDefinition(exercise))
        unit = 'reps'
      } else if (isDuration) {
        if (exercise.performanceType !== 'other' && exercise.performanceType !== 'timed') return []
        strategy = 'duration'
        value = timedDurationSecForSet(set, perSideDefinition(exercise))
        unit = 'sec'
      } else return []
    }
    if (value == null || !Number.isFinite(value) || value <= 0) return []
    const evidence: StretchPerformanceEvidence = {
      ...evidenceFromSet(set),
      domain: 'training',
      sessionId: set.sessionId,
      sessionExerciseId: set.sessionExerciseId,
      setId: set.setId,
      exerciseId: set.exerciseId,
      strategy,
      value,
      unit,
      ...strengthEvidence,
    }
    return [{
      strategy, exerciseId: exercise.id, exerciseName: exercise.name,
      measurementKind: exercise.measurementKind, perSide: exercise.measurementKind.endsWith('_per_side'),
      date: set.sessionDate, value, unit, sourceCreatedAt: set.sessionCreatedAt,
      sourceSet: set, evidence,
    }]
  })
}

export function stretchObservationSnapshot(observation: StretchPerformanceObservation): StretchObservationSnapshot {
  return {
    strategy: observation.strategy, exerciseId: observation.exerciseId, exerciseName: observation.exerciseName,
    measurementKind: observation.measurementKind, perSide: observation.perSide,
    date: observation.date, value: observation.value, unit: observation.unit,
    sourceCreatedAt: observation.sourceCreatedAt, evidence: observation.evidence,
  }
}

function bestObservation(observations: readonly StretchPerformanceObservation[]): StretchPerformanceObservation | null {
  return [...observations].sort((left, right) =>
    right.value - left.value || compareSetChronology(left.sourceSet, right.sourceSet),
  )[0] ?? null
}

/** A qualifying appearance uses the existing session + session-exercise identity. */
export function stretchBaselines(
  observations: readonly StretchPerformanceObservation[],
  offeredOn: string,
): StretchBaseline[] {
  const windowStart = addCalendarDays(offeredOn, -42)
  const latestAllowed = addCalendarDays(offeredOn, -21)
  const groups = new Map<string, StretchPerformanceObservation[]>()
  for (const observation of observations) {
    if (observation.date < windowStart || observation.date > offeredOn) continue
    const key = `${observation.strategy}:${observation.exerciseId}`
    const group = groups.get(key) ?? []
    group.push(observation)
    groups.set(key, group)
  }
  return [...groups].sort(([left], [right]) => left.localeCompare(right)).flatMap(([, group]) => {
    const appearances = new Set(group.map((item) => `${item.evidence.sessionId}:${item.evidence.sessionExerciseId}`)).size
    const latestDate = group.map((item) => item.date).sort().slice(-1)[0]!
    const observation = bestObservation(group)
    if (appearances < 2 || latestDate < latestAllowed || !observation) return []
    return [{ observation, appearances, latestDate }]
  })
}

export type StretchAttemptWindow = {
  exerciseId: string
  strategy: StretchStrategy
  acceptedAt: string
  acceptedOn: string
  expiresOn: string
  asOf: string
  now?: string
}

/**
 * Training has a session creation timestamp, but no performed instant per set. Both
 * the canonical workout date and session creation must lie inside the accepted window.
 */
export function bestStretchAttempt(
  observations: readonly StretchPerformanceObservation[],
  window: StretchAttemptWindow,
): StretchPerformanceObservation | null {
  const acceptedInstant = Date.parse(window.acceptedAt)
  const nowInstant = window.now == null ? Infinity : Date.parse(window.now)
  // Phoenix is UTC-7 throughout the year; the next midnight is an exclusive bound.
  const challengeEnd = Date.parse(`${addCalendarDays(window.expiresOn, 1)}T00:00:00-07:00`)
  if (!Number.isFinite(acceptedInstant) || Number.isNaN(nowInstant)) return null
  return bestObservation(observations.filter((item) => {
    const created = Date.parse(item.sourceCreatedAt)
    return item.exerciseId === window.exerciseId && item.strategy === window.strategy &&
      item.date >= window.acceptedOn && item.date <= window.expiresOn && item.date <= window.asOf &&
      created > acceptedInstant && created < challengeEnd && created <= nowInstant
  }))
}

/** Offers fail closed on baseline deletion or correction; accepted snapshots never rebase. */
export function hasStretchBaselineSource(
  observations: readonly StretchPerformanceObservation[],
  baseline: StretchObservationSnapshot,
): boolean {
  return observations.some((item) => item.exerciseId === baseline.exerciseId && item.strategy === baseline.strategy &&
    item.evidence.sessionId === baseline.evidence.sessionId &&
    item.evidence.sessionExerciseId === baseline.evidence.sessionExerciseId &&
    item.evidence.setId === baseline.evidence.setId &&
    item.value === baseline.value && item.date === baseline.date &&
    item.sourceCreatedAt === baseline.sourceCreatedAt &&
    item.measurementKind === baseline.measurementKind && item.perSide === baseline.perSide &&
    (['loadKg', 'reps', 'strengthReps', 'durationSec', 'leftReps', 'rightReps', 'leftDurationSec', 'rightDurationSec',
      'performanceType', 'analyticsLoadType', 'analyticsRepMode', 'exerciseLoadType'] as const)
      .every((field) => (item.evidence[field] ?? null) === (baseline.evidence[field] ?? null)),
  )
}
