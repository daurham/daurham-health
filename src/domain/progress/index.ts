export { PROGRESS_ANALYTICS_CONFIG } from './config.js'
export {
  availableMetric,
  insufficientMetric,
  notApplicableMetric,
  unsupportedMetric,
  HEALTH_DOMAINS,
  PERFORMANCE_TYPES,
  ANALYTICS_LOAD_TYPES,
  ANALYTICS_REP_MODES,
  PROGRESS_RANGES,
  PR_ACHIEVEMENTS,
  type HealthDomain,
  type PerformanceType,
  type AnalyticsLoadType,
  type AnalyticsRepMode,
  type ProgressRange,
  type MetricResult,
  type CanonicalEvidence,
  type ProgressExerciseDefinition,
  type CanonicalSetRecord,
  type AnalyzableWorkingSet,
  type BodyObservation,
  type ProgressFinding,
  type PerformanceBestEvent,
  type LatestPerformance,
  type PrAchievement,
  type FrontierPoint,
} from './types.js'
export { trailingPeriod, isProgressRange, dateInInclusiveRange } from './periods.js'
export {
  comparePeriod,
  buildProgressCompare,
  buildSinceCheckpointCompare,
  nearestBodyObservationWithinDays,
  latestExerciseAppearanceOnOrBefore,
  type ComparePeriod,
  type ProgressCompare,
  type CompareExercise,
  type CompareFinding,
} from './compare.js'
export {
  checkpointCreateSchema,
  checkpointPatchSchema,
  type ProgressCheckpoint,
} from './checkpoints.js'
export {
  epleyEstimated1RmKg,
  sessionStrengthPoint,
  asAnalyzableLoadedRepSet,
  asAnalyzableTimedSet,
  strengthRepsForSet,
  volumeRepsForSet,
} from './exercise-performance.js'
export { performanceFrontier, expandsFrontier, timedPerformanceFrontier, expandsTimedFrontier } from './frontier.js'
export { performanceBestsForExercise } from './prs.js'
export { estimatedStrengthTrend, progressionPattern } from './exercise-trend.js'
export { bodyWeightTrend, compareSparseBodyMetric, latestBodyObservation } from './body-trend.js'
export { relativeStrength } from './relative-strength.js'
export { trainingConsistency } from './consistency.js'
export { buildProgressOverview, type ProgressCanonicalInput, type ProgressOverview } from './overview.js'
export {
  emptyNutritionPeriodSummary,
  nutritionCalorieSeries,
  nutritionCoverageDiffers,
  nutritionDailyObservations,
  nutritionDayEventData,
  nutritionFindings,
  nutritionPeriodSummary,
  type NutritionCaloriesPeriodStat,
  type NutritionDailyObservation,
  type NutritionDayEntrySnapshot,
  type NutritionDayEventData,
  type NutritionMacroPeriodStat,
  type NutritionNutrientObservation,
  type NutritionPeriodSummary,
} from './nutrition.js'
export {
  TIMELINE_DOMAINS,
  TIMELINE_EVENT_KINDS,
  TIMELINE_FOCUSES,
  buildProgressTimeline,
  groupedTimelineDays,
  isTimelineFocus,
  performanceBestsForSession,
  timelineEventsForFocus,
  timelineSeriesForFocus,
  type ProgressTimeline,
  type TimelineBodyMeasurementEvent,
  type TimelineDomain,
  type TimelineEvent,
  type TimelineEventKind,
  type TimelineFocus,
  type TimelinePerformanceBestEvent,
  type TimelineTrainingSessionEvent,
  type TimelineCheckpointEvent,
  type TimelineNutritionDayEvent,
  type TimelineActivityDayEvent,
  type TimelineActivityWorkoutEvent,
  type TimelineSleepNightEvent,
} from './timeline.js'
export { classificationForExternalId, supportsTimedExternal } from './exercise-classification.js'
export { calendarDateFromInstant, utcCalendarDateFromNow } from './dates.js'
