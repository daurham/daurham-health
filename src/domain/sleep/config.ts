export const SLEEP_SESSION_GAP_MINUTES = 90
export const SLEEP_CALCULATION_VERSION = 'sleep-night-candidate-v1'
export const SLEEP_NIGHT_CALCULATION_VERSION = 'sleep-night-v1'
export const SLEEP_TIMEZONE = 'America/Phoenix'

export const MIN_ANALYSIS_SLEEP_MINUTES = 240
export const MIN_STAGE_COVERAGE_PCT = 90

export const SLEEP_ANALYTICS_CATEGORIES = [
  'in_bed',
  'awake',
  'asleep_unspecified',
  'core',
  'deep',
  'rem',
] as const
export type SleepAnalyticsCategory = (typeof SLEEP_ANALYTICS_CATEGORIES)[number]

export const SLEEP_ASLEEP_CATEGORIES = ['core', 'deep', 'rem', 'asleep_unspecified'] as const
export type SleepAsleepCategory = (typeof SLEEP_ASLEEP_CATEGORIES)[number]

export const SLEEP_EXCLUSIVE_STAGES = ['core', 'deep', 'rem'] as const

export const SLEEP_GAP_BOUNDARIES_MINUTES = [30, 60, 90, 120] as const

export const SLEEP_SHORT_TERM_NIGHTS = 7
export const SLEEP_SHORT_TERM_MIN_OBSERVED = 4

export const SLEEP_PARTIAL_SOURCE_RATIO = 0.6
export const SLEEP_PARTIAL_SOURCE_MIN_DIFF_MINUTES = 90

export const SLEEP_SOURCE_PRIORITY = ['apple_watch', 'circular', 'sleep_cycle', 'iphone'] as const
export type KnownSleepSourceKey = (typeof SLEEP_SOURCE_PRIORITY)[number]
