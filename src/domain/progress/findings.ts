import { evidenceFromSet } from './exercise-performance.js'
import type {
  CanonicalEvidence,
  PerformanceBestEvent,
  ProgressFinding,
  SessionStrengthPoint,
} from './types.js'
import type { ExerciseTrendValue } from './exercise-trend.js'
import type { BodyWeightTrendValue } from './body-trend.js'
import type { PeriodComparisonValue } from './comparison.js'
import type { MetricResult } from './types.js'

export function findingsFromExerciseTrend(
  exerciseId: string,
  trend: MetricResult<ExerciseTrendValue>,
  points: readonly SessionStrengthPoint[],
): ProgressFinding[] {
  if (trend.status !== 'available' || trend.value.direction === 'stable') {
    return []
  }
  const evidence: CanonicalEvidence[] = points.slice(-6).map((point) => evidenceFromSet(point.sourceSet))
  return [
    {
      kind: trend.value.direction === 'improving' ? 'exercise_improved' : 'exercise_decreased',
      domain: 'training',
      exerciseId,
      metric: 'estimated_strength',
      changePercent: trend.value.changePercent,
      currentValue: trend.value.recentMedian,
      previousValue: trend.value.previousMedian,
      evidence,
    },
  ]
}

export function findingsFromPerformanceBests(
  events: readonly PerformanceBestEvent[],
): ProgressFinding[] {
  return events.map((event) => ({
    kind: 'performance_best',
    domain: 'training',
    exerciseId: event.exerciseId,
    achievements: event.achievements,
    evidence: event.evidence,
  }))
}

export function findingsFromBodyWeightTrend(
  trend: MetricResult<BodyWeightTrendValue>,
  evidence: CanonicalEvidence[],
): ProgressFinding[] {
  if (trend.status !== 'available') {
    return []
  }
  const slope = trend.value.slopePerWeek
  const direction = slope > 0 ? 'increasing' : slope < 0 ? 'decreasing' : 'stable'
  if (direction === 'stable') {
    return []
  }
  return [
    {
      kind: 'body_weight_trend',
      domain: 'body',
      direction,
      slopePerWeek: slope,
      observationCount: trend.value.measurementCount,
      evidence,
    },
  ]
}

export function findingsFromTrainingFrequency(
  comparison: MetricResult<PeriodComparisonValue>,
  currentEvidence: CanonicalEvidence[],
): ProgressFinding[] {
  if (comparison.status !== 'available' || comparison.value.change === 0) {
    return []
  }
  return [
    {
      kind: 'training_frequency_change',
      domain: 'training',
      currentWorkouts: comparison.value.current,
      previousWorkouts: comparison.value.previous,
      evidence: currentEvidence,
    },
  ]
}
