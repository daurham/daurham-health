import { ACTIVITY_METRICS } from './activity/config.js'
import { MANUAL_BODY_METRICS } from './body-manual.js'
import { volumeRepsForSet, timedDurationSecForSet } from './progress/exercise-performance.js'
import type { CanonicalSetRecord, ProgressExerciseDefinition } from './progress/types.js'
import { LAB_NUTRITION_METRICS, LAB_SLEEP_METRICS, LAB_TRAINING_MEASURES, type LabTrainingMeasure } from './lab.js'

/**
 * Training measure semantics for Benchmark Results.
 *
 * Qualifying sets are `set_type = working`. Warmup, drop, and other sets are omitted.
 * A working set with no performed value is omitted. Absence is not zero.
 *
 * `total_reps` sums `volumeRepsForSet` for reps and reps_per_side exercises.
 * `largest_set_reps` is the maximum of those same values.
 * `working_sets` counts qualifying sets that have a performed value for the exercise family.
 * `duration` sums `timedDurationSecForSet` and is stored in seconds. That is the B1 duration
 * selector: total performed duration of the working sets. Duration families only.
 *
 * These reuse the canonical Training helpers. Strength-analytics exclusions are not applied.
 * A measurement family that does not fit the selector is `unsupported`, not converted.
 */

export const EVIDENCE_KINDS = ['training_session', 'body_metric', 'nutrition_day', 'activity_day', 'sleep_night'] as const
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number]

export const RESULT_VALUE_KINDS = ['observed', 'derived'] as const
export type ResultValueKind = (typeof RESULT_VALUE_KINDS)[number]

const ACTIVITY_UNITS = {
  steps_count: 'count',
  active_energy_kcal: 'kcal',
  exercise_minutes: 'minutes',
  resting_heart_rate_bpm: 'bpm',
} as const

const NUTRITION_UNITS = {
  calories: 'kcal',
  protein: 'g',
  carbs: 'g',
  fat: 'g',
} as const

const ACTIVITY_COLUMNS = {
  steps_count: 'stepsCount',
  active_energy_kcal: 'activeEnergyKcal',
  exercise_minutes: 'exerciseMinutes',
  resting_heart_rate_bpm: 'restingHeartRateBpm',
} as const

export type EvidencePiece = {
  evidenceKind: EvidenceKind
  evidenceRef: Record<string, unknown>
  evidenceSnapshot: Record<string, unknown>
  observationDate: string
}

export type TrainingSetEvidence = {
  setId: string
  setNumber: number
  setType: string
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
}

export type TrainingSessionEvidence = {
  sessionId: string
  workoutDate: string
  sessionType: string
  sessionName: string | null
  experimentId: string | null
  benchmarkProtocolVersionId: string | null
  exerciseDefinitionId: string
  exerciseName: string
  measurementKind: string
  analyticsRepMode: 'standard' | 'per_side'
  sets: TrainingSetEvidence[]
}

export type BodyMetricEvidence = {
  measurementId: string
  measurementSessionId: string
  metricKey: string
  value: number
  unit: string
  valueKind: string
  calendarDate: string
}

export type NutritionEntryEvidence = {
  entryId: string
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

export type NutritionDayEvidence = {
  logDate: string
  entries: NutritionEntryEvidence[]
}

export type ActivityDayEvidence = {
  summaryId: string
  summaryDate: string
  timezone: string
  stepsCount: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  restingHeartRateBpm: number | null
}

export type SleepNightEvidence = {
  sleepDate: string
  timezone: string
  logicalSourceKey: string
  sourceName: string
  totalSleepMinutes: number | null
  observationStatus: string
  analysisEligible: boolean
}

export type EvidencePool = {
  training: TrainingSessionEvidence[] | 'unselected'
  body: BodyMetricEvidence[] | 'unselected'
  nutrition: NutritionDayEvidence | 'unselected' | 'absent'
  activity: ActivityDayEvidence | 'unselected' | 'absent'
  sleep: SleepNightEvidence | 'unselected' | 'absent'
}

export type OutcomeRequirement = {
  id: string
  role: string
  requirementKind: string
  selector: Record<string, string>
  label: string
}

export type EvaluationCandidate = {
  id: string
  label: string
  resultDate: string
}

export type TrainingSource = {
  sessionId: string
  sessionType: string
  benchmarkProtocolVersionId: string | null
  experimentId: string | null
}

export type Evaluation =
  | {
      status: 'available'
      value: number
      unit: string
      valueKind: ResultValueKind
      resultDate: string
      evidence: EvidencePiece[]
      training?: TrainingSource
    }
  | { status: 'missing'; reason: string }
  | { status: 'ambiguous'; reason: string; candidates: EvaluationCandidate[] }
  | { status: 'unsupported'; reason: string }

export function roundResultNumber(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000
}

export function canonicalNumber(value: number): string {
  const rounded = roundResultNumber(value)
  if (!Number.isFinite(rounded)) {
    throw new Error('Result value must be finite.')
  }
  return rounded.toFixed(6).replace(/\.?0+$/, '') || '0'
}

export function evaluateOutcome(
  requirement: OutcomeRequirement,
  pool: EvidencePool,
  selectionId?: string,
): Evaluation {
  switch (requirement.requirementKind) {
    case 'training_measure':
      return evaluateTraining(requirement, pool.training, selectionId)
    case 'body_metric':
      return evaluateBody(requirement, pool.body, selectionId)
    case 'nutrition_metric':
      return evaluateNutrition(requirement, pool.nutrition)
    case 'activity_metric':
      return evaluateActivity(requirement, pool.activity)
    case 'sleep_metric':
      return evaluateSleep(requirement, pool.sleep)
    default:
      return { status: 'unsupported', reason: 'This requirement is not a Benchmark Result value.' }
  }
}

function evaluateTraining(
  requirement: OutcomeRequirement,
  sessions: TrainingSessionEvidence[] | 'unselected',
  selectionId: string | undefined,
): Evaluation {
  const measure = requirement.selector.measure
  const exerciseDefinitionId = requirement.selector.exerciseDefinitionId
  if (!measure || !(LAB_TRAINING_MEASURES as readonly string[]).includes(measure) || !exerciseDefinitionId) {
    return { status: 'unsupported', reason: 'Unsupported training measure.' }
  }
  if (sessions === 'unselected') {
    return { status: 'ambiguous', reason: 'Choose the workout that supplied this result.', candidates: [] }
  }
  const matching = sessions.filter((session) => session.exerciseDefinitionId === exerciseDefinitionId)
  const chosen = chooseOne(
    matching.map((session) => ({
      id: session.sessionId,
      label: trainingLabel(session),
      resultDate: session.workoutDate,
      session,
    })),
    selectionId,
    'Choose the workout that supplied this result.',
  )
  if (chosen.status !== 'chosen') {
    return chosen
  }
  return measureSession(measure as LabTrainingMeasure, chosen.item.session)
}

function measureSession(measure: LabTrainingMeasure, session: TrainingSessionEvidence): Evaluation {
  const exercise = exerciseShape(session)
  const family = measurementFamily(session.measurementKind)
  if (!family) {
    return { status: 'unsupported', reason: 'This exercise measurement is not supported.' }
  }
  if ((measure === 'total_reps' || measure === 'largest_set_reps') && family !== 'reps') {
    return { status: 'unsupported', reason: 'Reps are not the measurement for this exercise.' }
  }
  if (measure === 'duration' && family !== 'duration') {
    return { status: 'unsupported', reason: 'Duration is not the measurement for this exercise.' }
  }
  const performed = qualifyingSets(session, exercise, family)
  if (performed.length === 0) {
    return { status: 'missing', reason: 'No qualifying working set was recorded.' }
  }
  const training: TrainingSource = {
    sessionId: session.sessionId,
    sessionType: session.sessionType,
    benchmarkProtocolVersionId: session.benchmarkProtocolVersionId,
    experimentId: session.experimentId,
  }
  const evidence = trainingEvidence(session, performed, family)
  if (measure === 'working_sets') {
    return available(performed.length, 'sets', 'derived', session.workoutDate, evidence, training)
  }
  if (measure === 'total_reps') {
    const total = performed.reduce((sum, set) => sum + (set.reps ?? 0), 0)
    return available(total, 'reps', 'derived', session.workoutDate, evidence, training)
  }
  if (measure === 'largest_set_reps') {
    const largest = Math.max(...performed.map((set) => set.reps ?? 0))
    return available(largest, 'reps', 'derived', session.workoutDate, evidence, training)
  }
  const total = performed.reduce((sum, set) => sum + (set.durationSec ?? 0), 0)
  return available(total, 'seconds', 'derived', session.workoutDate, evidence, training)
}

function evaluateBody(
  requirement: OutcomeRequirement,
  metrics: BodyMetricEvidence[] | 'unselected',
  selectionId: string | undefined,
): Evaluation {
  const metricKey = requirement.selector.metricKey
  const definition = MANUAL_BODY_METRICS.find((item) => item.key === metricKey)
  if (!metricKey || !definition) {
    return { status: 'unsupported', reason: 'Unknown body metric.' }
  }
  if (metrics === 'unselected') {
    return { status: 'ambiguous', reason: 'Choose the measurement that supplied this result.', candidates: [] }
  }
  const matching = metrics.filter((metric) => metric.metricKey === metricKey)
  const chosen = chooseOne(
    matching.map((metric) => ({
      id: metric.measurementId,
      label: `${metric.calendarDate} · ${definition.label}`,
      resultDate: metric.calendarDate,
      metric,
    })),
    selectionId,
    'Choose the measurement that supplied this result.',
  )
  if (chosen.status !== 'chosen') {
    return chosen
  }
  const metric = chosen.item.metric
  if (!Number.isFinite(metric.value)) {
    return { status: 'missing', reason: 'That measurement has no numeric value.' }
  }
  if (metric.unit !== definition.canonicalUnit) {
    return { status: 'unsupported', reason: 'Stored body unit does not match the canonical unit.' }
  }
  return available(metric.value, definition.canonicalUnit, 'observed', metric.calendarDate, [
    {
      evidenceKind: 'body_metric',
      observationDate: metric.calendarDate,
      evidenceRef: {
        measurementSessionId: metric.measurementSessionId,
        measurementId: metric.measurementId,
      },
      evidenceSnapshot: {
        metricKey: metric.metricKey,
        value: roundResultNumber(metric.value),
        unit: metric.unit,
        valueKind: metric.valueKind,
      },
    },
  ])
}

function evaluateNutrition(
  requirement: OutcomeRequirement,
  day: NutritionDayEvidence | 'unselected' | 'absent',
): Evaluation {
  const metricKey = requirement.selector.metricKey
  if (!metricKey || !(LAB_NUTRITION_METRICS as readonly string[]).includes(metricKey)) {
    return { status: 'unsupported', reason: 'Unknown nutrition metric.' }
  }
  if (day === 'unselected') {
    return { status: 'ambiguous', reason: 'Choose the date for this result.', candidates: [] }
  }
  if (day === 'absent' || day.entries.length === 0) {
    return { status: 'missing', reason: 'No nutrition was logged that day.' }
  }
  const field = metricKey as keyof typeof NUTRITION_UNITS
  const contributing = day.entries.flatMap((entry) => {
    const value = entry[field]
    if (value == null || !Number.isFinite(value)) {
      return []
    }
    return [{ entryId: entry.entryId, value: roundResultNumber(value) }]
  })
  if (contributing.length === 0) {
    return { status: 'missing', reason: `No ${metricKey} was recorded that day.` }
  }
  const total = roundResultNumber(contributing.reduce((sum, entry) => sum + entry.value, 0))
  const entryIds = contributing.map((entry) => entry.entryId).sort()
  return available(total, NUTRITION_UNITS[field], 'derived', day.logDate, [
    {
      evidenceKind: 'nutrition_day',
      observationDate: day.logDate,
      evidenceRef: { logDate: day.logDate, entryIds },
      evidenceSnapshot: { metricKey, entries: contributing.sort((left, right) => left.entryId.localeCompare(right.entryId)) },
    },
  ])
}

function evaluateActivity(
  requirement: OutcomeRequirement,
  day: ActivityDayEvidence | 'unselected' | 'absent',
): Evaluation {
  const metricKey = requirement.selector.metricKey
  if (!metricKey || !(ACTIVITY_METRICS as readonly string[]).includes(metricKey)) {
    return { status: 'unsupported', reason: 'Unknown activity metric.' }
  }
  if (day === 'unselected') {
    return { status: 'ambiguous', reason: 'Choose the date for this result.', candidates: [] }
  }
  if (day === 'absent') {
    return { status: 'missing', reason: 'No activity summary was recorded that day.' }
  }
  const column = ACTIVITY_COLUMNS[metricKey as keyof typeof ACTIVITY_COLUMNS]
  const value = day[column]
  if (value == null || !Number.isFinite(value)) {
    return { status: 'missing', reason: 'That activity metric was not recorded.' }
  }
  const unit = ACTIVITY_UNITS[metricKey as keyof typeof ACTIVITY_UNITS]
  return available(value, unit, 'observed', day.summaryDate, [
    {
      evidenceKind: 'activity_day',
      observationDate: day.summaryDate,
      evidenceRef: {
        summaryId: day.summaryId,
        summaryDate: day.summaryDate,
        timezone: day.timezone,
        metricKey,
      },
      evidenceSnapshot: { metricKey, value: roundResultNumber(value), unit, timezone: day.timezone },
    },
  ])
}

function evaluateSleep(
  requirement: OutcomeRequirement,
  night: SleepNightEvidence | 'unselected' | 'absent',
): Evaluation {
  const metricKey = requirement.selector.metricKey
  if (!metricKey || !(LAB_SLEEP_METRICS as readonly string[]).includes(metricKey)) {
    return { status: 'unsupported', reason: 'Unknown sleep metric.' }
  }
  if (night === 'unselected') {
    return { status: 'ambiguous', reason: 'Choose the date for this result.', candidates: [] }
  }
  if (night === 'absent') {
    return { status: 'missing', reason: 'No sleep night was recorded for that date.' }
  }
  if (!night.analysisEligible || night.observationStatus !== 'analysis_eligible' || night.totalSleepMinutes == null || !Number.isFinite(night.totalSleepMinutes)) {
    return { status: 'missing', reason: 'Sleep that night is not complete enough to use.' }
  }
  return available(night.totalSleepMinutes, 'minutes', 'observed', night.sleepDate, [
    {
      evidenceKind: 'sleep_night',
      observationDate: night.sleepDate,
      evidenceRef: {
        sleepDate: night.sleepDate,
        timezone: night.timezone,
        logicalSourceKey: night.logicalSourceKey,
        metricKey,
      },
      evidenceSnapshot: {
        metricKey,
        totalSleepMinutes: roundResultNumber(night.totalSleepMinutes),
        observationStatus: night.observationStatus,
        logicalSourceKey: night.logicalSourceKey,
        sourceName: night.sourceName,
        timezone: night.timezone,
      },
    },
  ])
}

function available(
  value: number,
  unit: string,
  valueKind: ResultValueKind,
  resultDate: string,
  evidence: EvidencePiece[],
  training?: TrainingSource,
): Evaluation {
  return {
    status: 'available',
    value: roundResultNumber(value),
    unit,
    valueKind,
    resultDate,
    evidence,
    training,
  }
}

function qualifyingSets(
  session: TrainingSessionEvidence,
  exercise: ProgressExerciseDefinition,
  family: 'reps' | 'duration',
): Array<{ setId: string; setNumber: number; reps: number | null; durationSec: number | null }> {
  const performed = []
  for (const set of session.sets) {
    if (set.setType !== 'working') {
      continue
    }
    const record = asSet(set, session)
    const reps = family === 'reps' ? volumeRepsForSet(record, exercise) : null
    const durationSec = family === 'duration' ? timedDurationSecForSet(record, exercise) : null
    if (family === 'reps' && reps == null) {
      continue
    }
    if (family === 'duration' && durationSec == null) {
      continue
    }
    performed.push({ setId: set.setId, setNumber: set.setNumber, reps, durationSec })
  }
  return performed.sort((left, right) => left.setNumber - right.setNumber || left.setId.localeCompare(right.setId))
}

function trainingEvidence(
  session: TrainingSessionEvidence,
  sets: Array<{ setId: string; setNumber: number; reps: number | null; durationSec: number | null }>,
  family: 'reps' | 'duration',
): EvidencePiece[] {
  const snapshotSets = sets.map((set) =>
    family === 'reps'
      ? { setId: set.setId, reps: set.reps }
      : { setId: set.setId, durationSec: set.durationSec },
  )
  return [
    {
      evidenceKind: 'training_session',
      observationDate: session.workoutDate,
      evidenceRef: {
        sessionId: session.sessionId,
        exerciseDefinitionId: session.exerciseDefinitionId,
        setIds: sets.map((set) => set.setId).sort(),
      },
      evidenceSnapshot: {
        sessionDate: session.workoutDate,
        sessionType: session.sessionType,
        exerciseName: session.exerciseName,
        sets: snapshotSets,
      },
    },
  ]
}

function asSet(set: TrainingSetEvidence, session: TrainingSessionEvidence): CanonicalSetRecord {
  return {
    setId: set.setId,
    sessionId: session.sessionId,
    sessionExerciseId: session.sessionId,
    exerciseId: session.exerciseDefinitionId,
    sessionDate: session.workoutDate,
    sessionCreatedAt: session.workoutDate,
    sessionExercisePosition: 1,
    setNumber: set.setNumber,
    setType: set.setType,
    loadState: 'bodyweight',
    weightKg: null,
    reps: set.reps,
    durationSec: set.durationSec,
    leftReps: set.leftReps,
    rightReps: set.rightReps,
    leftDurationSec: set.leftDurationSec,
    rightDurationSec: set.rightDurationSec,
  }
}

function exerciseShape(session: TrainingSessionEvidence): ProgressExerciseDefinition {
  const perSide = session.analyticsRepMode === 'per_side' || session.measurementKind.endsWith('_per_side')
  const timed = session.measurementKind === 'duration' || session.measurementKind === 'duration_per_side'
  return {
    id: session.exerciseDefinitionId,
    name: session.exerciseName,
    externalId: null,
    performanceType: timed ? 'timed' : 'loaded_reps',
    analyticsLoadType: 'bodyweight',
    analyticsRepMode: perSide ? 'per_side' : 'standard',
    measurementKind: session.measurementKind,
    unilateral: perSide,
  }
}

function measurementFamily(kind: string): 'reps' | 'duration' | null {
  if (kind === 'reps' || kind === 'reps_per_side') {
    return 'reps'
  }
  if (kind === 'duration' || kind === 'duration_per_side') {
    return 'duration'
  }
  return null
}

function trainingLabel(session: TrainingSessionEvidence): string {
  const name = session.sessionName?.trim() || session.exerciseName
  return `${session.workoutDate} · ${name}`
}

function chooseOne<T extends { id: string; label: string; resultDate: string }>(
  items: T[],
  selectionId: string | undefined,
  ambiguousReason: string,
): { status: 'chosen'; item: T } | Exclude<Evaluation, { status: 'available' }> {
  if (selectionId) {
    const selected = items.find((item) => item.id === selectionId)
    if (!selected) {
      return { status: 'missing', reason: 'The selected evidence was not found.' }
    }
    return { status: 'chosen', item: selected }
  }
  if (items.length === 0) {
    return { status: 'missing', reason: 'No canonical observation was found.' }
  }
  if (items.length > 1) {
    return {
      status: 'ambiguous',
      reason: ambiguousReason,
      candidates: items.map((item) => ({ id: item.id, label: item.label, resultDate: item.resultDate })),
    }
  }
  const only = items[0]
  if (!only) {
    return { status: 'missing', reason: 'No canonical observation was found.' }
  }
  return { status: 'chosen', item: only }
}
