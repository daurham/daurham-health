import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { addCalendarDays, calendarDaysBetween, inclusiveDayCount } from './dates.js'
import { bodyWeightTrend } from './body-trend.js'
import { trainingConsistency } from './consistency.js'
import { supportsLoadedRepStrength, supportsTimedExternal } from './exercise-classification.js'
import {
  asAnalyzableLoadedRepSet,
  asAnalyzableTimedSet,
  compareSetChronology,
  sessionStrengthPoint,
} from './exercise-performance.js'
import { expandsFrontier, expandsTimedFrontier } from './frontier.js'
import { dateInInclusiveRange } from './periods.js'
import { performanceBestsForExercise } from './prs.js'
import { percentChange } from './statistics.js'
import { isCalendarDate } from '../training.js'
import {
  availableMetric,
  insufficientMetric,
  notApplicableMetric,
  type BodyObservation,
  type CanonicalEvidence,
  type CanonicalSetRecord,
  type LatestPerformance,
  type MetricResult,
  type ProgressExerciseDefinition,
  type ProgressWorkoutSummary,
} from './types.js'
import { periodExternalVolume } from './volume.js'
import type { ProgressCheckpoint } from './checkpoints.js'
import type { ProgressCanonicalInput } from './overview.js'

export type ComparePeriod = {
  start: string
  end: string
  dayCount: number
}

export type CompareCountValue = {
  value: number
  perWeek: number
}

export type CompareDelta = {
  absolute: number
  percentChange: number | null
}

export type CompareSides<T> = {
  a: MetricResult<T>
  b: MetricResult<T>
  change: MetricResult<CompareDelta>
}

export type ComparePerformed = {
  sessionId: string
  sessionExerciseId: string
  setId: string
  date: string
  loadKg: number
  reps: number | null
  durationSec: number | null
  estimated1RmKg: number | null
  leftReps: number | null
  rightReps: number | null
}

export type CompareExerciseSide = {
  appearances: number
  workingSets: number
  bestPerformed: ComparePerformed | null
  estimatedStrengthKg: number | null
  volumeKg: number | null
  performanceBestCount: number
  frontierExpansionCount: number
}

export type CompareExercise = {
  exerciseId: string
  name: string
  performanceType: ProgressExerciseDefinition['performanceType']
  a: CompareExerciseSide
  b: CompareExerciseSide
  estimatedStrengthChangePercent: number | null
  timedChange: 'heavier_equal_duration' | 'longer_equal_load' | 'changed' | null
  evidence: CanonicalEvidence[]
}

export type CompareBodyMetric = {
  key: string
  unit: string
  aStart: BodyObservation | null
  aEnd: BodyObservation | null
  bStart: BodyObservation | null
  bEnd: BodyObservation | null
  change: MetricResult<CompareDelta>
}

export type CompareFinding = {
  kind: 'exercise_strength_change' | 'weight_change' | 'training_frequency_change' | 'exercise_performance_change'
  exerciseId?: string
  before?: number
  after?: number
  change?: number
  changePercent?: number | null
  beforePerWeek?: number
  afterPerWeek?: number
  evidence: CanonicalEvidence[]
}

export type ProgressCompare = {
  mode: 'range' | 'since_checkpoint'
  periodA: ComparePeriod
  periodB: ComparePeriod
  checkpoint: ProgressCheckpoint | null
  training: {
    workoutCount: CompareSides<{ value: number }>
    workoutsPerWeek: CompareSides<{ value: number }>
    workingSetCount: CompareSides<{ value: number }>
    externalVolumeKg: CompareSides<{ value: number }>
    performanceBestCount: CompareSides<{ value: number }>
  }
  body: {
    weight: CompareBodyMetric & {
      trendA: ReturnType<typeof bodyWeightTrend>
      trendB: ReturnType<typeof bodyWeightTrend>
    }
    metrics: CompareBodyMetric[]
  }
  exercises: CompareExercise[]
  findings: CompareFinding[]
}

export function comparePeriod(start: string, end: string): ComparePeriod {
  if (!isCalendarDate(start) || !isCalendarDate(end)) {
    throw new Error('Compare dates must be YYYY-MM-DD')
  }
  if (start > end) {
    throw new Error('Compare start must be on or before end')
  }
  return { start, end, dayCount: inclusiveDayCount(start, end) }
}

function inRange(date: string, period: ComparePeriod): boolean {
  return dateInInclusiveRange(date, period.start, period.end)
}

function changeFromNumbers(before: number | null, after: number | null): MetricResult<CompareDelta> {
  if (before == null || after == null) {
    return insufficientMetric(before == null && after == null ? 0 : 1, 2)
  }
  return availableMetric(
    { absolute: after - before, percentChange: percentChange(after, before) },
    2,
  )
}

function sidesFromCounts(a: number | null, b: number | null, aObs: number, bObs: number): CompareSides<{ value: number }> {
  return {
    a: a == null ? notApplicableMetric(aObs) : availableMetric({ value: a }, aObs),
    b: b == null ? notApplicableMetric(bObs) : availableMetric({ value: b }, bObs),
    change: changeFromNumbers(a, b),
  }
}

function workoutsPerWeekForPeriod(
  period: ComparePeriod,
  workoutsPerWeek: number,
  workoutCount: number,
): MetricResult<{ value: number }> {
  const minDays = PROGRESS_ANALYTICS_CONFIG.compare.workoutsPerWeekMinDays
  if (period.dayCount < minDays) {
    return insufficientMetric(period.dayCount, minDays)
  }
  return availableMetric({ value: workoutsPerWeek }, workoutCount)
}

function workoutsPerWeekSides(
  a: MetricResult<{ value: number }>,
  b: MetricResult<{ value: number }>,
): CompareSides<{ value: number }> {
  const change =
    a.status === 'available' && b.status === 'available'
      ? changeFromNumbers(a.value.value, b.value.value)
      : a.status === 'not_applicable' || b.status === 'not_applicable'
        ? notApplicableMetric(0)
        : insufficientMetric(
            (a.status === 'available' ? 1 : 0) + (b.status === 'available' ? 1 : 0),
            2,
          )
  return { a, b, change }
}

function volumeSide(kg: number, observations: number): MetricResult<{ value: number }> {
  if (observations === 0) {
    return insufficientMetric(0, 1)
  }
  return availableMetric({ value: kg }, observations)
}

function groupAppearances(sets: readonly CanonicalSetRecord[]): CanonicalSetRecord[][] {
  const groups = new Map<string, CanonicalSetRecord[]>()
  const order: string[] = []
  for (const set of [...sets].sort(compareSetChronology)) {
    const key = `${set.sessionId}:${set.sessionExerciseId}`
    const existing = groups.get(key)
    if (existing) {
      existing.push(set)
    } else {
      groups.set(key, [set])
      order.push(key)
    }
  }
  return order.map((key) => groups.get(key)!)
}

function compareObservations(left: BodyObservation, right: BodyObservation): number {
  if (left.calendarDate !== right.calendarDate) {
    return left.calendarDate < right.calendarDate ? -1 : 1
  }
  if (left.measuredAt !== right.measuredAt) {
    return left.measuredAt < right.measuredAt ? -1 : 1
  }
  return left.measurementId < right.measurementId ? -1 : left.measurementId > right.measurementId ? 1 : 0
}

function observationsForKey(observations: readonly BodyObservation[], key: string): BodyObservation[] {
  return observations.filter((item) => item.key === key)
}

function inPeriodObservations(
  observations: readonly BodyObservation[],
  period: ComparePeriod,
): BodyObservation[] {
  return observations.filter((item) => inRange(item.calendarDate, period))
}

function nearestInPeriod(
  observations: readonly BodyObservation[],
  period: ComparePeriod,
  target: string,
  tie: 'earlier' | 'later',
): BodyObservation | null {
  const pool = inPeriodObservations(observations, period)
  if (pool.length === 0) {
    return null
  }
  return [...pool].sort((left, right) => {
    const leftDistance = Math.abs(calendarDaysBetween(left.calendarDate, target))
    const rightDistance = Math.abs(calendarDaysBetween(right.calendarDate, target))
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    const chronology = compareObservations(left, right)
    return tie === 'earlier' ? chronology : -chronology
  })[0]!
}

export function nearestBodyObservationWithinDays(
  observations: readonly BodyObservation[],
  key: string,
  date: string,
  maxDays: number,
): BodyObservation | null {
  const qualifying = observationsForKey(observations, key).filter(
    (item) => Math.abs(calendarDaysBetween(item.calendarDate, date)) <= maxDays,
  )
  if (qualifying.length === 0) {
    return null
  }
  return [...qualifying].sort((left, right) => {
    const leftDistance = Math.abs(calendarDaysBetween(left.calendarDate, date))
    const rightDistance = Math.abs(calendarDaysBetween(right.calendarDate, date))
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance
    }
    return compareObservations(left, right)
  })[0]!
}

export function latestExerciseAppearanceOnOrBefore(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
  onOrBefore: string,
  lookbackDays: number,
): CanonicalSetRecord[] | null {
  const lookbackStart = addCalendarDays(onOrBefore, -lookbackDays)
  const window = sets.filter(
    (set) => set.exerciseId === exercise.id && set.sessionDate >= lookbackStart && set.sessionDate <= onOrBefore,
  )
  const appearances = groupAppearances(window)
  if (appearances.length === 0) {
    return null
  }
  const last = appearances[appearances.length - 1]!
  const analyzable = supportsTimedExternal(exercise)
    ? last.filter((set) => asAnalyzableTimedSet(set, exercise))
    : last.filter((set) => asAnalyzableLoadedRepSet(set, exercise))
  return analyzable.length > 0 ? last : null
}

function latestAppearanceAfter(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
  afterAppearance: readonly CanonicalSetRecord[] | null,
  rangeStart: string,
  rangeEnd: string,
): CanonicalSetRecord[] | null {
  const window = sets.filter(
    (set) =>
      set.exerciseId === exercise.id && set.sessionDate >= rangeStart && set.sessionDate <= rangeEnd,
  )
  const appearances = groupAppearances(window)
  const later =
    afterAppearance && afterAppearance.length > 0
      ? appearances.filter(
          (appearance) =>
            compareSetChronology(appearance[0]!, afterAppearance[afterAppearance.length - 1]!) > 0,
        )
      : appearances
  if (later.length === 0) {
    return null
  }
  const last = later[later.length - 1]!
  const analyzable = supportsTimedExternal(exercise)
    ? last.filter((set) => asAnalyzableTimedSet(set, exercise))
    : last.filter((set) => asAnalyzableLoadedRepSet(set, exercise))
  return analyzable.length > 0 ? last : null
}

function bestLoadedPerformed(sets: readonly CanonicalSetRecord[], exercise: ProgressExerciseDefinition): ComparePerformed | null {
  const analyzable = sets
    .map((set) => asAnalyzableLoadedRepSet(set, exercise))
    .filter((set): set is NonNullable<typeof set> => set != null)
  if (analyzable.length === 0) {
    return null
  }
  const best = [...analyzable].sort((left, right) => {
    if (left.weightKg !== right.weightKg) {
      return right.weightKg - left.weightKg
    }
    if (left.reps !== right.reps) {
      return right.reps - left.reps
    }
    return -compareSetChronology(left, right)
  })[0]!
  const strength = sessionStrengthPoint(sets.filter((set) => set.sessionId === best.sessionId), exercise)
  return {
    sessionId: best.sessionId,
    sessionExerciseId: best.sessionExerciseId,
    setId: best.setId,
    date: best.sessionDate,
    loadKg: best.weightKg,
    reps: best.reps,
    durationSec: null,
    estimated1RmKg: strength?.estimated1RmKg ?? null,
    leftReps: best.leftReps,
    rightReps: best.rightReps,
  }
}

function bestTimedPerformed(sets: readonly CanonicalSetRecord[], exercise: ProgressExerciseDefinition): ComparePerformed | null {
  const analyzable = sets
    .map((set) => asAnalyzableTimedSet(set, exercise))
    .filter((set): set is NonNullable<typeof set> => set != null)
  if (analyzable.length === 0) {
    return null
  }
  const best = [...analyzable].sort((left, right) => {
    if (left.weightKg !== right.weightKg) {
      return right.weightKg - left.weightKg
    }
    if (left.durationSec !== right.durationSec) {
      return right.durationSec - left.durationSec
    }
    return -compareSetChronology(left, right)
  })[0]!
  return {
    sessionId: best.sessionId,
    sessionExerciseId: best.sessionExerciseId,
    setId: best.setId,
    date: best.sessionDate,
    loadKg: best.weightKg,
    reps: null,
    durationSec: best.durationSec,
    estimated1RmKg: null,
    leftReps: best.leftReps,
    rightReps: best.rightReps,
  }
}

function frontierExpansionsInPeriod(
  allSets: readonly CanonicalSetRecord[],
  periodSets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): number {
  if (supportsLoadedRepStrength(exercise)) {
    const previous = allSets
      .filter((set) => set.sessionDate < (periodSets[0]?.sessionDate ?? ''))
      .flatMap((set) => {
        const item = asAnalyzableLoadedRepSet(set, exercise)
        return item ? [item] : []
      })
    let count = 0
    const seen = [...previous]
    for (const set of [...periodSets].sort(compareSetChronology)) {
      const candidate = asAnalyzableLoadedRepSet(set, exercise)
      if (!candidate) {
        continue
      }
      if (expandsFrontier(candidate, seen)) {
        count += 1
      }
      seen.push(candidate)
    }
    return count
  }
  if (supportsTimedExternal(exercise)) {
    const previous = allSets
      .filter((set) => set.sessionDate < (periodSets[0]?.sessionDate ?? ''))
      .flatMap((set) => {
        const item = asAnalyzableTimedSet(set, exercise)
        return item ? [item] : []
      })
    let count = 0
    const seen = [...previous]
    for (const set of [...periodSets].sort(compareSetChronology)) {
      const candidate = asAnalyzableTimedSet(set, exercise)
      if (!candidate) {
        continue
      }
      if (expandsTimedFrontier(candidate, seen)) {
        count += 1
      }
      seen.push(candidate)
    }
    return count
  }
  return 0
}

function exerciseSide(
  allSets: readonly CanonicalSetRecord[],
  periodSets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
  period: ComparePeriod,
): CompareExerciseSide {
  const appearances = groupAppearances(periodSets)
  const workingSets = periodSets.filter((set) => set.setType === 'working').length
  const volume = periodExternalVolume(periodSets, exercise)
  const prs = performanceBestsForExercise(allSets, exercise).filter((event) =>
    dateInInclusiveRange(event.date, period.start, period.end),
  )
  const timed = supportsTimedExternal(exercise)
  const loaded = supportsLoadedRepStrength(exercise)
  const bestPerformed = timed
    ? bestTimedPerformed(periodSets, exercise)
    : loaded
      ? bestLoadedPerformed(periodSets, exercise)
      : null
  const strengthPoints = appearances
    .map((sets) => sessionStrengthPoint(sets, exercise))
    .filter((point): point is NonNullable<typeof point> => point != null)
  const estimatedStrengthKg = timed
    ? null
    : strengthPoints.reduce<number | null>((best, point) => {
        if (best == null || point.estimated1RmKg > best) {
          return point.estimated1RmKg
        }
        return best
      }, null)
  return {
    appearances: appearances.length,
    workingSets,
    bestPerformed,
    estimatedStrengthKg,
    volumeKg: volume.observations > 0 ? volume.kg : null,
    performanceBestCount: prs.length,
    frontierExpansionCount: frontierExpansionsInPeriod(allSets, periodSets, exercise),
  }
}

function evidenceForPerformed(value: ComparePerformed | null): CanonicalEvidence[] {
  if (!value) {
    return []
  }
  return [
    {
      domain: 'training',
      sessionId: value.sessionId,
      sessionExerciseId: value.sessionExerciseId,
      setId: value.setId,
      date: value.date,
      loadKg: value.loadKg,
      reps: value.reps,
      durationSec: value.durationSec,
      leftReps: value.leftReps,
      rightReps: value.rightReps,
    },
  ]
}

function evidenceForObservation(observation: BodyObservation | null): CanonicalEvidence[] {
  if (!observation) {
    return []
  }
  return [
    {
      domain: 'body',
      measurementId: observation.measurementId,
      measurementSessionId: observation.measurementSessionId,
      date: observation.calendarDate,
    },
  ]
}

function bodyMetricForPeriods(
  observations: readonly BodyObservation[],
  key: string,
  periodA: ComparePeriod,
  periodB: ComparePeriod,
): CompareBodyMetric {
  const series = observationsForKey(observations, key)
  const aStart = nearestInPeriod(series, periodA, periodA.start, 'earlier')
  const aEnd = nearestInPeriod(series, periodA, periodA.end, 'later')
  const bStart = nearestInPeriod(series, periodB, periodB.start, 'earlier')
  const bEnd = nearestInPeriod(series, periodB, periodB.end, 'later')
  const aValue = aStart && aEnd && aStart.measurementId !== aEnd.measurementId ? { before: aStart.value, after: aEnd.value } : null
  const bValue = bStart && bEnd && bStart.measurementId !== bEnd.measurementId ? { before: bStart.value, after: bEnd.value } : null
  const compareEnds =
    aEnd && bEnd && aEnd.measurementId !== bEnd.measurementId
      ? changeFromNumbers(aEnd.value, bEnd.value)
      : insufficientMetric((aEnd ? 1 : 0) + (bEnd ? 1 : 0), 2)
  return {
    key,
    unit: aEnd?.unit ?? bEnd?.unit ?? series[0]?.unit ?? '',
    aStart,
    aEnd,
    bStart,
    bEnd,
    change: bValue && aValue ? changeFromNumbers(aValue.after, bValue.after) : compareEnds,
  }
}

function trainingForPeriod(
  workouts: readonly ProgressWorkoutSummary[],
  sets: readonly CanonicalSetRecord[],
  allSets: readonly CanonicalSetRecord[],
  exercises: readonly ProgressExerciseDefinition[],
  period: ComparePeriod,
): {
  workoutCount: number
  workoutsPerWeek: number
  workingSetCount: number
  volume: { kg: number; observations: number }
  performanceBestCount: number
} {
  const consistency = trainingConsistency(workouts, period.start, period.end)
  const periodSets = sets.filter((set) => inRange(set.sessionDate, period))
  const workingSetCount = periodSets.filter((set) => set.setType === 'working').length
  let volumeKg = 0
  let volumeObs = 0
  let prCount = 0
  for (const exercise of exercises) {
    const part = periodExternalVolume(
      periodSets.filter((set) => set.exerciseId === exercise.id),
      exercise,
    )
    volumeKg += part.kg
    volumeObs += part.observations
    prCount += performanceBestsForExercise(
      allSets.filter((set) => set.exerciseId === exercise.id),
      exercise,
    ).filter((event) => dateInInclusiveRange(event.date, period.start, period.end)).length
  }
  return {
    workoutCount: consistency.status === 'available' ? consistency.value.workoutCount : 0,
    workoutsPerWeek: consistency.status === 'available' ? consistency.value.workoutsPerWeek : 0,
    workingSetCount,
    volume: { kg: volumeKg, observations: volumeObs },
    performanceBestCount: prCount,
  }
}

function timedChangeLabel(
  before: ComparePerformed | null,
  after: ComparePerformed | null,
): CompareExercise['timedChange'] {
  if (!before || !after) {
    return null
  }
  if (before.durationSec === after.durationSec && after.loadKg > before.loadKg) {
    return 'heavier_equal_duration'
  }
  if (before.loadKg === after.loadKg && (after.durationSec ?? 0) > (before.durationSec ?? 0)) {
    return 'longer_equal_load'
  }
  if (before.loadKg !== after.loadKg || before.durationSec !== after.durationSec) {
    return 'changed'
  }
  return null
}

function buildExercises(
  input: ProgressCanonicalInput,
  periodA: ComparePeriod,
  periodB: ComparePeriod,
  sideSetsA: (exerciseId: string) => CanonicalSetRecord[],
  sideSetsB: (exerciseId: string) => CanonicalSetRecord[],
): CompareExercise[] {
  const exercises: CompareExercise[] = []
  for (const exercise of [...input.exercises].sort((left, right) => left.name.localeCompare(right.name))) {
    const setsA = sideSetsA(exercise.id)
    const setsB = sideSetsB(exercise.id)
    if (setsA.length === 0 && setsB.length === 0) {
      continue
    }
    const a = exerciseSide(input.sets, setsA, exercise, periodA)
    const b = exerciseSide(input.sets, setsB, exercise, periodB)
    if (a.appearances === 0 && b.appearances === 0 && !a.bestPerformed && !b.bestPerformed) {
      continue
    }
    const estimatedStrengthChangePercent =
      a.estimatedStrengthKg != null && b.estimatedStrengthKg != null
        ? percentChange(b.estimatedStrengthKg, a.estimatedStrengthKg)
        : null
    exercises.push({
      exerciseId: exercise.id,
      name: exercise.name,
      performanceType: exercise.performanceType,
      a,
      b,
      estimatedStrengthChangePercent,
      timedChange: supportsTimedExternal(exercise) ? timedChangeLabel(a.bestPerformed, b.bestPerformed) : null,
      evidence: [...evidenceForPerformed(a.bestPerformed), ...evidenceForPerformed(b.bestPerformed)],
    })
  }
  return exercises
}

function compareFindings(result: Omit<ProgressCompare, 'findings'>): CompareFinding[] {
  const findings: CompareFinding[] = []
  const frequency = result.training.workoutsPerWeek
  if (frequency.a.status === 'available' && frequency.b.status === 'available') {
    findings.push({
      kind: 'training_frequency_change',
      beforePerWeek: frequency.a.value.value,
      afterPerWeek: frequency.b.value.value,
      change: frequency.change.status === 'available' ? frequency.change.value.absolute : undefined,
      evidence: [],
    })
  }
  const weight = result.body.weight
  if (weight.change.status === 'available' && weight.aEnd && weight.bEnd) {
    findings.push({
      kind: 'weight_change',
      before: weight.aEnd.value,
      after: weight.bEnd.value,
      change: weight.change.value.absolute,
      changePercent: weight.change.value.percentChange,
      evidence: [...evidenceForObservation(weight.aEnd), ...evidenceForObservation(weight.bEnd)],
    })
  }
  for (const exercise of result.exercises) {
    if (exercise.estimatedStrengthChangePercent != null && exercise.estimatedStrengthChangePercent !== 0 && exercise.a.estimatedStrengthKg != null && exercise.b.estimatedStrengthKg != null) {
      findings.push({
        kind: 'exercise_strength_change',
        exerciseId: exercise.exerciseId,
        before: exercise.a.estimatedStrengthKg,
        after: exercise.b.estimatedStrengthKg,
        changePercent: exercise.estimatedStrengthChangePercent,
        evidence: exercise.evidence,
      })
    } else if (exercise.timedChange && exercise.a.bestPerformed && exercise.b.bestPerformed) {
      findings.push({
        kind: 'exercise_performance_change',
        exerciseId: exercise.exerciseId,
        before: exercise.a.bestPerformed.loadKg,
        after: exercise.b.bestPerformed.loadKg,
        evidence: exercise.evidence,
      })
    }
  }
  return findings
}

export function buildProgressCompare(input: {
  canonical: ProgressCanonicalInput
  periodA: ComparePeriod
  periodB: ComparePeriod
}): ProgressCompare {
  const { canonical, periodA, periodB } = input
  const trainingA = trainingForPeriod(canonical.workouts, canonical.sets, canonical.sets, canonical.exercises, periodA)
  const trainingB = trainingForPeriod(canonical.workouts, canonical.sets, canonical.sets, canonical.exercises, periodB)
  const weight = bodyMetricForPeriods(canonical.bodyObservations, 'weight', periodA, periodB)
  const metricKeys = [...new Set(canonical.bodyObservations.map((item) => item.key).filter((key) => key !== 'weight'))].sort()
  const draft: Omit<ProgressCompare, 'findings'> = {
    mode: 'range',
    periodA,
    periodB,
    checkpoint: null,
    training: {
      workoutCount: sidesFromCounts(trainingA.workoutCount, trainingB.workoutCount, trainingA.workoutCount, trainingB.workoutCount),
      workoutsPerWeek: workoutsPerWeekSides(
        workoutsPerWeekForPeriod(periodA, trainingA.workoutsPerWeek, trainingA.workoutCount),
        workoutsPerWeekForPeriod(periodB, trainingB.workoutsPerWeek, trainingB.workoutCount),
      ),
      workingSetCount: sidesFromCounts(
        trainingA.workingSetCount,
        trainingB.workingSetCount,
        trainingA.workingSetCount,
        trainingB.workingSetCount,
      ),
      externalVolumeKg: {
        a: volumeSide(trainingA.volume.kg, trainingA.volume.observations),
        b: volumeSide(trainingB.volume.kg, trainingB.volume.observations),
        change: changeFromNumbers(
          trainingA.volume.observations > 0 ? trainingA.volume.kg : null,
          trainingB.volume.observations > 0 ? trainingB.volume.kg : null,
        ),
      },
      performanceBestCount: sidesFromCounts(
        trainingA.performanceBestCount,
        trainingB.performanceBestCount,
        trainingA.performanceBestCount,
        trainingB.performanceBestCount,
      ),
    },
    body: {
      weight: {
        ...weight,
        trendA: bodyWeightTrend(inPeriodObservations(observationsForKey(canonical.bodyObservations, 'weight'), periodA)),
        trendB: bodyWeightTrend(inPeriodObservations(observationsForKey(canonical.bodyObservations, 'weight'), periodB)),
      },
      metrics: metricKeys.map((key) => bodyMetricForPeriods(canonical.bodyObservations, key, periodA, periodB)),
    },
    exercises: buildExercises(
      canonical,
      periodA,
      periodB,
      (exerciseId) =>
        canonical.sets.filter((set) => set.exerciseId === exerciseId && inRange(set.sessionDate, periodA)),
      (exerciseId) =>
        canonical.sets.filter((set) => set.exerciseId === exerciseId && inRange(set.sessionDate, periodB)),
    ),
  }
  return { ...draft, findings: compareFindings(draft) }
}

export function buildSinceCheckpointCompare(input: {
  canonical: ProgressCanonicalInput
  checkpoint: ProgressCheckpoint
  asOf: string
}): ProgressCompare {
  const { canonical, checkpoint, asOf } = input
  if (!isCalendarDate(asOf)) {
    throw new Error('asOf must be YYYY-MM-DD')
  }
  const periodA = comparePeriod(checkpoint.checkpointDate, checkpoint.checkpointDate)
  const periodB = comparePeriod(checkpoint.checkpointDate, asOf < checkpoint.checkpointDate ? checkpoint.checkpointDate : asOf)
  const sinceTraining = trainingForPeriod(canonical.workouts, canonical.sets, canonical.sets, canonical.exercises, periodB)
  const bodyDays = PROGRESS_ANALYTICS_CONFIG.checkpoint.bodyNearestDays
  const lookback = PROGRESS_ANALYTICS_CONFIG.checkpoint.exerciseLookbackDays
  const weightSeries = observationsForKey(canonical.bodyObservations, 'weight')
  const baselineWeight = nearestBodyObservationWithinDays(weightSeries, 'weight', checkpoint.checkpointDate, bodyDays)
  const orderedWeights = [...weightSeries].filter((item) => item.calendarDate <= asOf).sort(compareObservations)
  const currentWeight = orderedWeights[orderedWeights.length - 1] ?? null
  const currentDistinct =
    currentWeight && baselineWeight && currentWeight.measurementId !== baselineWeight.measurementId ? currentWeight : currentWeight && !baselineWeight ? currentWeight : null
  const weightChange = changeFromNumbers(baselineWeight?.value ?? null, currentDistinct?.value ?? null)
  const metricKeys = [...new Set(canonical.bodyObservations.map((item) => item.key).filter((key) => key !== 'weight'))].sort()

  const exercises: CompareExercise[] = []
  for (const exercise of [...canonical.exercises].sort((left, right) => left.name.localeCompare(right.name))) {
    const baselineAppearance = latestExerciseAppearanceOnOrBefore(
      canonical.sets,
      exercise,
      checkpoint.checkpointDate,
      lookback,
    )
    const currentAppearance = latestAppearanceAfter(
      canonical.sets,
      exercise,
      baselineAppearance,
      checkpoint.checkpointDate,
      asOf,
    )
    if (!baselineAppearance && !currentAppearance) {
      continue
    }
    const a = exerciseSide(canonical.sets, baselineAppearance ?? [], exercise, periodA)
    const b = exerciseSide(canonical.sets, currentAppearance ?? [], exercise, periodB)
    const sameSet = a.bestPerformed && b.bestPerformed && a.bestPerformed.setId === b.bestPerformed.setId
    const estimatedStrengthChangePercent =
      !sameSet && a.estimatedStrengthKg != null && b.estimatedStrengthKg != null
        ? percentChange(b.estimatedStrengthKg, a.estimatedStrengthKg)
        : null
    exercises.push({
      exerciseId: exercise.id,
      name: exercise.name,
      performanceType: exercise.performanceType,
      a,
      b,
      estimatedStrengthChangePercent,
      timedChange: supportsTimedExternal(exercise) ? timedChangeLabel(a.bestPerformed, b.bestPerformed) : null,
      evidence: [...evidenceForPerformed(a.bestPerformed), ...evidenceForPerformed(b.bestPerformed)],
    })
  }

  const bodyMetrics: CompareBodyMetric[] = metricKeys.map((key) => {
    const series = observationsForKey(canonical.bodyObservations, key)
    const baseline = nearestBodyObservationWithinDays(series, key, checkpoint.checkpointDate, bodyDays)
    const latestList = [...series].filter((item) => item.calendarDate <= asOf).sort(compareObservations)
    const latest = latestList[latestList.length - 1] ?? null
    const current = latest && baseline && latest.measurementId !== baseline.measurementId ? latest : latest && !baseline ? latest : null
    return {
      key,
      unit: baseline?.unit ?? current?.unit ?? '',
      aStart: baseline,
      aEnd: baseline,
      bStart: current,
      bEnd: current,
      change: changeFromNumbers(baseline?.value ?? null, current?.value ?? null),
    }
  })

  const draft: Omit<ProgressCompare, 'findings'> = {
    mode: 'since_checkpoint',
    periodA,
    periodB,
    checkpoint,
    training: {
      workoutCount: sidesFromCounts(null, sinceTraining.workoutCount, 0, sinceTraining.workoutCount),
      workoutsPerWeek: workoutsPerWeekSides(
        notApplicableMetric(0),
        workoutsPerWeekForPeriod(periodB, sinceTraining.workoutsPerWeek, sinceTraining.workoutCount),
      ),
      workingSetCount: sidesFromCounts(null, sinceTraining.workingSetCount, 0, sinceTraining.workingSetCount),
      externalVolumeKg: {
        a: notApplicableMetric(0),
        b: volumeSide(sinceTraining.volume.kg, sinceTraining.volume.observations),
        change: notApplicableMetric(0),
      },
      performanceBestCount: sidesFromCounts(null, sinceTraining.performanceBestCount, 0, sinceTraining.performanceBestCount),
    },
    body: {
      weight: {
        key: 'weight',
        unit: baselineWeight?.unit ?? currentDistinct?.unit ?? 'kg',
        aStart: baselineWeight,
        aEnd: baselineWeight,
        bStart: currentDistinct,
        bEnd: currentDistinct,
        change: weightChange,
        trendA: insufficientMetric(0),
        trendB: bodyWeightTrend(
          inPeriodObservations(weightSeries, periodB),
        ),
      },
      metrics: bodyMetrics,
    },
    exercises,
  }
  return { ...draft, findings: compareFindings(draft) }
}

export function performedToLatest(value: ComparePerformed | null): LatestPerformance | null {
  if (!value) {
    return null
  }
  return {
    sessionId: value.sessionId,
    sessionExerciseId: value.sessionExerciseId,
    exerciseId: '',
    date: value.date,
    loadKg: value.loadKg,
    reps: value.reps,
    durationSec: value.durationSec,
    estimated1RmKg: value.estimated1RmKg,
    sourceSetId: value.setId,
    leftReps: value.leftReps,
    rightReps: value.rightReps,
  }
}
