export const APPLE_HEALTH_PARSER_VERSION = '1.0.0'
export const APPLE_HEALTH_SOURCE_KEY = 'apple_health'
export const APPLE_HEALTH_COMMIT_BATCH = 400

export const ACTIVITY_SAMPLE_ENTITY = 'activity_sample'
export const SLEEP_INTERVAL_ENTITY = 'sleep_interval'
export const ACTIVITY_WORKOUT_ENTITY = 'activity_workout'

export const ACTIVITY_METRICS = [
  'steps',
  'active_energy',
  'exercise_time',
  'walking_running_distance',
  'resting_heart_rate',
] as const

export type ActivityMetricKey = (typeof ACTIVITY_METRICS)[number]

/** Canonical units: steps count, energy kcal, exercise minutes, distance meters, HR bpm. */
export const CANONICAL_UNITS = {
  steps: 'count',
  active_energy: 'kcal',
  exercise_time: 'min',
  walking_running_distance: 'm',
  resting_heart_rate: 'bpm',
} as const

export const SLEEP_STAGES = ['in_bed', 'asleep', 'awake', 'core', 'deep', 'rem', 'unsupported'] as const
export type SleepStage = (typeof SLEEP_STAGES)[number]

export const SKIP_REASONS = ['body_owned', 'nutrition_owned', 'unsupported', 'malformed'] as const
export type AppleHealthSkipReason = (typeof SKIP_REASONS)[number]

export const HK_QUANTITY_TYPES: Record<string, ActivityMetricKey> = {
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active_energy',
  HKQuantityTypeIdentifierAppleExerciseTime: 'exercise_time',
  HKQuantityTypeIdentifierDistanceWalkingRunning: 'walking_running_distance',
  HKQuantityTypeIdentifierRestingHeartRate: 'resting_heart_rate',
}

export const HK_SLEEP_TYPE = 'HKCategoryTypeIdentifierSleepAnalysis'

export const HK_BODY_OWNED_TYPES = new Set([
  'HKQuantityTypeIdentifierBodyMass',
  'HKQuantityTypeIdentifierBodyFatPercentage',
  'HKQuantityTypeIdentifierLeanBodyMass',
  'HKQuantityTypeIdentifierBodyMassIndex',
  'HKQuantityTypeIdentifierHeight',
  'HKQuantityTypeIdentifierWaistCircumference',
  'HKQuantityTypeIdentifierBodyTemperature',
  'HKQuantityTypeIdentifierBodyWaterMass',
  'HKQuantityTypeIdentifierLeanBodyMassPercentage',
])

export function isNutritionOwnedType(appleType: string): boolean {
  return appleType.startsWith('HKQuantityTypeIdentifierDietary')
}

export function isBodyOwnedType(appleType: string): boolean {
  return HK_BODY_OWNED_TYPES.has(appleType)
}
