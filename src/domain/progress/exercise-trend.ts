import { PROGRESS_ANALYTICS_CONFIG } from './config.js'
import { sessionStrengthPoint } from './exercise-performance.js'
import { median, percentChange } from './statistics.js'
import { sessionExternalVolumeKg } from './volume.js'
import {
  availableMetric,
  insufficientMetric,
  type CanonicalSetRecord,
  type ExerciseTrendDirection,
  type MetricResult,
  type ProgressionPattern,
  type ProgressExerciseDefinition,
  type SessionStrengthPoint,
} from './types.js'

export type ExerciseTrendValue = {
  direction: ExerciseTrendDirection
  changePercent: number
  recentValues: number[]
  previousValues: number[]
  recentMedian: number
  previousMedian: number
  observationCount: number
  basis: 'recent_3_vs_previous_3'
}

export function sessionStrengthHistory(
  setsByAppearance: ReadonlyArray<readonly CanonicalSetRecord[]>,
  exercise: ProgressExerciseDefinition,
): SessionStrengthPoint[] {
  const points: SessionStrengthPoint[] = []
  for (const sets of setsByAppearance) {
    const point = sessionStrengthPoint(sets, exercise)
    if (point) {
      points.push(point)
    }
  }
  return points
}

export function estimatedStrengthTrend(
  points: readonly SessionStrengthPoint[],
): MetricResult<ExerciseTrendValue> {
  const recentCount = PROGRESS_ANALYTICS_CONFIG.exerciseTrend.recentAppearances
  const previousCount = PROGRESS_ANALYTICS_CONFIG.exerciseTrend.previousAppearances
  const required = recentCount + previousCount
  if (points.length < required) {
    return insufficientMetric(points.length, required)
  }
  const window = points.slice(-required)
  const previousValues = window.slice(0, previousCount).map((point) => point.estimated1RmKg)
  const recentValues = window.slice(previousCount).map((point) => point.estimated1RmKg)
  const previousMedian = median(previousValues)
  const recentMedian = median(recentValues)
  if (previousMedian == null || recentMedian == null) {
    return insufficientMetric(points.length, required)
  }
  const change = percentChange(recentMedian, previousMedian)
  if (change == null) {
    return insufficientMetric(points.length, required)
  }
  const threshold = PROGRESS_ANALYTICS_CONFIG.exerciseTrend.improvementThresholdPct
  const direction: ExerciseTrendDirection =
    change >= threshold ? 'improving' : change <= -threshold ? 'decreasing' : 'stable'
  return availableMetric(
    {
      direction,
      changePercent: change,
      recentValues,
      previousValues,
      recentMedian,
      previousMedian,
      observationCount: points.length,
      basis: 'recent_3_vs_previous_3',
    },
    points.length,
    'recent_3_vs_previous_3',
  )
}

type AppearanceBest = {
  loadKg: number
  reps: number
  volumeKg: number | null
}

function appearanceBest(
  sets: readonly CanonicalSetRecord[],
  exercise: ProgressExerciseDefinition,
): AppearanceBest | null {
  const strength = sessionStrengthPoint(sets, exercise)
  if (strength) {
    return {
      loadKg: strength.sourceSet.weightKg,
      reps: strength.sourceSet.reps,
      volumeKg: sessionExternalVolumeKg(sets, exercise),
    }
  }
  return null
}

export function progressionPattern(
  appearances: ReadonlyArray<readonly CanonicalSetRecord[]>,
  exercise: ProgressExerciseDefinition,
): ProgressionPattern {
  if (appearances.length < 2) {
    return 'insufficient_data'
  }
  const previous = appearanceBest(appearances[appearances.length - 2]!, exercise)
  const recent = appearanceBest(appearances[appearances.length - 1]!, exercise)
  if (!previous || !recent) {
    return 'insufficient_data'
  }
  const loadUp = recent.loadKg > previous.loadKg
  const loadSame = recent.loadKg === previous.loadKg
  const repsUp = recent.reps > previous.reps
  const repsSame = recent.reps === previous.reps
  const volumeUp =
    recent.volumeKg != null && previous.volumeKg != null && recent.volumeKg > previous.volumeKg

  if (loadUp && repsUp) {
    return 'load_and_rep_progression'
  }
  if (loadUp && (repsSame || recent.reps >= previous.reps)) {
    return 'load_progression'
  }
  if (loadSame && repsUp) {
    return 'rep_progression'
  }
  if (loadUp && recent.reps < previous.reps) {
    return 'unknown'
  }
  if (loadSame && repsSame && volumeUp) {
    return 'work_capacity_progression'
  }
  if (loadSame && repsSame) {
    return 'stable'
  }
  return 'unknown'
}
