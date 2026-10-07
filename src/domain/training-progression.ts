import type { IntelligenceConfidence } from './intelligence/shared.js'

export const TRAINING_PROGRESSION_VERSION = 'training-progression-v1' as const

export type TrainingProgressionKind =
  | 'insufficient_evidence'
  | 'progressing'
  | 'stable'
  | 'stalled'
  | 'declining'
  | 'confounded'

export type TrainingSubstitutionRelation = 'same_exercise' | 'comparable_substitute' | 'similar_muscle_group'

export type TrainingProgressionSet = {
  setId: string
  sessionId: string
  date: string
  exerciseId: string
  exerciseName: string
  performanceType: string
  loadType: string
  movementPattern: string | null
  primaryMuscleGroup: string | null
  secondaryMuscleGroups: string[]
  setType: string
  completed: boolean | null
  weightKg: number | null
  reps: number | null
  leftReps: number | null
  rightReps: number | null
  durationSec: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
  distanceM: number | null
  bodyweightKg: number | null
  rir: number | null
  rpe: number | null
  failureKind: string | null
  leftFailureKind: string | null
  rightFailureKind: string | null
  sessionEffort: number | null
  limitationKind: string | null
}

export type TrainingProgressionExercise = {
  id: string
  name: string
  performanceType: string
  loadType: string
  movementPattern: string | null
  primaryMuscleGroup: string | null
  secondaryMuscleGroups: string[]
}

export type TrainingProgressionGoal = {
  id: string
  label: string
  kind: string
  exerciseId: string
}

export type TrainingExposure = {
  key: string
  label: string
  hardSets: number
  workingSets: number
}

export type TrainingSubstitute = {
  exerciseId: string
  name: string
  relation: TrainingSubstitutionRelation
  reason: string
}

export type TrainingProgressionSeries = {
  exerciseId: string
  exerciseName: string
  metric: 'e1rm_kg' | 'reps' | 'duration_sec' | 'distance_m' | 'completion'
  state: TrainingProgressionKind
  confidence: IntelligenceConfidence
  exposureCount: number
  recentValue: number | null
  priorValue: number | null
  changePct: number | null
  recentRelativeStrength: number | null
  recentAverageRir: number | null
  recentAverageRpe: number | null
  recentHardSets: number
  limitationKinds: string[]
  explanation: string
}

export type TrainingGoalRelationship = {
  goalId: string
  label: string
  kind: string
  exerciseId: string
  exerciseName: string
  progressionState: TrainingProgressionKind
  recentHardSets: number
  movementPattern: string | null
  primaryMuscleGroup: string | null
  substitutes: TrainingSubstitute[]
  preservationState: 'covered' | 'limited' | 'unknown'
  detail: string
}

export type TrainingProgressionOpportunity = {
  id: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  evidenceRefs: string[]
}

export type TrainingProgressionState = {
  version: typeof TRAINING_PROGRESSION_VERSION
  asOf: string
  window: { start: string; end: string }
  summary: string
  series: TrainingProgressionSeries[]
  movementExposure: TrainingExposure[]
  muscleExposure: TrainingExposure[]
  goalRelationships: TrainingGoalRelationship[]
  primaryOpportunity: TrainingProgressionOpportunity | null
}

export type BuildTrainingProgressionInput = {
  asOf: string
  sets: readonly TrainingProgressionSet[]
  exercises: readonly TrainingProgressionExercise[]
  goals: readonly TrainingProgressionGoal[]
}

type SessionPoint = {
  date: string
  value: number
  relativeStrength: number | null
  averageRir: number | null
  averageRpe: number | null
  hardSets: number
  limitationKinds: string[]
}

function numberMean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((a, b) => a - b)
  const mid = Math.floor(ordered.length / 2)
  return ordered.length % 2 === 0 ? (ordered[mid - 1]! + ordered[mid]!) / 2 : ordered[mid]!
}

function calendarDaysBetween(a: string, b: string): number {
  const left = Date.parse(a + 'T00:00:00Z')
  const right = Date.parse(b + 'T00:00:00Z')
  return Math.round((right - left) / 86_400_000)
}

function repsFor(set: TrainingProgressionSet): number | null {
  if (set.leftReps != null || set.rightReps != null) {
    const values = [set.leftReps, set.rightReps].filter((value): value is number => value != null)
    return values.length ? Math.min(...values) : null
  }
  return set.reps
}

function durationFor(set: TrainingProgressionSet): number | null {
  if (set.leftDurationSec != null || set.rightDurationSec != null) {
    const values = [set.leftDurationSec, set.rightDurationSec].filter((value): value is number => value != null)
    return values.length ? Math.min(...values) : null
  }
  return set.durationSec
}

function effectiveRir(set: TrainingProgressionSet): number | null {
  if (set.failureKind || set.leftFailureKind || set.rightFailureKind) return 0
  if (set.rir != null) return set.rir
  if (set.rpe != null) return Math.max(0, 10 - set.rpe)
  return null
}

function hardSet(set: TrainingProgressionSet): boolean {
  if (set.setType !== 'working' || set.completed === false) return false
  const rir = effectiveRir(set)
  return rir != null && rir <= 4
}

function metricFor(exercise: TrainingProgressionExercise): TrainingProgressionSeries['metric'] {
  if (exercise.performanceType === 'loaded_reps') return 'e1rm_kg'
  if (exercise.performanceType === 'timed') return 'duration_sec'
  if (exercise.performanceType === 'distance') return 'distance_m'
  if (exercise.performanceType === 'skill') return 'completion'
  return 'reps'
}

function performanceValue(set: TrainingProgressionSet, metric: TrainingProgressionSeries['metric']): number | null {
  if (set.completed === false || set.setType !== 'working') return null
  if (metric === 'e1rm_kg') {
    const reps = repsFor(set)
    if (set.weightKg == null || reps == null || reps < 1 || reps > 15) return null
    return set.weightKg * (1 + reps / 30)
  }
  if (metric === 'reps') return repsFor(set)
  if (metric === 'duration_sec') return durationFor(set)
  if (metric === 'distance_m') return set.distanceM
  return set.completed === true ? 1 : null
}

function equipmentCompatible(a: string, b: string): boolean {
  if (a === b) return true
  const freeWeights = new Set(['dumbbell', 'kettlebell', 'dumbbell_or_kettlebell'])
  return freeWeights.has(a) && freeWeights.has(b)
}

export function substitutionRelation(
  source: TrainingProgressionExercise,
  candidate: TrainingProgressionExercise,
): TrainingSubstitutionRelation | null {
  if (source.id === candidate.id) return 'same_exercise'
  if (
    source.movementPattern &&
    candidate.movementPattern === source.movementPattern &&
    source.primaryMuscleGroup &&
    candidate.primaryMuscleGroup === source.primaryMuscleGroup &&
    equipmentCompatible(source.loadType, candidate.loadType)
  ) return 'comparable_substitute'
  if (
    source.primaryMuscleGroup &&
    candidate.primaryMuscleGroup === source.primaryMuscleGroup
  ) return 'similar_muscle_group'
  return null
}

function sessionPoints(
  sets: readonly TrainingProgressionSet[],
  exercise: TrainingProgressionExercise,
): SessionPoint[] {
  const metric = metricFor(exercise)
  const bySession = new Map<string, TrainingProgressionSet[]>()
  for (const set of sets) {
    if (set.exerciseId !== exercise.id) continue
    const bucket = bySession.get(set.sessionId) ?? []
    bucket.push(set)
    bySession.set(set.sessionId, bucket)
  }
  const output: SessionPoint[] = []
  for (const bucket of bySession.values()) {
    const values = bucket.map((set) => performanceValue(set, metric)).filter((value): value is number => value != null)
    if (values.length === 0) continue
    const best = metric === 'duration_sec' && exercise.performanceType === 'distance'
      ? Math.min(...values)
      : Math.max(...values)
    const bodyweight = bucket.find((set) => set.bodyweightKg != null)?.bodyweightKg ?? null
    const rir = bucket.map(effectiveRir).filter((value): value is number => value != null)
    const rpe = bucket.map((set) => set.rpe).filter((value): value is number => value != null)
    output.push({
      date: bucket[0]!.date,
      value: best,
      relativeStrength: metric === 'e1rm_kg' && bodyweight && bodyweight > 0 ? best / bodyweight : null,
      averageRir: numberMean(rir),
      averageRpe: numberMean(rpe),
      hardSets: bucket.filter(hardSet).length,
      limitationKinds: [...new Set(bucket.map((set) => set.limitationKind).filter((value): value is string => Boolean(value)))],
    })
  }
  return output.sort((a, b) => a.date.localeCompare(b.date))
}

function classifySeries(points: readonly SessionPoint[]): Omit<TrainingProgressionSeries, 'exerciseId' | 'exerciseName' | 'metric'> {
  const recent = points.slice(-2)
  const prior = points.slice(-4, -2)
  const recentValue = median(recent.map((item) => item.value))
  const priorValue = median(prior.map((item) => item.value))
  const recentRir = numberMean(recent.map((item) => item.averageRir).filter((value): value is number => value != null))
  const priorRir = numberMean(prior.map((item) => item.averageRir).filter((value): value is number => value != null))
  const recentRpe = numberMean(recent.map((item) => item.averageRpe).filter((value): value is number => value != null))
  const priorRpe = numberMean(prior.map((item) => item.averageRpe).filter((value): value is number => value != null))
  const limitations = [...new Set(recent.flatMap((item) => item.limitationKinds))]
  const recentHardSets = recent.reduce((sum, item) => sum + item.hardSets, 0)
  const changePct =
    recentValue != null && priorValue != null && priorValue !== 0
      ? ((recentValue - priorValue) / Math.abs(priorValue)) * 100
      : null
  const span = points.length > 1 ? calendarDaysBetween(points[0]!.date, points[points.length - 1]!.date) : 0
  let state: TrainingProgressionKind = 'insufficient_evidence'
  let explanation = 'At least four comparable exercise exposures are needed before Health calls a progression trend.'
  if (points.length >= 4 && changePct != null) {
    const effortHarder =
      (recentRir != null && priorRir != null && recentRir <= priorRir - 1) ||
      (recentRpe != null && priorRpe != null && recentRpe >= priorRpe + 1)
    if (changePct >= 2.5) {
      state = 'progressing'
      explanation = 'Recent exact-exercise performance is above the prior comparable exposures.'
    } else if (changePct <= -2.5 && (effortHarder || limitations.length > 0)) {
      state = 'confounded'
      explanation = 'Performance is lower, but recent effort or a recorded session limitation makes a true decline uncertain.'
    } else if (changePct <= -2.5) {
      state = 'declining'
      explanation = 'Recent exact-exercise performance is below the prior comparable exposures without a recorded recovery or effort confounder.'
    } else if (span >= 14 && points.length >= 5) {
      state = 'stalled'
      explanation = 'Exact-exercise performance has stayed within a narrow band across repeated exposures for at least two weeks.'
    } else {
      state = 'stable'
      explanation = 'Performance is broadly stable; there is not yet enough duration to call this a stall.'
    }
  }
  return {
    state,
    confidence: points.length >= 6 && span >= 21 ? 'high' : points.length >= 4 ? 'moderate' : 'limited',
    exposureCount: points.length,
    recentValue,
    priorValue,
    changePct,
    recentRelativeStrength: median(recent.map((item) => item.relativeStrength).filter((value): value is number => value != null)),
    recentAverageRir: recentRir,
    recentAverageRpe: recentRpe,
    recentHardSets,
    limitationKinds: limitations,
    explanation,
  }
}

function exposure(
  sets: readonly TrainingProgressionSet[],
  kind: 'movement' | 'muscle',
): TrainingExposure[] {
  const rows = new Map<string, TrainingExposure>()
  const add = (key: string | null, label: string | null, hard: boolean) => {
    if (!key || !label) return
    const current = rows.get(key) ?? { key, label, hardSets: 0, workingSets: 0 }
    current.workingSets += 1
    if (hard) current.hardSets += 1
    rows.set(key, current)
  }
  for (const set of sets) {
    if (set.setType !== 'working' || set.completed === false) continue
    if (kind === 'movement') add(set.movementPattern, set.movementPattern, hardSet(set))
    else {
      add(set.primaryMuscleGroup, set.primaryMuscleGroup, hardSet(set))
      for (const secondary of set.secondaryMuscleGroups) add(secondary, secondary, false)
    }
  }
  return [...rows.values()].sort((a, b) => b.hardSets - a.hardSets || b.workingSets - a.workingSets || a.label.localeCompare(b.label))
}

function substitutesFor(
  source: TrainingProgressionExercise,
  exercises: readonly TrainingProgressionExercise[],
): TrainingSubstitute[] {
  return exercises.flatMap((candidate) => {
    const relation = substitutionRelation(source, candidate)
    if (!relation || relation === 'same_exercise') return []
    const reason =
      relation === 'comparable_substitute'
        ? 'Same movement pattern and primary muscle group with compatible equipment.'
        : 'Similar primary muscle group, but not equivalent enough to merge performance history.'
    return [{ exerciseId: candidate.id, name: candidate.name, relation, reason }]
  }).sort((a, b) => {
    const rank = (value: TrainingSubstitutionRelation) => value === 'comparable_substitute' ? 0 : 1
    return rank(a.relation) - rank(b.relation) || a.name.localeCompare(b.name)
  })
}

export function buildTrainingProgressionState(input: BuildTrainingProgressionInput): TrainingProgressionState {
  const exerciseById = new Map(input.exercises.map((item) => [item.id, item]))
  const series = input.exercises.flatMap((exercise) => {
    const points = sessionPoints(input.sets, exercise)
    if (points.length === 0) return []
    return [{
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      metric: metricFor(exercise),
      ...classifySeries(points),
    }]
  })
  const seriesByExercise = new Map(series.map((item) => [item.exerciseId, item]))
  const goalRelationships = input.goals.flatMap((goal) => {
    const exercise = exerciseById.get(goal.exerciseId)
    if (!exercise) return []
    const progression = seriesByExercise.get(goal.exerciseId)
    const recentHardSets = input.sets.filter((set) => set.exerciseId === goal.exerciseId && hardSet(set)).length
    const substitutes = substitutesFor(exercise, input.exercises).slice(0, 8)
    const preservationState: TrainingGoalRelationship['preservationState'] =
      recentHardSets >= 2 ? 'covered' : input.sets.some((set) =>
        substitutes.some((candidate) => candidate.relation === 'comparable_substitute' && candidate.exerciseId === set.exerciseId) && hardSet(set)
      ) ? 'limited' : 'unknown'
    return [{
      goalId: goal.id,
      label: goal.label,
      kind: goal.kind,
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      progressionState: progression?.state ?? 'insufficient_evidence',
      recentHardSets,
      movementPattern: exercise.movementPattern,
      primaryMuscleGroup: exercise.primaryMuscleGroup,
      substitutes,
      preservationState,
      detail:
        preservationState === 'covered'
          ? 'The exact goal exercise has recent hard-set exposure.'
          : preservationState === 'limited'
            ? 'A comparable substitute has recent hard-set exposure, which may preserve the movement but does not count as exact-exercise progress.'
            : 'Recent preservation exposure is not clear enough to judge.',
    }]
  })
  const prioritySeries = [...series]
    .filter((item) => item.state === 'declining' || item.state === 'stalled')
    .sort((a, b) => (a.state === 'declining' ? 0 : 1) - (b.state === 'declining' ? 0 : 1) || b.exposureCount - a.exposureCount)[0] ?? null
  const primaryOpportunity = prioritySeries
    ? {
        id: 'training-progression:' + prioritySeries.exerciseId,
        title: prioritySeries.state === 'declining'
          ? prioritySeries.exerciseName + ' performance is trending down'
          : prioritySeries.exerciseName + ' may be stalled',
        detail: prioritySeries.explanation,
        actionText: 'Review Training',
        detailPath: '/training',
        evidenceRefs: ['training:exercise:' + prioritySeries.exerciseId],
      }
    : null
  const progressing = series.filter((item) => item.state === 'progressing').length
  const uncertain = series.filter((item) => item.state === 'confounded').length
  const summary = primaryOpportunity
    ? primaryOpportunity.title + '.'
    : uncertain > 0
      ? String(uncertain) + ' exercise trend' + (uncertain === 1 ? ' is' : 's are') + ' confounded by effort or recovery context.'
      : progressing > 0
        ? String(progressing) + ' exercise trend' + (progressing === 1 ? ' is' : 's are') + ' progressing without a stronger Training concern.'
        : 'No strong Training progression change is established from the current exact-exercise evidence.'
  return {
    version: TRAINING_PROGRESSION_VERSION,
    asOf: input.asOf,
    window: { start: input.sets.map((item) => item.date).sort()[0] ?? input.asOf, end: input.asOf },
    summary,
    series,
    movementExposure: exposure(input.sets, 'movement'),
    muscleExposure: exposure(input.sets, 'muscle'),
    goalRelationships,
    primaryOpportunity,
  }
}
