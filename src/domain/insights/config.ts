/** Product surfacing heuristics. They are not health, dietary, or medical thresholds. */
export const PROACTIVE_INSIGHTS_VERSION = 'proactive-insights-v1' as const

export const INSIGHT_RESULT_CAP = 5

export const INSIGHTS_EMPTY_COPY = 'Not enough comparable recent evidence for additional insights yet.'

export const ACTIVITY_COMPARISON_DAYS = 21
export const ACTIVITY_MIN_OBSERVED_DAYS = 14
/** Absolute relative change required before an Activity card is shown. */
export const ACTIVITY_MIN_RELATIVE_CHANGE_PCT = 10

export const SLEEP_COMPARISON_NIGHTS = 14
export const SLEEP_MIN_ELIGIBLE_NIGHTS = 7
/** Absolute average-duration difference required before a Sleep card is shown. */
export const SLEEP_MIN_DURATION_DELTA_MINUTES = 30

export const NUTRITION_COMPARISON_DAYS = 14
export const NUTRITION_MIN_LOGGED_DAYS = 7
export const NUTRITION_MIN_COVERAGE_PCT = 50
export const NUTRITION_CALORIE_MIN_DELTA = 150
export const NUTRITION_PROTEIN_MIN_DELTA = 15
export const NUTRITION_MIN_RELATIVE_CHANGE_PCT = 10

export const TRAINING_COMPARISON_DAYS = 21
/** Absolute change in logged sessions per week. */
export const TRAINING_MIN_SESSIONS_PER_WEEK = 1

/** Absolute Body weight slope, after conversion to pounds per week. */
export const BODY_WEIGHT_MIN_SLOPE_LB_PER_WEEK = 0.25

export const CANONICAL_TRAINING_SESSION_TYPES = ['programmed', 'ad_hoc', 'experiment'] as const

export const INSIGHT_TIERS = {
  cross_domain_pattern: 1,
  domain_trend: 2,
  sleep_duration: 3,
  activity_change: 4,
  nutrition_change: 5,
  training_frequency: 6,
} as const
