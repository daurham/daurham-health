import type { NutritionDayQuality } from './quality.js'

/**
 * PIQ-1.1: source accuracy is not whole-day intake completeness.
 * This is a pure contract; it does not change the deployed maintenance engine.
 */
export const NUTRITION_DAY_COMPLETENESS_STATES = [
  'confirmed_complete', 'probably_complete', 'partial', 'unknown',
] as const
export type NutritionDayCompletenessState = (typeof NUTRITION_DAY_COMPLETENESS_STATES)[number]

export type NutritionDayConfirmation = {
  state: 'complete' | 'partial' | 'unknown'
  /** Opaque revision of canonical included/excluded food entries. */
  entryRevision: string
  /** Separate owner assertion required for a no-food full-day fast. */
  zeroIntakeFast?: boolean
}

export type NutritionDayCompletenessInput = {
  date: string
  /** Local instance health day, not UTC browser date. Null is unverified. */
  today: string | null
  entryRevision: string
  quality: NutritionDayQuality
  confirmation: NutritionDayConfirmation | null
  excludedFromAnalysis?: boolean
}

export type NutritionDayCompletenessAssessment = {
  state: NutritionDayCompletenessState
  eligibleForMaintenance: boolean
  currentDayProvisional: boolean
  confirmationStale: boolean
  isExplicitZeroIntakeFast: boolean
  reason:
    | 'no_confirmation' | 'confirmation_stale' | 'reported_partial'
    | 'reported_unknown' | 'confirmed' | 'confirmed_fast'
    | 'empty_day_requires_fast_confirmation'
  maintenanceExclusion:
    | null | 'unconfirmed_completeness' | 'stale_confirmation' | 'current_day'
    | 'unknown_local_date' | 'source_quality' | 'zero_or_unusual_intake'
    | 'excluded_from_analysis'
}

/** Conservative eligibility gate. No automatic probable-complete inference. */
export function assessNutritionDayCompleteness(
  input: NutritionDayCompletenessInput,
): NutritionDayCompletenessAssessment {
  const currentDayProvisional = input.today != null && input.date >= input.today
  const confirmationStale = input.confirmation != null &&
    (!input.entryRevision.trim() || input.confirmation.entryRevision !== input.entryRevision)
  const fast = input.confirmation?.state === 'complete' &&
    input.confirmation.zeroIntakeFast === true &&
    input.quality.entryCount === 0
  let state: NutritionDayCompletenessState = 'unknown'
  let reason: NutritionDayCompletenessAssessment['reason'] = 'no_confirmation'
  if (confirmationStale) {
    reason = 'confirmation_stale'
  } else if (input.confirmation?.state === 'partial') {
    state = 'partial'
    reason = 'reported_partial'
  } else if (input.confirmation?.state === 'unknown') {
    reason = 'reported_unknown'
  } else if (input.confirmation?.state === 'complete') {
    if (input.quality.entryCount === 0 && !fast) {
      reason = 'empty_day_requires_fast_confirmation'
    } else {
      state = 'confirmed_complete'
      reason = fast ? 'confirmed_fast' : 'confirmed'
    }
  }
  let maintenanceExclusion: NutritionDayCompletenessAssessment['maintenanceExclusion'] = null
  if (input.excludedFromAnalysis) maintenanceExclusion = 'excluded_from_analysis'
  else if (input.today == null) maintenanceExclusion = 'unknown_local_date'
  else if (currentDayProvisional) maintenanceExclusion = 'current_day'
  else if (confirmationStale) maintenanceExclusion = 'stale_confirmation'
  else if (state !== 'confirmed_complete') maintenanceExclusion = 'unconfirmed_completeness'
  else if (fast || input.quality.knownCalories + input.quality.unknownCalories <= 0) maintenanceExclusion = 'zero_or_unusual_intake'
  else if (input.quality.kind !== 'high_confidence') maintenanceExclusion = 'source_quality'
  return {
    state,
    eligibleForMaintenance: maintenanceExclusion == null,
    currentDayProvisional,
    confirmationStale,
    isExplicitZeroIntakeFast: fast && !confirmationStale,
    reason,
    maintenanceExclusion,
  }
}

export function summarizeNutritionCompleteness(
  days: readonly NutritionDayCompletenessAssessment[],
): {
  calendarDays: number
  confirmedDays: number
  completeAndReliableDays: number
  partialDays: number
  unknownDays: number
  probablyCompleteDays: number
} {
  return {
    calendarDays: days.length,
    confirmedDays: days.filter((day) => day.state === 'confirmed_complete').length,
    completeAndReliableDays: days.filter((day) => day.eligibleForMaintenance).length,
    partialDays: days.filter((day) => day.state === 'partial').length,
    unknownDays: days.filter((day) => day.state === 'unknown').length,
    probablyCompleteDays: days.filter((day) => day.state === 'probably_complete').length,
  }
}
