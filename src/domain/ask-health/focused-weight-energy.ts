import { buildMaintenanceState, type MaintenanceEstimate, type ScaleNoiseFactor } from '../maintenance.js'
import { addCalendarDays } from '../training-plan.js'
import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'
import { screenProteinTrainingContext, type ProteinTrainingContext } from './protein-training-context.js'
import { UNCHECKED_WEIGHT_ENERGY_SETTINGS, type WeightEnergyCurrentSettings } from './weight-energy-current-settings.js'
import { UNCHECKED_EXERCISE_PRESERVATION, type ExercisePreservationReview } from './exercise-preservation-review.js'
import { UNCHECKED_WEIGHT_GOAL_OBSERVATION, type WeightGoalObservation } from './weight-goal-observation.js'
import { UNCHECKED_PRIMARY_WEIGHT_GOAL_PRIORITY, type PrimaryWeightGoalPriority } from './primary-weight-goal-intent.js'
import { UNCHECKED_EXPERIMENT_TIMING, type ExperimentTimingReview } from './experiment-timing-review.js'
import { UNCHECKED_EXPERIMENT_OUTCOME, type ExperimentOutcomeReview } from './experiment-outcome-review.js'
import { UNCHECKED_RECENT_RESULT, type RecentExperimentResultReview } from './recent-experiment-result-review.js'
import { UNCHECKED_WEIGHT_ENERGY_RECONCILIATION, type WeightEnergyReconciliation } from './weight-energy-reconciliation.js'
import { UNCHECKED_CANONICAL_GOAL_STATUS, type CanonicalGoalStatusReview } from './canonical-goal-status-review.js'

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
  /** Bounded descriptions only; no inferred strength retention or protein target. */
  proteinTrainingContext: ProteinTrainingContext
  /**
   * PIQ-4.2 second slice: Only maintenance-engine comparisons of owner-
   * verified sodium/carb days with matching calorie entry IDs. These are
   * descriptive alternative explanations, never verified weight causes.
   * Hydration/bowel signals need their own stronger completeness contracts.
   */
  qualifiedScaleContext: Array<Pick<ScaleNoiseFactor,
    'id' | 'kind' | 'title' | 'detail' | 'dates' | 'detailPath'>>
  /** Read-time current target/experiment revision status, NOT permission to adjust calories. */
  currentSettings: WeightEnergyCurrentSettings
  /** Read-only canonical matched-exercise decline flags, never strength-retention proof. */
  exercisePreservationReview: ExercisePreservationReview
  /** Repeated saved weights vs versioned goal; NOT a goal status or advice. */
  weightGoalObservation: WeightGoalObservation
  /** Effective-dated owner priority; never an inferred desire to lose weight. */
  primaryGoalPriority: PrimaryWeightGoalPriority
  /** Active vs imminently scheduled experiments; never an intervention gate. */
  experimentTimingReview: ExperimentTimingReview
  /** Typed protocol outcome relevance, never an effect estimate. */
  experimentOutcomeReview: ExperimentOutcomeReview
  /** Recent finalized result integrity, not experiment efficacy. */
  recentExperimentResultReview: RecentExperimentResultReview
  /** Read-only cross-signal reconciliation; never a calorie decision gate. */
  reconciliation: WeightEnergyReconciliation
  /** Exact-ID/version current Goal Control report; measurement sources NOT locked. */
  canonicalGoalStatus: CanonicalGoalStatusReview
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
  /\b\d{4}-\d{2}-\d{2}\b|\b(?:yesterday|this week|this month|last week|last month|last year|previous week|previous month|past \d+ days?|last \d+ days?)\b/i

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
    proteinTrainingContext: screenProteinTrainingContext({
      snapshot, start: boundedStart, end: maintenance.completeThrough,
      today, verifiedCalorieDates: reliableDates,
    }),
    // Reuse the engine's actual 3d-vs-prior-7d, whole-day-verified,
    // source-ID-matching sodium/carb tests. Never copy its less-qualified
    // event-count water/bowel contrasts into an Ask Health weight conclusion.
    qualifiedScaleContext: maintenance.noiseFactors
      .filter(item => (item.kind === 'sodium' || item.kind === 'carbohydrate') &&
        item.dates.every(date => date >= boundedStart && date <= maintenance.completeThrough))
      .map(({id,kind,title,detail,dates,detailPath}) => ({
        id,kind,title,detail,dates,detailPath,
      })),
    currentSettings: {...UNCHECKED_WEIGHT_ENERGY_SETTINGS},
    exercisePreservationReview: {...UNCHECKED_EXERCISE_PRESERVATION},
    weightGoalObservation: {...UNCHECKED_WEIGHT_GOAL_OBSERVATION},
    primaryGoalPriority: {...UNCHECKED_PRIMARY_WEIGHT_GOAL_PRIORITY},
    experimentTimingReview: {...UNCHECKED_EXPERIMENT_TIMING},
    experimentOutcomeReview: {...UNCHECKED_EXPERIMENT_OUTCOME},
    recentExperimentResultReview: {...UNCHECKED_RECENT_RESULT},
    reconciliation: {...UNCHECKED_WEIGHT_ENERGY_RECONCILIATION},
    canonicalGoalStatus: {...UNCHECKED_CANONICAL_GOAL_STATUS},
    goalVerification: 'not_checked',
    decisionVerification: 'not_checked',
    strengthPreservation: 'not_verified',
  }
}
