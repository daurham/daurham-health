import type { AskLens } from '../ask-health/index.js'
import type { ActivityDailyRow } from '../activity/analytics.js'
import type { CrossDomainFinding } from '../intelligence/types.js'
import type { ExerciseTrendValue } from '../progress/exercise-trend.js'
import type { BodyObservation, MetricResult, ProgressRange } from '../progress/types.js'
import type { PROACTIVE_INSIGHTS_VERSION } from './config.js'

export type InsightKind = 'domain_change' | 'domain_trend' | 'cross_domain_pattern'

export type InsightEvidence = {
  label: string
  value: string
  detail?: string
}

export type InsightAskHealth = {
  lens: AskLens
  range: ProgressRange
  suggestedQuestion: string
}

export type ProactiveInsight = {
  id: string
  calculationVersion: typeof PROACTIVE_INSIGHTS_VERSION
  kind: InsightKind
  domain: string
  title: string
  summary: string
  period: {
    start: string
    end: string
  }
  periodLabel: string
  evidence: InsightEvidence[]
  detailPath: string
  goalPath?: string
  askHealth?: InsightAskHealth
  ranking: {
    tier: number
    stableKey: string
  }
}

export type ProactiveInsights = {
  calculationVersion: typeof PROACTIVE_INSIGHTS_VERSION
  range: ProgressRange
  asOf: string
  insights: ProactiveInsight[]
}

export type InsightDetectorStatus =
  | 'eligible'
  | 'insufficient_evidence'
  | 'below_surfacing_threshold'
  | 'source_not_comparable'
  | 'unsupported'

export type InsightDetectorResult = {
  status: InsightDetectorStatus
  insight?: ProactiveInsight
  reason?: string
  magnitude?: number
  associationRank?: number
  recency?: string
}

export type InsightNutritionDay = {
  date: string
  calories: number | null
  protein: number | null
}

export type InsightSleepNight = {
  sleepDate: string
  analysisEligible: boolean
  totalSleepMinutes: number | null
  logicalSourceKey: string | null
  sourceName: string | null
}

export type InsightTrainingSession = {
  performedOn: string
  sessionType: string
}

export type InsightStrengthExercise = {
  exerciseId: string
  name: string
  latestDate: string | null
  trend: MetricResult<ExerciseTrendValue>
}

export type InsightDetectorInput = {
  range: ProgressRange
  asOf: string
  /** America/Phoenix today. When it equals asOf, the current Activity day stays out of the comparison. */
  today: string | null
  activityDays: readonly ActivityDailyRow[]
  sleepNights: readonly InsightSleepNight[]
  nutritionDays: readonly InsightNutritionDay[]
  trainingSessions: readonly InsightTrainingSession[]
  bodyWeights: readonly BodyObservation[]
  strengthExercises: readonly InsightStrengthExercise[]
  findings: readonly CrossDomainFinding[]
  weightGoalId: string | null
}

export type RankedInsight = {
  insight: ProactiveInsight
  magnitude: number
  associationRank: number
  recency: string
}
