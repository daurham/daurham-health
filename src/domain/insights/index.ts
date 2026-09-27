export {
  ACTIVITY_MIN_OBSERVED_DAYS,
  ACTIVITY_MIN_RELATIVE_CHANGE_PCT,
  BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK,
  INSIGHT_RESULT_CAP,
  INSIGHTS_EMPTY_COPY,
  NUTRITION_CALORIE_MIN_DELTA,
  NUTRITION_MIN_COVERAGE_PCT,
  NUTRITION_MIN_LOGGED_DAYS,
  NUTRITION_MIN_RELATIVE_CHANGE_PCT,
  NUTRITION_PROTEIN_MIN_DELTA,
  PROACTIVE_INSIGHTS_VERSION,
  SLEEP_MIN_DURATION_DELTA_MINUTES,
  SLEEP_MIN_ELIGIBLE_NIGHTS,
  TRAINING_MIN_SESSIONS_PER_WEEK,
} from './config.js'
export { deriveProactiveInsights, insightDetectors } from './derive.js'
export {
  detectActivityChange,
  detectBodyWeightTrend,
  detectCrossDomainInsights,
  detectNutritionChange,
  detectSleepDurationChange,
  detectStrengthTrend,
  detectTrainingFrequencyChange,
} from './detectors.js'
export type {
  InsightDetectorInput,
  InsightDetectorResult,
  InsightDetectorStatus,
  InsightEvidence,
  InsightNutritionDay,
  InsightSleepNight,
  InsightStrengthExercise,
  InsightTrainingSession,
  ProactiveInsight,
  ProactiveInsights,
} from './types.js'
