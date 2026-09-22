export const HEALTH_DOMAINS = ['training', 'body', 'nutrition', 'activity', 'sleep'] as const
export type HealthDomain = (typeof HEALTH_DOMAINS)[number]

export const PERFORMANCE_TYPES = [
  'loaded_reps',
  'bodyweight_reps',
  'assisted_reps',
  'timed',
  'distance',
  'other',
] as const
export type PerformanceType = (typeof PERFORMANCE_TYPES)[number]

export const ANALYTICS_LOAD_TYPES = ['external', 'bodyweight', 'combined', 'assistance', 'none'] as const
export type AnalyticsLoadType = (typeof ANALYTICS_LOAD_TYPES)[number]

export const ANALYTICS_REP_MODES = ['standard', 'per_side'] as const
export type AnalyticsRepMode = (typeof ANALYTICS_REP_MODES)[number]

export const PROGRESS_RANGES = ['30d', '90d', '6m', '1y', 'all'] as const
export type ProgressRange = (typeof PROGRESS_RANGES)[number]

export const METRIC_STATUSES = ['available', 'insufficient_data', 'unsupported', 'not_applicable'] as const
export type MetricStatus = (typeof METRIC_STATUSES)[number]

export type AvailableMetric<T> = {
  status: 'available'
  value: T
  observations: number
  basis?: string
}

export type InsufficientMetric = {
  status: 'insufficient_data'
  observations: number
  required?: number
}

export type UnsupportedMetric = {
  status: 'unsupported'
  observations?: number
}

export type NotApplicableMetric = {
  status: 'not_applicable'
  observations?: number
}

export type MetricResult<T> =
  | AvailableMetric<T>
  | InsufficientMetric
  | UnsupportedMetric
  | NotApplicableMetric

export function availableMetric<T>(value: T, observations: number, basis?: string): AvailableMetric<T> {
  return basis ? { status: 'available', value, observations, basis } : { status: 'available', value, observations }
}

export function insufficientMetric(observations: number, required?: number): InsufficientMetric {
  return required == null ? { status: 'insufficient_data', observations } : { status: 'insufficient_data', observations, required }
}

export function unsupportedMetric(observations = 0): UnsupportedMetric {
  return { status: 'unsupported', observations }
}

export function notApplicableMetric(observations = 0): NotApplicableMetric {
  return { status: 'not_applicable', observations }
}

export type CanonicalEvidence = {
  domain: HealthDomain
  sessionId?: string
  sessionExerciseId?: string
  setId?: string
  exerciseId?: string
  measurementId?: string
  measurementSessionId?: string
  entryId?: string
  mealGroupId?: string
  date?: string
  setNumber?: number
  loadKg?: number | null
  reps?: number | null
  strengthReps?: number | null
  durationSec?: number | null
  leftReps?: number | null
  rightReps?: number | null
  leftDurationSec?: number | null
  rightDurationSec?: number | null
}

export type ProgressExerciseDefinition = {
  id: string
  name: string
  externalId: string | null
  performanceType: PerformanceType
  analyticsLoadType: AnalyticsLoadType
  analyticsRepMode: AnalyticsRepMode
  measurementKind: string
  unilateral: boolean
}

export type CanonicalSetRecord = {
  setId: string
  sessionId: string
  sessionExerciseId: string
  exerciseId: string
  sessionDate: string
  sessionCreatedAt: string
  sessionExercisePosition: number
  setNumber: number
  setType: string
  loadState: string
  weightKg: number | null
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
}

export type AnalyzableWorkingSet = CanonicalSetRecord & {
  weightKg: number
  reps: number
}

export type AnalyzableTimedSet = CanonicalSetRecord & {
  weightKg: number
  durationSec: number
}

export type EstimatedStrengthPoint = {
  value: number
  formula: 'epley'
  confidence: 'high' | 'low'
  sourceSet: AnalyzableWorkingSet
}

export type SessionStrengthPoint = {
  sessionId: string
  sessionExerciseId: string
  exerciseId: string
  date: string
  estimated1RmKg: number
  sourceSet: AnalyzableWorkingSet
}

export type LatestPerformance = {
  sessionId: string
  sessionExerciseId: string
  exerciseId: string
  date: string
  loadKg: number
  reps: number | null
  durationSec: number | null
  estimated1RmKg: number | null
  sourceSetId: string
  leftReps: number | null
  rightReps: number | null
}

export type FrontierPoint = {
  setId: string
  sessionId: string
  date: string
  loadKg: number
  reps: number | null
  durationSec: number | null
}

export type BodyObservation = {
  measurementId: string
  measurementSessionId: string
  key: string
  value: number
  unit: string
  valueKind: string
  measuredAt: string
  timezone: string | null
  calendarDate: string
}

export type ProgressWorkoutSummary = {
  sessionId: string
  sessionDate: string
  createdAt: string
  templateName?: string | null
  routineCode?: string | null
  effort?: number | null
  durationMin?: number | null
}

export const PR_ACHIEVEMENTS = [
  'load',
  'rep_at_load',
  'duration_at_load',
  'estimated_strength',
  'frontier',
  'session_volume',
] as const
export type PrAchievement = (typeof PR_ACHIEVEMENTS)[number]

export type PerformanceBestEvent = {
  kind: 'performance_best'
  domain: 'training'
  exerciseId: string
  date: string
  sourceSessionId: string
  sourceSetId: string
  sourceSessionExerciseId: string
  achievements: PrAchievement[]
  performed: {
    loadKg: number
    reps?: number | null
    durationSec?: number | null
    leftReps?: number | null
    rightReps?: number | null
  }
  evidence: CanonicalEvidence[]
}

export type ProgressionPattern =
  | 'load_progression'
  | 'rep_progression'
  | 'load_and_rep_progression'
  | 'work_capacity_progression'
  | 'stable'
  | 'insufficient_data'
  | 'unknown'

export type ExerciseTrendDirection = 'improving' | 'stable' | 'decreasing'

export type ProgressFinding = {
  kind: string
  domain: HealthDomain
  exerciseId?: string
  metric?: string
  achievements?: PrAchievement[]
  direction?: string
  changePercent?: number
  currentValue?: number
  previousValue?: number
  slopePerWeek?: number
  observationCount?: number
  currentWorkouts?: number
  previousWorkouts?: number
  loggedDays?: number
  calendarDays?: number
  coveragePct?: number
  average?: number
  observedDays?: number
  nutrient?: string
  evidence: CanonicalEvidence[]
}
