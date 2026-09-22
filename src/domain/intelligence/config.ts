/** Product heuristics for surfacing patterns. They are not significance tests. */
export const INTELLIGENCE_TIMEZONE = 'America/Phoenix'

export const SPEARMAN_MIN_PAIRS = 20
export const BODY_NUTRITION_MIN_MEASUREMENTS = 10
export const GROUP_MIN_DAYS = 5

export const BODY_NUTRITION_WINDOW_DAYS = 14
export const BODY_NUTRITION_MIN_LOGGED_DAYS = 7

export const RHO_WEAK = 0.2
export const RHO_MODERATE = 0.4
export const RHO_STRONG = 0.6

export const SAMPLE_TIER_MODERATE = 30
export const SAMPLE_TIER_LARGER = 60

export const RELATIONSHIP_IDS = [
  'sleep_activity:sleep_minutes:steps',
  'sleep_activity:sleep_minutes:active_energy_kcal',
  'sleep_activity:sleep_minutes:exercise_minutes',
  'sleep_activity:sleep_minutes:resting_heart_rate_bpm',
  'sleep_training:sleep_minutes:effort',
  'sleep_training:sleep_minutes:pain_level',
  'sleep_training:sleep_minutes',
  'nutrition_training:logged_day_groups',
  'nutrition_activity:calories:steps',
  'nutrition_activity:calories:active_energy_kcal',
  'nutrition_activity:protein:steps',
  'nutrition_activity:protein:active_energy_kcal',
  'body_nutrition:preceding_calories',
  'body_nutrition:preceding_protein',
  'body_nutrition:period_context',
  'activity_training:steps',
] as const

export type RelationshipId = (typeof RELATIONSHIP_IDS)[number]
