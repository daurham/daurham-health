export const ACTIVITY_TIMEZONE = 'America/Phoenix'

export const ACTIVITY_METRICS = [
  'steps_count',
  'active_energy_kcal',
  'exercise_minutes',
  'resting_heart_rate_bpm',
] as const
export type ActivityMetricKey = (typeof ACTIVITY_METRICS)[number]

export const ACTIVITY_UNSUPPORTED_METRICS = ['walking_running_distance_m'] as const
export type ActivityUnsupportedMetricKey = (typeof ACTIVITY_UNSUPPORTED_METRICS)[number]

export const ACTIVITY_SHORT_TERM_DAYS = 7
export const ACTIVITY_SHORT_TERM_MIN_OBSERVED = 4
