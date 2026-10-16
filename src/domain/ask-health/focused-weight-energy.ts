import { buildMaintenanceState, type MaintenanceEstimate } from '../maintenance.js'
import { addCalendarDays } from '../training-plan.js'
import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'

/**
 * PIQ-4.2 FIRST SLICE — purely descriptive, explicitly bounded weight/intake
 * context for Ask Health. Reuses the existing validated maintenance estimator.
 * No SQL, target mutation, calorie prescriptions, or ad-hoc plateau formula.
 *
 * The owner goal version, current target, competing experiment, live training
 * strength, and clinician-specific safeguards are NOT established by this
 * snapshot. This screen MUST NOT authorize or classify an owner plateau or
 * numerical calorie adjustment. The maintenance estimator's internal
 * no-goal plateau label is intentionally not exposed.
 */
export type FocusedWeightEnergyEvidence = {
  start: string
  end: string
  completeThrough: string
  estimate: MaintenanceEstimate
  qualifiedWholeDayCalories: number
  trainingSessionDays: number
  wellnessCheckinDays: number
  /** Distinguishes "not checked" from a positive safety finding. */
  goalVerification: 'not_checked'
  decisionVerification: 'not_checked'
  strengthPreservation: 'not_verified'
}

const WEIGHT_ENERGY_QUESTION =
  /\b(?:plateau\w*|stall(?:ed|ing|s)?|weight[ -]?loss|losing weight|lose weight|fat[ -]?loss|losing fat|scale(?: weight| fluctuat\w*| not moving)?|weight (?:isn't|is not|hasn't|has not|won't|not) (?:chang\w*|mov\w*)|maintenance calories|observed maintenance|energy balance|calorie deficit|caloric deficit|cut(?:ting)? calories|eat less|metabolic rate|tdee|preserv\w* (?:strength|muscle))\b/i

// A dated question needs *that* interval's observation, never an unrelated
// trailing-28d energy estimate. PIQ-4.2 historical scope is deferred.
const EXPLICIT_HISTORY =
  /\b\d{4}-\d{2}-\d{2}\b|\b(?:yesterday|last week|last month|last year|previous week|previous month|past \d+ days?|last \d+ days?)\b/i

export function focusWeightEnergyContext(input: {
  question: string
  snapshot: HealthIntelligenceSnapshot
  today: string
  includeBroadContext?: boolean
}): FocusedWeightEnergyEvidence | null {
  if (!input.includeBroadContext && !WEIGHT_ENERGY_QUESTION.test(input.question)) return null
  if (EXPLICIT_HISTORY.test(input.question)) return null
  const { snapshot, today } = input
  // No current-day "full" calories or late import assumed.
  const reliableDates = new Set(snapshot.frame.flatMap(day => {
    const o = day.signals['nutrition.calories']
    if (!o || day.date < snapshot.period.start ||
        day.date > snapshot.asOf || day.date >= today ||
        o.dayCompleteness !== 'verified_complete' ||
        o.quality !== 'high_confidence' ||
        !Number.isFinite(o.value) || o.value <= 0 ||
        o.sourceIds.length === 0 || new Set(o.sourceIds).size !== o.sourceIds.length) return []
    return [day.date]
  }))
  // Unknown verification status is NOT "zero logged" or a verified empty day.
  const verified = snapshot.coverage.find(c => c.key === 'nutrition.calories')?.completenessCheck
  if (verified !== 'available') reliableDates.clear()

  // The maintenance engine is the single authority for estimate quality,
  // 28/21/14d selection, alignment, Theil-Sen slope and conservative range.
  // This call deliberately never passes a goal or an adjustment context.
  const maintenance = buildMaintenanceState({
    asOf: snapshot.asOf,
    today, intelligence: snapshot, contexts: [],
    eligibleNutritionDates: reliableDates,
    weightGoal: null,
    adjustmentContext: null,
  })
  const frame = snapshot.frame.filter(d =>
    d.date >= snapshot.period.start && d.date <= maintenance.completeThrough && d.date < today)
  const span = maintenance.estimate.period
  // If no estimate qualified, qualityFor() describes a fallback 28-day
  // window, NOT all verified days in an arbitrary 90-day history selection.
  const expectedStart = span?.start ?? addCalendarDays(maintenance.completeThrough, -27)
  const boundedStart = expectedStart < snapshot.period.start
    ? snapshot.period.start : expectedStart
  const selected = frame.filter(d => d.date >= boundedStart && d.date <= maintenance.completeThrough)
  return {
    start: boundedStart,
    end: span?.end ?? maintenance.completeThrough,
    completeThrough: maintenance.completeThrough,
    estimate: maintenance.estimate,
    qualifiedWholeDayCalories: [...reliableDates].filter(d =>
      d >= boundedStart && d <= maintenance.completeThrough).length,
    trainingSessionDays: selected.filter(d =>
      (d.signals['training.sessions']?.value ?? 0) > 0).length,
    wellnessCheckinDays: selected.filter(d =>
      ['wellness.hunger','wellness.energy','wellness.soreness'].some(key =>
        d.signals[key as 'wellness.hunger' | 'wellness.energy' | 'wellness.soreness'] != null)).length,
    goalVerification: 'not_checked',
    decisionVerification: 'not_checked',
    strengthPreservation: 'not_verified',
  }
}
