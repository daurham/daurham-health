import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { bodyWeightTrend, bodyWeightTrendEvidence, compareSparseBodyMetric, latestBodyObservation } from './body-trend.js'
import { compareCounts } from './comparison.js'
import { trainingConsistency } from './consistency.js'
import { supportsLoadedRepStrength, supportsTimedExternal } from './exercise-classification.js'
import {
  asAnalyzableLoadedRepSet,
  asAnalyzableTimedSet,
  compareSetChronology,
  estimatedStrengthForSet,
  evidenceFromSet,
  latestLoadedPerformance,
  latestTimedPerformance,
} from './exercise-performance.js'
import { estimatedStrengthTrend, progressionPattern, sessionStrengthHistory } from './exercise-trend.js'
import {
  findingsFromBodyWeightTrend,
  findingsFromExerciseTrend,
  findingsFromPerformanceBests,
  findingsFromTrainingFrequency,
} from './findings.js'
import { performanceFrontier, timedPerformanceFrontier } from './frontier.js'
import { dateInInclusiveRange, trailingPeriod, type TrailingPeriod } from './periods.js'
import { nutritionFindings, nutritionPeriodSummary, type NutritionPeriodSummary } from './nutrition.js'
import type { ActivityDailyRow } from '../activity/analytics.js'
import type { NutritionEntry, NutritionTarget } from '../nutrition/types.js'
import type { ProgressActivityWorkout, ProgressSleepObservation } from './health-timeline.js'
import { performanceBestsForExercise } from './prs.js'
import { relativeStrength } from './relative-strength.js'
import {
  availableMetric,
  insufficientMetric,
  notApplicableMetric,
  unsupportedMetric,
  type BodyObservation,
  type CanonicalEvidence,
  type CanonicalSetRecord,
  type FrontierPoint,
  type LatestPerformance,
  type MetricResult,
  type ProgressExerciseDefinition,
  type ProgressFinding,
  type ProgressRange,
  type ProgressWorkoutSummary,
} from './types.js'
import { periodExternalVolume } from './volume.js'

export type ProgressCanonicalInput = {
  asOf: string
  range: ProgressRange
  exercises: ProgressExerciseDefinition[]
  sets: CanonicalSetRecord[]
  workouts: ProgressWorkoutSummary[]
  bodyObservations: BodyObservation[]
  nutritionEntries?: NutritionEntry[]
  nutritionTargets?: NutritionTarget[]
  activityDays?: ActivityDailyRow[]
  sleepNights?: ProgressSleepObservation[]
  activityWorkouts?: ProgressActivityWorkout[]
  today?: string
}

export type ProgressOverview = {
  period: TrailingPeriod
  training: {
    workouts: MetricResult<{ count: number }>
    sessions: ProgressWorkoutSummary[]
    consistency: ReturnType<typeof trainingConsistency>
    comparison: {
      workoutCount: ReturnType<typeof compareCounts>
      workoutsPerWeek: ReturnType<typeof compareCounts>
      exerciseVolume: ReturnType<typeof compareCounts>
      performanceBestCount: ReturnType<typeof compareCounts>
    }
  }
  body: {
    weight: {
      latest: BodyObservation | null
      trend: ReturnType<typeof bodyWeightTrend>
      observations: BodyObservation[]
      requirements: {
        minimumMeasurements: number
        minimumSpanDays: number
      }
    }
    metrics: Array<{
      key: string
      latest: BodyObservation | null
      comparison: ReturnType<typeof compareSparseBodyMetric>
    }>
    comparison: {
      weightChange: ReturnType<typeof compareCounts>
    }
  }
  exercises: Array<{
    exerciseId: string
    name: string
    externalId: string | null
    performanceType: ProgressExerciseDefinition['performanceType']
    analyticsLoadType: ProgressExerciseDefinition['analyticsLoadType']
    analyticsRepMode: ProgressExerciseDefinition['analyticsRepMode']
    latestPerformance: LatestPerformance | null
    estimatedStrength: MetricResult<{
      value: number
      formula: 'epley'
      sourceSet: {
        setId: string
        sessionId: string
        date: string
        loadKg: number
        reps: number
      }
    }>
    trend: ReturnType<typeof estimatedStrengthTrend>
    progressionPattern: ReturnType<typeof progressionPattern>
    frontier: FrontierPoint[]
    volume: MetricResult<{ kg: number }>
    recentPrs: ReturnType<typeof performanceBestsForExercise>
    relativeStrength: ReturnType<typeof relativeStrength>
    appearanceCount: number
    estimatedStrengthHistory: Array<{
      sessionId: string
      sessionExerciseId: string
      date: string
      estimated1RmKg: number
      loadKg: number
      reps: number
      setId: string
      leftReps: number | null
      rightReps: number | null
    }>
    performedPoints: FrontierPoint[]
  }>
  nutrition: NutritionPeriodSummary
  findings: ProgressFinding[]
}

function earliestDate(input: ProgressCanonicalInput): string | null {
  const dates = [
    ...input.workouts.map((item) => item.sessionDate),
    ...input.sets.map((item) => item.sessionDate),
    ...input.bodyObservations.map((item) => item.calendarDate),
    ...(input.nutritionEntries ?? []).map((item) => item.logDate),
  ].filter((date) => date <= input.asOf)
  if (dates.length === 0) {
    return null
  }
  return dates.reduce((min, date) => (date < min ? date : min))
}

function setsThrough(sets: readonly CanonicalSetRecord[], asOf: string): CanonicalSetRecord[] {
  return sets.filter((set) => set.sessionDate <= asOf).sort(compareSetChronology)
}

function groupAppearances(
  sets: readonly CanonicalSetRecord[],
): CanonicalSetRecord[][] {
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

function workoutEvidence(workouts: readonly ProgressWorkoutSummary[]): CanonicalEvidence[] {
  return workouts.map((item) => ({
    domain: 'training' as const,
    sessionId: item.sessionId,
    date: item.sessionDate,
  }))
}

export function buildProgressOverview(input: ProgressCanonicalInput): ProgressOverview {
  const asOfSets = setsThrough(input.sets, input.asOf)
  const asOfWorkouts = input.workouts.filter((item) => item.sessionDate <= input.asOf)
  const asOfBody = input.bodyObservations.filter((item) => item.calendarDate <= input.asOf)
  const period = trailingPeriod(input.range, input.asOf, earliestDate(input))
  const currentWorkouts = asOfWorkouts.filter((item) =>
    dateInInclusiveRange(item.sessionDate, period.start, period.end),
  )
  const previousWorkouts =
    period.comparisonStart && period.comparisonEnd
      ? asOfWorkouts.filter((item) =>
          dateInInclusiveRange(item.sessionDate, period.comparisonStart!, period.comparisonEnd!),
        )
      : null

  const consistency = trainingConsistency(asOfWorkouts, period.start, period.end)
  const exercisesById = new Map(input.exercises.map((exercise) => [exercise.id, exercise]))
  const volumeInRange = (start: string, end: string) => {
    let kg = 0
    let observations = 0
    for (const set of asOfSets) {
      if (!dateInInclusiveRange(set.sessionDate, start, end)) {
        continue
      }
      const exercise = exercisesById.get(set.exerciseId)
      if (!exercise) {
        continue
      }
      const part = periodExternalVolume([set], exercise)
      kg += part.kg
      observations += part.observations
    }
    return { kg, observations }
  }
  const currentExerciseVolume = volumeInRange(period.start, period.end)
  const previousExerciseVolume =
    period.comparisonStart && period.comparisonEnd
      ? volumeInRange(period.comparisonStart, period.comparisonEnd)
      : null

  const weightTrend = bodyWeightTrend(asOfBody)
  const weightPoints = asOfBody.filter((item) => item.key === 'weight')
  const latestWeight = weightPoints.length
    ? [...weightPoints].sort((left, right) => {
        if (left.calendarDate !== right.calendarDate) {
          return left.calendarDate < right.calendarDate ? -1 : 1
        }
        return left.measuredAt < right.measuredAt ? -1 : 1
      })[weightPoints.length - 1]!
    : null

  const metricKeys = [...new Set(asOfBody.map((item) => item.key).filter((key) => key !== 'weight'))].sort()
  const bodyMetrics = metricKeys.map((key) => ({
    key,
    latest: latestBodyObservation(asOfBody, key),
    comparison: compareSparseBodyMetric(asOfBody, key, period.start, period.end),
  }))

  const findings: ProgressFinding[] = []
  const exerciseViews: ProgressOverview['exercises'] = []
  let currentPrCount = 0
  let previousPrCount = 0

  for (const exercise of [...input.exercises].sort((left, right) => left.name.localeCompare(right.name))) {
    const exerciseSets = asOfSets.filter((set) => set.exerciseId === exercise.id)
    const loadedAnalyzable = exerciseSets.flatMap((set) => {
      const item = asAnalyzableLoadedRepSet(set, exercise)
      return item ? [item] : []
    })
    const timedAnalyzable = exerciseSets.flatMap((set) => {
      const item = asAnalyzableTimedSet(set, exercise)
      return item ? [item] : []
    })
    const appearances = groupAppearances(exerciseSets)
    const strengthHistory = sessionStrengthHistory(appearances, exercise)
    const timed = supportsTimedExternal(exercise)
    const loaded = supportsLoadedRepStrength(exercise)
    const trend = timed ? notApplicableMetric(timedAnalyzable.length) : estimatedStrengthTrend(strengthHistory)
    const prs = performanceBestsForExercise(exerciseSets, exercise)
    const recentPrs = prs.filter((event) => dateInInclusiveRange(event.date, period.start, period.end))
    currentPrCount += recentPrs.length
    if (period.comparisonStart && period.comparisonEnd) {
      previousPrCount += prs.filter((event) =>
        dateInInclusiveRange(event.date, period.comparisonStart!, period.comparisonEnd!),
      ).length
    }
    const periodVolume = periodExternalVolume(
      exerciseSets.filter((set) => dateInInclusiveRange(set.sessionDate, period.start, period.end)),
      exercise,
    )
    const frontier: FrontierPoint[] = timed
      ? timedPerformanceFrontier(timedAnalyzable).map((set) => ({
          setId: set.setId,
          sessionId: set.sessionId,
          date: set.sessionDate,
          loadKg: set.weightKg,
          reps: null,
          durationSec: set.durationSec,
        }))
      : performanceFrontier(loadedAnalyzable).map((set) => ({
          setId: set.setId,
          sessionId: set.sessionId,
          date: set.sessionDate,
          loadKg: set.weightKg,
          reps: set.reps,
          durationSec: null,
        }))
    const latestEstimate = strengthHistory.length
      ? estimatedStrengthForSet(strengthHistory[strengthHistory.length - 1]!.sourceSet, exercise)
      : null
    const latestPerformance = timed
      ? latestTimedPerformance(exerciseSets, exercise)
      : latestLoadedPerformance(exerciseSets, exercise)

    let estimatedStrength: ProgressOverview['exercises'][number]['estimatedStrength']
    if (timed) {
      estimatedStrength = notApplicableMetric(timedAnalyzable.length)
    } else if (!loaded) {
      estimatedStrength = unsupportedMetric(exerciseSets.length)
    } else if (!latestEstimate || latestEstimate.confidence !== 'high') {
      estimatedStrength = insufficientMetric(strengthHistory.length, 1)
    } else {
      estimatedStrength = availableMetric(
        {
          value: latestEstimate.value,
          formula: 'epley' as const,
          sourceSet: {
            setId: latestEstimate.sourceSet.setId,
            sessionId: latestEstimate.sourceSet.sessionId,
            date: latestEstimate.sourceSet.sessionDate,
            loadKg: latestEstimate.sourceSet.weightKg,
            reps: latestEstimate.sourceSet.reps,
          },
        },
        strengthHistory.length,
        'session_high_confidence_epley',
      )
    }

    const relative = timed
      ? notApplicableMetric(timedAnalyzable.length)
      : relativeStrength(strengthHistory.length ? strengthHistory[strengthHistory.length - 1]! : null, asOfBody)
    exerciseViews.push({
      exerciseId: exercise.id,
      name: exercise.name,
      externalId: exercise.externalId,
      performanceType: exercise.performanceType,
      analyticsLoadType: exercise.analyticsLoadType,
      analyticsRepMode: exercise.analyticsRepMode,
      latestPerformance,
      estimatedStrength,
      trend,
      progressionPattern: progressionPattern(appearances, exercise),
      frontier,
      volume: timed
        ? notApplicableMetric(timedAnalyzable.length)
        : !loaded
          ? unsupportedMetric(exerciseSets.length)
          : periodVolume.observations === 0
            ? insufficientMetric(0, 1)
            : availableMetric({ kg: periodVolume.kg }, periodVolume.observations),
      recentPrs,
      relativeStrength: relative,
      appearanceCount: timed
        ? new Set(timedAnalyzable.map((set) => set.sessionId)).size
        : strengthHistory.length,
      estimatedStrengthHistory: strengthHistory.map((point) => ({
        sessionId: point.sessionId,
        sessionExerciseId: point.sessionExerciseId,
        date: point.date,
        estimated1RmKg: point.estimated1RmKg,
        loadKg: point.sourceSet.weightKg,
        reps: point.sourceSet.reps,
        setId: point.sourceSet.setId,
        leftReps: point.sourceSet.leftReps,
        rightReps: point.sourceSet.rightReps,
      })),
      performedPoints: timed
        ? timedAnalyzable.map((set) => ({
            setId: set.setId,
            sessionId: set.sessionId,
            date: set.sessionDate,
            loadKg: set.weightKg,
            reps: null,
            durationSec: set.durationSec,
          }))
        : loadedAnalyzable.map((set) => ({
            setId: set.setId,
            sessionId: set.sessionId,
            date: set.sessionDate,
            loadKg: set.weightKg,
            reps: set.reps,
            durationSec: null,
          })),
    })
    if (!timed) {
      findings.push(...findingsFromExerciseTrend(exercise.id, trend, strengthHistory))
    }
    findings.push(...findingsFromPerformanceBests(recentPrs))
  }

  const workoutCountComparison = compareCounts(
    currentWorkouts.length,
    previousWorkouts ? previousWorkouts.length : null,
  )
  const currentPerWeek = consistency.status === 'available' ? consistency.value.workoutsPerWeek : null
  const previousConsistency =
    period.comparisonStart && period.comparisonEnd
      ? trainingConsistency(asOfWorkouts, period.comparisonStart, period.comparisonEnd)
      : null
  const previousPerWeek =
    previousConsistency?.status === 'available' ? previousConsistency.value.workoutsPerWeek : null

  findings.push(
    ...findingsFromBodyWeightTrend(weightTrend, bodyWeightTrendEvidence(asOfBody)),
    ...findingsFromTrainingFrequency(workoutCountComparison, workoutEvidence(currentWorkouts)),
  )

  const nutrition = nutritionPeriodSummary({
    entries: input.nutritionEntries ?? [],
    targets: input.nutritionTargets ?? [],
    start: period.start,
    end: period.end,
  })
  findings.push(...nutritionFindings(nutrition))

  let weightChange: ReturnType<typeof compareCounts> = notApplicableMetric(0)
  if (latestWeight && period.comparisonStart) {
    const startNearest = [...weightPoints]
      .filter((item) => item.calendarDate <= period.start)
      .sort((left, right) => (left.calendarDate < right.calendarDate ? -1 : 1))
    const startValue = startNearest.length ? startNearest[startNearest.length - 1]!.value : null
    weightChange = compareCounts(latestWeight.value, startValue)
  }

  return {
    period,
    training: {
      workouts: availableMetric({ count: currentWorkouts.length }, currentWorkouts.length),
      sessions: currentWorkouts,
      consistency,
      comparison: {
        workoutCount: workoutCountComparison,
        workoutsPerWeek: compareCounts(currentPerWeek, previousPerWeek),
        exerciseVolume: compareCounts(
          currentExerciseVolume.kg,
          previousExerciseVolume ? previousExerciseVolume.kg : null,
        ),
        performanceBestCount: compareCounts(
          currentPrCount,
          period.comparisonStart ? previousPrCount : null,
        ),
      },
    },
    body: {
      weight: {
        latest: latestWeight,
        trend: weightTrend,
        observations: weightPoints,
        requirements: {
          minimumMeasurements: PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumMeasurements,
          minimumSpanDays: PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumSpanDays,
        },
      },
      metrics: bodyMetrics,
      comparison: {
        weightChange,
      },
    },
    exercises: exerciseViews,
    nutrition,
    findings,
  }
}

export { evidenceFromSet }
