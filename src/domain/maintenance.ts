import type { DailyContext, DailyContextTagKey } from './context.js'
import type {
  HealthIntelligenceSnapshot,
  IntelligenceConfidence,
  IntelligenceFrameDay,
  IntelligenceObservation,
  IntelligenceSignalKey,
} from './intelligence/shared.js'
import { calendarDaysBetween } from './progress/dates.js'
import { theilSenSlopePerDay } from './progress/statistics.js'
import { addCalendarDays } from './training-plan.js'
import type { MaintenancePerformanceSafety } from './maintenance-performance.js'
import type { DecisionRevisionStatus } from './maintenance-revision.js'

export const MAINTENANCE_ENGINE_VERSION = 'maintenance-engine-v1' as const
export const KCAL_PER_KG_BODY_MASS_CHANGE = 7700
export const MAINTENANCE_WINDOWS = [28, 21, 14] as const

export type WeightGoalDirection = 'lose' | 'gain' | 'maintain' | 'unknown'

export type MaintenanceWeightGoal = {
  goalId: string
  goalVersionId: string
  label: string
  targetState: string
  direction: WeightGoalDirection
}

export type MaintenanceEvidenceQuality = {
  nutrition: {
    state: 'sufficient' | 'limited' | 'insufficient'
    reliableDays: number
    highConfidenceDays: number
    estimateHeavyDays: number
    unknownDays: number
    calendarDays: number
    coveragePct: number
  }
  body: {
    state: 'sufficient' | 'limited' | 'insufficient'
    usedMeasurements: number
    usualMeasurements: number
    unknownMeasurements: number
    differentConditionMeasurements: number
    spanDays: number
  }
}

export type MaintenanceEstimate = {
  state: 'available' | 'insufficient_evidence'
  period: { start: string; end: string; days: number } | null
  averageIntakeKcal: number | null
  observedMaintenanceKcal: number | null
  rangeLowKcal: number | null
  rangeHighKcal: number | null
  weightSlopeKgPerWeek: number | null
  weightSlopePctPerWeek: number | null
  latestWeightKg: number | null
  confidence: IntelligenceConfidence
  quality: MaintenanceEvidenceQuality
  explanation: string
}

export type ScaleNoiseFactor = {
  id: string
  kind: 'sodium' | 'carbohydrate' | 'hydration' | 'bowel' | 'context'
  title: string
  detail: string
  dates: string[]
  detailPath: string
}

export type PlateauState =
  | 'insufficient_evidence'
  | 'not_applicable'
  | 'trend_in_goal_direction'
  | 'trend_away_from_goal'
  | 'stable_at_maintenance'
  | 'noise_obscured'
  | 'possible_plateau'
  | 'plateau_likely'

export type PlateauAssessment = {
  state: PlateauState
  headline: string
  detail: string
  goalDirection: WeightGoalDirection
  goalUnmet: boolean
}

export type MaintenanceInterventionKind =
  | 'hold_course'
  | 'improve_nutrition_evidence'
  | 'improve_weigh_in_consistency'
  | 'review_intake_adjustment'
  | 'review_activity_adjustment'
  | 'review_goal_plan'

export type MaintenanceIntervention = {
  id: string
  kind: MaintenanceInterventionKind
  priority: 'primary' | 'secondary'
  title: string
  detail: string
  detailPath: string
  suggestedDeltaKcal: number | null
}

export type MaintenanceCalibrationSuggestion = {
  eligible: boolean
  title: string
  why: string
  durationDays: number
  requiredNutritionDays: number
  requiredWeightMeasurements: number
  linkedGoalId: string | null
  linkedGoalVersionId: string | null
  evidenceRefs: string[]
}

export type MaintenanceEvidenceExplanationItem = {
  status: 'well_sampled' | 'limited' | 'insufficient' | 'likely' | 'possible' | 'not_applicable' | 'review_only' | 'withheld'
  detail: string
}

export type MaintenanceEvidenceExplanation = {
  nutrition: MaintenanceEvidenceExplanationItem
  weightTrend: MaintenanceEvidenceExplanationItem
  plateau: MaintenanceEvidenceExplanationItem
  calorieDecision: MaintenanceEvidenceExplanationItem
}

export type CalorieAdjustmentSafety = {
  status: 'review_possible' | 'blocked'
  reasons: string[]
  /** A screening threshold, NOT a measured minimum energy need or clinical prescription. */
  screeningFloorKcal: number | null
  proposedTargetKcal: number | null
  recentCheckinDays: number
}

export type MaintenancePhysiologyScreen = {
  /** The Health Profile is a CURRENT owner report; do not reuse for historical as-of decisions. */
  status: 'available' | 'unavailable'
  asOf: string
  ageYears: number | null
  heightCm: number | null
  /** Count only self-reported active or uncertain conditions, not an inferred diagnosis. */
  activeOrUncertainConditionCount: number
}

export type MaintenanceAdjustmentContext = {
  /** Read-time current target, never inferred from partially logged intake. */
  currentCalorieTarget: number | null
  /** Active or imminently scheduled owner experiments. */
  activeExperimentCount: number
  /** Optimistic revision of current target, goals and experiments from one SQL view. */
  decisionRevision?: string | null
  revisionStatus?: DecisionRevisionStatus
  /** Canonical exact-exercise trends and active goal urgency, separately verified. */
  performance?: MaintenancePerformanceSafety | null
  physiology?: MaintenancePhysiologyScreen | null
  /** Any failed read is unknown, not equivalent to zero experiments. */
  status: 'available' | 'unavailable'
}

export type MaintenanceState = {
  version: typeof MAINTENANCE_ENGINE_VERSION
  asOf: string
  completeThrough: string
  estimate: MaintenanceEstimate
  plateau: PlateauAssessment
  noiseFactors: ScaleNoiseFactor[]
  interventions: MaintenanceIntervention[]
  calibration: MaintenanceCalibrationSuggestion
  calorieAdjustmentSafety: CalorieAdjustmentSafety
  evidenceExplanation: MaintenanceEvidenceExplanation
  /** Valid only for a confirmed current-settings snapshot; never grants permission itself. */
  decisionRevision?: string | null
}

export type BuildMaintenanceInput = {
  asOf: string
  today: string | null
  intelligence: HealthIntelligenceSnapshot
  contexts: readonly DailyContext[]
  weightGoal?: MaintenanceWeightGoal | null
  adjustmentContext?: MaintenanceAdjustmentContext | null
  /** Required verified owner full-day whitelist; empty means NO eligible days.
   * Source quality of individual food entries cannot establish day completeness.
   * The server reads this independently; failures must supply an empty Set. */
  eligibleNutritionDates: ReadonlySet<string>
}

type WindowEvidence = {
  days: number
  start: string
  end: string
  calories: IntelligenceObservation[]
  highConfidenceCalories: number
  estimateHeavyCalories: number
  unknownCalories: number
  weights: IntelligenceObservation[]
  usualWeights: IntelligenceObservation[]
  unknownWeights: IntelligenceObservation[]
  differentWeights: IntelligenceObservation[]
  usedWeights: IntelligenceObservation[]
  weightSpanDays: number
  /** A valid count alone does not establish temporal representativeness. */
  aligned: boolean
  alignmentReason: string | null
  leastNutritionDaysPerWeek: number
  firstLastGapDays: { first: number | null; last: number | null }
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function signal(
  frame: readonly IntelligenceFrameDay[],
  key: IntelligenceSignalKey,
  start: string,
  end: string,
): IntelligenceObservation[] {
  return frame
    .filter((day) => day.date >= start && day.date <= end)
    .flatMap((day) => day.signals[key] ? [day.signals[key]!] : [])
}

function reliableNutrition(observation: IntelligenceObservation): boolean {
  return (
    observation.provenance !== 'unknown' &&
    observation.quality != null &&
    observation.quality !== 'unknown' &&
    observation.quality !== 'estimate_heavy'
  )
}

function weightQuality(observation: IntelligenceObservation): 'usual' | 'unknown' | 'different_conditions' {
  if (observation.quality === 'usual') return 'usual'
  if (observation.quality === 'different_conditions') return 'different_conditions'
  return 'unknown'
}

function spanDays(items: readonly IntelligenceObservation[]): number {
  if (items.length < 2) return 0
  const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date))
  return calendarDaysBetween(ordered[0]!.date, ordered[ordered.length - 1]!.date)
}

function alignmentForWindow(input: {
  start: string
  end: string
  days: number
  calories: readonly IntelligenceObservation[]
  usedWeights: readonly IntelligenceObservation[]
}): Pick<WindowEvidence, 'aligned' | 'alignmentReason' | 'leastNutritionDaysPerWeek' | 'firstLastGapDays'> {
  const calorieDates = new Set(input.calories.map((item) => item.date))
  const blocks: number[] = []
  for (let offset = 0; offset < input.days; offset += 7) {
    let count = 0
    for (let day = offset; day < Math.min(offset + 7, input.days); day += 1) {
      if (calorieDates.has(addCalendarDays(input.start, day))) count++
    }
    blocks.push(count)
  }
  const leastNutritionDaysPerWeek = Math.min(...blocks)
  const sortedCalories = [...input.calories].sort((a, b) => a.date.localeCompare(b.date))
  const sortedWeights = [...input.usedWeights].sort((a, b) => a.date.localeCompare(b.date))
  const first = sortedCalories[0] && sortedWeights[0]
    ? Math.abs(calendarDaysBetween(sortedCalories[0].date, sortedWeights[0].date)) : null
  const lastCalorie = sortedCalories[sortedCalories.length - 1]
  const lastWeight = sortedWeights[sortedWeights.length - 1]
  const last = lastCalorie && lastWeight
    ? Math.abs(calendarDaysBetween(lastCalorie.date, lastWeight.date)) : null
  const midpoint = addCalendarDays(input.start, Math.floor(input.days / 2))
  const earlyWeights = sortedWeights.filter((item) => item.date < midpoint).length
  const lateWeights = sortedWeights.filter((item) => item.date >= midpoint).length
  // A full 7-day block must contain >=3 verified days. Even a 65% aggregate
  // can otherwise hide an entire omitted week; then the robust weight slope
  // and the mean intake describe different time periods.
  const alignmentReason = leastNutritionDaysPerWeek < 3
    ? 'Verified calorie days are concentrated unevenly, with fewer than three reliable days in at least one seven-day block.'
    : first == null || last == null || first > 4 || last > 4
      ? 'The earliest or latest calorie and weight observations are more than four days apart, so their time windows are not comparable.'
      : earlyWeights < 2 || lateWeights < 2
        ? 'Comparable weight measurements are concentrated on one side of the intake window.'
        : null
  return {
    aligned: alignmentReason == null,
    alignmentReason,
    leastNutritionDaysPerWeek,
    firstLastGapDays: { first, last },
  }
}

function windowEvidence(
  frame: readonly IntelligenceFrameDay[],
  completeThrough: string,
  days: number,
  eligibleNutritionDates?: ReadonlySet<string>,
): WindowEvidence {
  const start = addCalendarDays(completeThrough, -(days - 1))
  const calorieAll = signal(frame, 'nutrition.calories', start, completeThrough)
    .filter((item) => eligibleNutritionDates?.has(item.date) === true)
  const calories = calorieAll.filter(reliableNutrition)
  const weights = signal(frame, 'body.weight_kg', start, completeThrough)
  const usualWeights = weights.filter((item) => weightQuality(item) === 'usual')
  const unknownWeights = weights.filter((item) => weightQuality(item) === 'unknown')
  const differentWeights = weights.filter((item) => weightQuality(item) === 'different_conditions')
  const usualSpan = spanDays(usualWeights)
  const usedWeights =
    usualWeights.length >= 5 && usualSpan >= 12
      ? usualWeights
      : [...usualWeights, ...unknownWeights].sort((a, b) => a.date.localeCompare(b.date))
  return {
    days,
    start,
    end: completeThrough,
    calories,
    highConfidenceCalories: calorieAll.filter((item) => item.quality === 'high_confidence').length,
    estimateHeavyCalories: calorieAll.filter((item) => item.quality === 'estimate_heavy').length,
    unknownCalories: calorieAll.filter((item) => item.quality == null || item.quality === 'unknown' || item.provenance === 'unknown').length,
    weights,
    usualWeights,
    unknownWeights,
    differentWeights,
    usedWeights,
    weightSpanDays: spanDays(usedWeights),
    ...alignmentForWindow({ start, end: completeThrough, days, calories, usedWeights }),
  }
}

function usableWindow(evidence: WindowEvidence): boolean {
  const requiredCalories = Math.max(10, Math.ceil(evidence.days * 0.65))
  return (
    evidence.calories.length >= requiredCalories &&
    evidence.usedWeights.length >= 5 &&
    evidence.weightSpanDays >= 12 &&
    evidence.aligned
  )
}

function robustMean(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const ordered = [...values].sort((a, b) => a - b)
  if (ordered.length < 10) {
    return ordered.reduce((sum, value) => sum + value, 0) / ordered.length
  }
  const trim = Math.max(1, Math.floor(ordered.length * 0.1))
  const kept = ordered.slice(trim, ordered.length - trim)
  return kept.reduce((sum, value) => sum + value, 0) / kept.length
}

function weightSlopePerDay(items: readonly IntelligenceObservation[]): number | null {
  if (items.length < 2) return null
  const ordered = [...items].sort((a, b) => a.date.localeCompare(b.date))
  const origin = ordered[0]!.date
  return theilSenSlopePerDay(
    ordered.map((item) => ({
      day: calendarDaysBetween(origin, item.date),
      value: item.value,
    })),
  )
}

function confidenceFor(evidence: WindowEvidence): IntelligenceConfidence {
  const calorieCoverage = evidence.days <= 0 ? 0 : evidence.calories.length / evidence.days
  const highShare = evidence.calories.length <= 0 ? 0 : evidence.highConfidenceCalories / evidence.calories.length
  const usualShare = evidence.usedWeights.length <= 0 ? 0 : evidence.usualWeights.length / evidence.usedWeights.length
  if (
    evidence.days >= 21 &&
    calorieCoverage >= 0.8 &&
    highShare >= 0.7 &&
    evidence.usedWeights.length >= 7 &&
    evidence.weightSpanDays >= 18 &&
    usualShare >= 0.7 &&
    evidence.leastNutritionDaysPerWeek >= 4 &&
    evidence.firstLastGapDays.first != null && evidence.firstLastGapDays.first <= 1 &&
    evidence.firstLastGapDays.last != null && evidence.firstLastGapDays.last <= 1
  ) return 'high'
  if (
    calorieCoverage >= 0.65 &&
    evidence.usedWeights.length >= 5 &&
    evidence.weightSpanDays >= 12
  ) return 'moderate'
  return 'limited'
}

function qualityFor(evidence: WindowEvidence | null, days: number): MaintenanceEvidenceQuality {
  if (!evidence) {
    return {
      nutrition: {
        state: 'insufficient',
        reliableDays: 0,
        highConfidenceDays: 0,
        estimateHeavyDays: 0,
        unknownDays: 0,
        calendarDays: days,
        coveragePct: 0,
      },
      body: {
        state: 'insufficient',
        usedMeasurements: 0,
        usualMeasurements: 0,
        unknownMeasurements: 0,
        differentConditionMeasurements: 0,
        spanDays: 0,
      },
    }
  }
  const nutritionCoverage = evidence.days <= 0 ? 0 : (evidence.calories.length / evidence.days) * 100
  const nutritionState =
    evidence.calories.length >= Math.max(10, Math.ceil(evidence.days * 0.65))
      ? nutritionCoverage >= 80 && evidence.estimateHeavyCalories === 0 && evidence.unknownCalories === 0
        ? 'sufficient'
        : 'limited'
      : 'insufficient'
  const bodyState =
    evidence.usedWeights.length < 5 || evidence.weightSpanDays < 12
      ? 'insufficient'
      : evidence.usualWeights.length >= 5 && evidence.usualWeights.length / evidence.usedWeights.length >= 0.7
        ? 'sufficient'
        : 'limited'
  return {
    nutrition: {
      state: nutritionState,
      reliableDays: evidence.calories.length,
      highConfidenceDays: evidence.highConfidenceCalories,
      estimateHeavyDays: evidence.estimateHeavyCalories,
      unknownDays: evidence.unknownCalories,
      calendarDays: evidence.days,
      coveragePct: nutritionCoverage,
    },
    body: {
      state: bodyState,
      usedMeasurements: evidence.usedWeights.length,
      usualMeasurements: evidence.usualWeights.length,
      unknownMeasurements: evidence.unknownWeights.length,
      differentConditionMeasurements: evidence.differentWeights.length,
      spanDays: evidence.weightSpanDays,
    },
  }
}

function estimateRange(value: number, confidence: IntelligenceConfidence): { low: number; high: number } {
  const pct = confidence === 'high' ? 0.075 : confidence === 'moderate' ? 0.1 : 0.15
  const floor = confidence === 'high' ? 125 : confidence === 'moderate' ? 175 : 250
  const spread = Math.max(floor, Math.abs(value) * pct)
  return { low: value - spread, high: value + spread }
}

function buildEstimate(input: BuildMaintenanceInput, completeThrough: string): MaintenanceEstimate {
  let chosen: WindowEvidence | null = null
  let unalignedWithSufficientCounts: WindowEvidence | null = null
  for (const days of MAINTENANCE_WINDOWS) {
    const candidate = windowEvidence(input.intelligence.frame, completeThrough, days, input.eligibleNutritionDates)
    const enoughCounts = candidate.calories.length >= Math.max(10, Math.ceil(candidate.days * 0.65)) &&
      candidate.usedWeights.length >= 5 && candidate.weightSpanDays >= 12
    if (enoughCounts && !candidate.aligned && !unalignedWithSufficientCounts) {
      unalignedWithSufficientCounts = candidate
    }
    if (usableWindow(candidate)) {
      chosen = candidate
      break
    }
  }
  if (!chosen) {
    const fallback = windowEvidence(input.intelligence.frame, completeThrough, 28, input.eligibleNutritionDates)
    return {
      state: 'insufficient_evidence',
      period: null,
      averageIntakeKcal: null,
      observedMaintenanceKcal: null,
      rangeLowKcal: null,
      rangeHighKcal: null,
      weightSlopeKgPerWeek: null,
      weightSlopePctPerWeek: null,
      latestWeightKg: fallback.weights[fallback.weights.length - 1]?.value ?? null,
      confidence: 'limited',
      quality: qualityFor(fallback, 28),
      explanation: unalignedWithSufficientCounts?.alignmentReason
        ? `Observed maintenance withheld: ${unalignedWithSufficientCounts.alignmentReason} Review full-day logging and comparable weigh-in timing instead of adjusting calorie targets.`
        : 'Observed maintenance needs at least about two weeks of sufficiently complete Nutrition logging plus five reasonably comparable weight measurements spanning roughly twelve days.',
    }
  }
  const intake = robustMean(chosen.calories.map((item) => item.value))
  const slopePerDay = weightSlopePerDay(chosen.usedWeights)
  const orderedWeights = [...chosen.usedWeights].sort((a, b) => a.date.localeCompare(b.date))
  const latestWeight = orderedWeights[orderedWeights.length - 1]?.value ?? null
  if (!finite(intake) || !finite(slopePerDay) || !finite(latestWeight) || latestWeight <= 0) {
    return {
      state: 'insufficient_evidence',
      period: { start: chosen.start, end: chosen.end, days: chosen.days },
      averageIntakeKcal: intake,
      observedMaintenanceKcal: null,
      rangeLowKcal: null,
      rangeHighKcal: null,
      weightSlopeKgPerWeek: finite(slopePerDay) ? slopePerDay * 7 : null,
      weightSlopePctPerWeek: null,
      latestWeightKg: latestWeight,
      confidence: 'limited',
      quality: qualityFor(chosen, chosen.days),
      explanation: 'The recent evidence could not produce a stable weight-response estimate.',
    }
  }
  const slopePerWeek = slopePerDay * 7
  const slopePctPerWeek = (slopePerWeek / latestWeight) * 100
  const maintenance = intake - slopePerDay * KCAL_PER_KG_BODY_MASS_CHANGE
  if (!Number.isFinite(maintenance) || maintenance < 800 || maintenance > 6000 || Math.abs(slopePctPerWeek) > 2.5) {
    return {
      state: 'insufficient_evidence',
      period: { start: chosen.start, end: chosen.end, days: chosen.days },
      averageIntakeKcal: intake,
      observedMaintenanceKcal: null,
      rangeLowKcal: null,
      rangeHighKcal: null,
      weightSlopeKgPerWeek: slopePerWeek,
      weightSlopePctPerWeek: slopePctPerWeek,
      latestWeightKg: latestWeight,
      confidence: 'limited',
      quality: qualityFor(chosen, chosen.days),
      explanation: 'The implied energy-balance estimate is outside a plausible range for this evidence window, so Health is withholding it instead of presenting a misleading number.',
    }
  }
  const confidence = confidenceFor(chosen)
  const range = estimateRange(maintenance, confidence)
  return {
    state: 'available',
    period: { start: chosen.start, end: chosen.end, days: chosen.days },
    averageIntakeKcal: Math.round(intake),
    observedMaintenanceKcal: Math.round(maintenance),
    rangeLowKcal: Math.round(range.low),
    rangeHighKcal: Math.round(range.high),
    weightSlopeKgPerWeek: slopePerWeek,
    weightSlopePctPerWeek: slopePctPerWeek,
    latestWeightKg: latestWeight,
    confidence,
    quality: qualityFor(chosen, chosen.days),
    explanation: 'Observed maintenance is estimated from recent logged calorie intake and a robust body-weight trend. It is an approximation of energy balance, not a directly measured metabolic rate.',
  }
}

function averageSignal(
  frame: readonly IntelligenceFrameDay[],
  key: IntelligenceSignalKey,
  start: string,
  end: string,
): { mean: number | null; dates: string[] } {
  const observations = signal(frame, key, start, end)
  if (observations.length === 0) return { mean: null, dates: [] }
  return {
    mean: observations.reduce((sum, item) => sum + item.value, 0) / observations.length,
    dates: observations.map((item) => item.date),
  }
}

/**
 * Daily carb/sodium totals have a different evidentiary bar from "a nutrient
 * was logged". A valid calorie source and a known nutrient value still do not
 * prove that every meal was logged. For short-window scale context require:
 * - the independently revision-checked owner-complete whitelist;
 * - trustworthy, finite nutrient and calorie totals from identical entry IDs;
 * - two of the last three days and four of the prior seven days (caller below).
 * Undefined is deliberately fail-closed for this inference, even though older
 * estimator fixtures may still omit the whitelist.
 */
function verifiedNutritionSignal(
  frame: readonly IntelligenceFrameDay[],
  key: 'nutrition.sodium_mg' | 'nutrition.carbs_g',
  start: string,
  end: string,
  verifiedDates: ReadonlySet<string> | undefined,
): { mean: number | null; dates: string[] } {
  if (!verifiedDates || verifiedDates.size === 0) return { mean: null, dates: [] }
  const observations = frame.flatMap((day) => {
    if (day.date < start || day.date > end || !verifiedDates.has(day.date)) return []
    const nutrient = day.signals[key]
    const calories = day.signals['nutrition.calories']
    if (!nutrient || !calories ||
        !finite(nutrient.value) || nutrient.value < 0 ||
        !finite(calories.value) || calories.value <= 0 ||
        nutrient.quality !== 'high_confidence' || calories.quality !== 'high_confidence' ||
        nutrient.provenance === 'unknown' || calories.provenance === 'unknown') return []
    const left = [...nutrient.sourceIds].sort()
    const right = [...calories.sourceIds].sort()
    if (left.length === 0 || left.length !== right.length ||
        new Set(left).size !== left.length ||
        left.some((id, i) => id !== right[i])) return []
    return [{ date: day.date, value: nutrient.value }]
  })
  return {
    mean: observations.length === 0 ? null : observations.reduce((sum, item) => sum + item.value, 0) / observations.length,
    dates: observations.map((item) => item.date),
  }
}

function relativeIncrease(recent: number, baseline: number, absoluteThreshold: number, relativeThreshold: number): boolean {
  if (baseline <= 0) return recent - baseline >= absoluteThreshold
  return recent - baseline >= absoluteThreshold && (recent - baseline) / baseline >= relativeThreshold
}

const NOISE_CONTEXT_TAGS: readonly DailyContextTagKey[] = [
  'travel',
  'alcohol',
  'late_meal',
  'unusual_stress',
  'poor_sleep_opportunity',
  'baby_night_interruption',
  'sick',
  'unusual_physical_labor',
]

function noiseFactors(
  input: BuildMaintenanceInput,
  completeThrough: string,
): ScaleNoiseFactor[] {
  const recentStart = addCalendarDays(completeThrough, -2)
  const baselineEnd = addCalendarDays(recentStart, -1)
  const baselineStart = addCalendarDays(baselineEnd, -6)
  const output: ScaleNoiseFactor[] = []

  const sodiumRecent = verifiedNutritionSignal(input.intelligence.frame, 'nutrition.sodium_mg', recentStart, completeThrough, input.eligibleNutritionDates)
  const sodiumBase = verifiedNutritionSignal(input.intelligence.frame, 'nutrition.sodium_mg', baselineStart, baselineEnd, input.eligibleNutritionDates)
  if (sodiumRecent.dates.length >= 2 && sodiumBase.dates.length >= 4 &&
      finite(sodiumRecent.mean) && finite(sodiumBase.mean) &&
      relativeIncrease(sodiumRecent.mean, sodiumBase.mean, 500, 0.2)) {
    output.push({
      id: 'scale-noise:sodium',
      kind: 'sodium',
      title: 'Logged sodium rose on comparable, verified food days',
      detail: `Logged sodium averaged higher on ${sodiumRecent.dates.length} owner-confirmed, source-reliable days versus ${sodiumBase.dates.length} prior days. A sodium shift may coincide with short-term water weight; this is not proof of the cause or a measure of sodium outside the log.`,
      dates: sodiumRecent.dates,
      detailPath: '/nutrition',
    })
  }

  const carbsRecent = verifiedNutritionSignal(input.intelligence.frame, 'nutrition.carbs_g', recentStart, completeThrough, input.eligibleNutritionDates)
  const carbsBase = verifiedNutritionSignal(input.intelligence.frame, 'nutrition.carbs_g', baselineStart, baselineEnd, input.eligibleNutritionDates)
  if (carbsRecent.dates.length >= 2 && carbsBase.dates.length >= 4 &&
      finite(carbsRecent.mean) && finite(carbsBase.mean) &&
      relativeIncrease(carbsRecent.mean, carbsBase.mean, 50, 0.2)) {
    output.push({
      id: 'scale-noise:carbs',
      kind: 'carbohydrate',
      title: 'Logged carbohydrates rose on comparable, verified food days',
      detail: `Logged carbohydrates averaged higher on ${carbsRecent.dates.length} owner-confirmed, source-reliable days versus ${carbsBase.dates.length} prior days. A carbohydrate shift may accompany short-term glycogen and water changes; this is not proof of the cause or fat-mass change.`,
      dates: carbsRecent.dates,
      detailPath: '/nutrition',
    })
  }

  const waterRecent = averageSignal(input.intelligence.frame, 'hydration.ml', recentStart, completeThrough)
  const waterBase = averageSignal(input.intelligence.frame, 'hydration.ml', baselineStart, baselineEnd)
  if (
    finite(waterRecent.mean) &&
    finite(waterBase.mean) &&
    Math.abs(waterRecent.mean - waterBase.mean) >= 500 &&
    (waterBase.mean <= 0 || Math.abs(waterRecent.mean - waterBase.mean) / waterBase.mean >= 0.2)
  ) {
    output.push({
      id: 'scale-noise:hydration',
      kind: 'hydration',
      title: 'Logged water changed recently',
      detail: 'A recent change in logged water can make short-term scale readings harder to compare. Logged water is not total hydration status.',
      dates: waterRecent.dates,
      detailPath: '/check-in',
    })
  }

  const bowelRecent = averageSignal(input.intelligence.frame, 'bowel.count', recentStart, completeThrough)
  const bowelBase = averageSignal(input.intelligence.frame, 'bowel.count', baselineStart, baselineEnd)
  if (
    bowelRecent.dates.length >= 2 &&
    finite(bowelRecent.mean) &&
    finite(bowelBase.mean) &&
    bowelBase.mean - bowelRecent.mean >= 0.5
  ) {
    output.push({
      id: 'scale-noise:bowel',
      kind: 'bowel',
      title: 'Bowel frequency is lower than your prior week',
      detail: 'Recent bowel-pattern changes can affect short-term scale weight. Health does not infer constipation or a cause from this alone.',
      dates: bowelRecent.dates,
      detailPath: '/check-in',
    })
  }

  const recentContexts = input.contexts.filter((item) => item.contextDate >= recentStart && item.contextDate <= completeThrough)
  for (const tag of NOISE_CONTEXT_TAGS) {
    const dates = recentContexts.filter((item) => item.tags.includes(tag)).map((item) => item.contextDate)
    if (dates.length === 0) continue
    const labels: Record<DailyContextTagKey, string> = {
      sick: 'Sick',
      travel: 'Travel',
      alcohol: 'Alcohol',
      late_meal: 'Late meal',
      unusual_stress: 'Unusual stress',
      poor_sleep_opportunity: 'Poor sleep opportunity',
      baby_night_interruption: 'Night interruption',
      pain: 'Pain',
      rest_day: 'Rest day',
      new_supplement: 'New supplement',
      medication_change: 'Medication change',
      unusual_physical_labor: 'Unusual physical labor',
    }
    output.push({
      id: `scale-noise:context:${tag}`,
      kind: 'context',
      title: `${labels[tag]} was recorded recently`,
      detail: 'Daily Context can make a short scale window less representative. Health records the timing without assigning causality.',
      dates,
      detailPath: '/check-in',
    })
  }
  return output
}

function goalProgressDirection(goal: MaintenanceWeightGoal | null | undefined, slopePct: number): 'toward' | 'away' | 'flat' | 'unknown' {
  if (!goal || goal.direction === 'unknown' || goal.direction === 'maintain') return 'unknown'
  if (Math.abs(slopePct) < 0.1) return 'flat'
  if (goal.direction === 'lose') return slopePct < 0 ? 'toward' : 'away'
  return slopePct > 0 ? 'toward' : 'away'
}

function plateauAssessment(
  estimate: MaintenanceEstimate,
  goal: MaintenanceWeightGoal | null | undefined,
  noise: readonly ScaleNoiseFactor[],
): PlateauAssessment {
  if (estimate.state !== 'available' || estimate.weightSlopePctPerWeek == null || !estimate.period) {
    return {
      state: 'insufficient_evidence',
      headline: 'Not enough evidence to classify a plateau',
      detail: estimate.explanation,
      goalDirection: goal?.direction ?? 'unknown',
      goalUnmet: Boolean(goal && goal.targetState !== 'satisfied'),
    }
  }
  const slope = estimate.weightSlopePctPerWeek
  const goalUnmet = Boolean(goal && goal.targetState !== 'satisfied' && goal.targetState !== 'unknown')
  if (!goal || !goalUnmet || goal.direction === 'maintain' || goal.direction === 'unknown') {
    if (Math.abs(slope) <= 0.1) {
      return {
        state: 'stable_at_maintenance',
        headline: 'Weight is broadly stable in the observed window',
        detail: 'The current weight trend is close to flat. Without an unmet directional weight goal, Health treats this as stability rather than a plateau.',
        goalDirection: goal?.direction ?? 'unknown',
        goalUnmet,
      }
    }
    return {
      state: 'not_applicable',
      headline: 'A directional plateau is not the current question',
      detail: 'Weight is moving, or there is no unmet directional body-weight goal to classify as a plateau.',
      goalDirection: goal?.direction ?? 'unknown',
      goalUnmet,
    }
  }

  const direction = goalProgressDirection(goal, slope)
  if (direction === 'toward' && Math.abs(slope) >= 0.2) {
    return {
      state: 'trend_in_goal_direction',
      headline: 'Weight is still moving in the goal direction',
      detail: 'The robust trend is large enough that Health does not classify the current window as a plateau.',
      goalDirection: goal.direction,
      goalUnmet,
    }
  }
  if (direction === 'away' && Math.abs(slope) >= 0.2) {
    return {
      state: 'trend_away_from_goal',
      headline: 'Weight is moving away from the goal direction',
      detail: 'This is not a plateau: the robust trend is moving in the opposite direction from the active weight goal.',
      goalDirection: goal.direction,
      goalUnmet,
    }
  }

  if (noise.length > 0 && estimate.period.days < 21) {
    return {
      state: 'noise_obscured',
      headline: 'Recent scale noise makes a plateau call premature',
      detail: 'The short weight-response window is close to flat, but recent Nutrition, hydration, bowel, or Daily Context changes make it safer to gather a longer comparable window first.',
      goalDirection: goal.direction,
      goalUnmet,
    }
  }

  if (
    Math.abs(slope) <= 0.1 &&
    estimate.period.days >= 21 &&
    (estimate.confidence === 'high' || estimate.confidence === 'moderate')
  ) {
    return {
      state: 'plateau_likely',
      headline: 'A real plateau is increasingly likely',
      detail: 'The active weight goal is still unmet and the robust multi-week weight trend is close to flat despite sufficiently complete intake and weigh-in evidence.',
      goalDirection: goal.direction,
      goalUnmet,
    }
  }

  return {
    state: 'possible_plateau',
    headline: 'Possible plateau — keep observing before changing course',
    detail: 'The current weight trend is small enough to watch, but the evidence window or confidence is not yet strong enough for a likely-plateau classification.',
    goalDirection: goal.direction,
    goalUnmet,
  }
}

function roundTo25(value: number): number {
  return Math.round(value / 25) * 25
}

/**
 * Screening BEFORE offering any downward-calorie change. This is a
 * conservative decision gate, not a diagnosis, metabolic minimum, or
 * instruction to change calorie targets. Missing source/check-in data never
 * establishes safety.
 */
export function calorieAdjustmentSafety(
  input: BuildMaintenanceInput,
  estimate: MaintenanceEstimate,
  plateau: PlateauAssessment,
  completeThrough: string,
): CalorieAdjustmentSafety {
  const reasons: string[] = []
  const context = input.adjustmentContext
  const isLossGoal = plateau.goalDirection === 'lose'
  const proposedCut = estimate.observedMaintenanceKcal == null
    ? null : roundTo25(Math.min(250, Math.max(100, estimate.observedMaintenanceKcal * 0.075)))
  const target = context?.currentCalorieTarget
  const screeningFloor = estimate.observedMaintenanceKcal != null
    ? Math.max(1500, Math.round(estimate.observedMaintenanceKcal * 0.8))
    : null
  const proposedTarget = isLossGoal && target != null && proposedCut != null ? target - proposedCut : null
  const start = addCalendarDays(completeThrough, -6)
  const wellness = input.intelligence.frame.filter((day) => day.date >= start && day.date <= completeThrough)
  const recentCheckinDays = wellness.filter((day) =>
    ['wellness.hunger', 'wellness.energy', 'wellness.soreness'].some((key) =>
      day.signals[key as IntelligenceSignalKey] != null)).length
  if (context?.revisionStatus !== 'consistent' || !context.decisionRevision) {
    reasons.push('Current calorie target or goal versions could not be confirmed unchanged during evidence loading; review current settings before a calorie change.')
  }
  if (context?.status !== 'available') {
    reasons.push('Current target and experiment checks are unavailable; review context before changing intake.')
  } else {
    if (!Number.isFinite(target) || target == null || target <= 0) {
      reasons.push('A current configured calorie target is required before proposing a change.')
    }
    if (context.activeExperimentCount > 0) {
      reasons.push('An active or imminent personal experiment should not be confounded by a new calorie change.')
    }
  }
  if (isLossGoal) {
    const physiology = context?.physiology
    if (physiology?.status !== 'available' || physiology.asOf !== input.asOf ||
        physiology.ageYears == null || !Number.isFinite(physiology.ageYears) ||
        physiology.heightCm == null || !Number.isFinite(physiology.heightCm) ||
        physiology.heightCm < 50 || physiology.heightCm > 250) {
      reasons.push('Current age and height context is missing or historical; review the Health Profile before a numerical calorie reduction.')
    } else {
      if (physiology.ageYears < 18 || physiology.ageYears >= 65) {
        reasons.push('This generic calorie-reduction screen is intended only for adults 18–64; individualized review is needed for other ages.')
      }
      const weightKg = estimate.latestWeightKg
      const heightM = physiology.heightCm / 100
      const bmi = weightKg != null && weightKg > 0 ? weightKg / (heightM * heightM) : null
      if (bmi == null || !Number.isFinite(bmi) || bmi < 18.5) {
        reasons.push('Low or unknown weight relative to height warrants individual assessment instead of another calorie cut.')
      }
      if (physiology.activeOrUncertainConditionCount > 0) {
        reasons.push('Reported active or uncertain clinical conditions require an individualized review before lowering intake.')
      }
    }
    // A statistical maintenance range is not energy availability or BMR.
    // Do not use its point estimate to certify an arbitrary lower target.
    if (proposedTarget != null && estimate.rangeLowKcal != null &&
        proposedTarget < estimate.rangeLowKcal) {
      reasons.push('The proposed target falls below the lower edge of the uncertain maintenance estimate; it cannot be justified by this scale trend alone.')
    }
    if (proposedTarget != null && estimate.averageIntakeKcal != null &&
        proposedTarget >= estimate.averageIntakeKcal) {
      reasons.push('Recent logged intake is already at or below the proposed target; changing the target may not change actual intake. Review target adherence instead.')
    }
    if (target != null && estimate.averageIntakeKcal != null &&
        estimate.averageIntakeKcal > target * 1.05) {
      reasons.push('Recent logged intake exceeds the current target by more than five percent; review adherence and intake completeness before lowering the target.')
    }
    const performance = context?.performance
    if (performance?.status !== 'available' || performance.asOf !== input.asOf) {
      reasons.push('Training performance and active goal checks are unavailable; decline or competing goals cannot be ruled out.')
    } else {
      if (performance.decliningExercises.length > 0) {
        reasons.push('Recent comparable strength performance is lower or confounded (' +
          performance.decliningExercises.join(', ') + '); review training and recovery before reducing calories.')
      }
      if (performance.competingGoals.length > 0) {
        reasons.push('Time-sensitive active performance goals need review (' +
          performance.competingGoals.join(', ') + ') before a calorie reduction.')
      }
    }
    if (screeningFloor == null || proposedTarget == null || proposedTarget < screeningFloor) {
      reasons.push('The proposed target would be too low relative to the conservative intake-screening floor, or its safety cannot be assessed.')
    }
    if (recentCheckinDays < 3) {
      reasons.push('Recent hunger and recovery context is sparse; low symptoms cannot be assumed.')
    }
    const highHunger = wellness.filter((day) => (day.signals['wellness.hunger']?.value ?? 0) >= 4).length
    const lowEnergy = wellness.filter((day) => (day.signals['wellness.energy']?.value ?? 6) <= 2).length
    const highSoreness = wellness.filter((day) => (day.signals['wellness.soreness']?.value ?? 0) >= 4).length
    if (highHunger >= 2 || lowEnergy >= 2 || highSoreness >= 2) {
      reasons.push('Repeated high hunger, low energy, or high soreness warrants recovery review instead of another calorie cut.')
    }
    const concerningTags = input.contexts.filter((entry) =>
      entry.contextDate >= start && entry.contextDate <= completeThrough &&
      entry.tags.some((tag) => tag === 'sick' || tag === 'pain' || tag === 'poor_sleep_opportunity'))
    if (concerningTags.length > 0) {
      reasons.push('Recent illness, pain, or sleep-disruption context requires review before cutting intake.')
    }
  }
  return {
    status: reasons.length ? 'blocked' : 'review_possible',
    reasons,
    screeningFloorKcal: screeningFloor,
    proposedTargetKcal: proposedTarget,
    recentCheckinDays,
  }
}

function interventionsFor(
  estimate: MaintenanceEstimate,
  plateau: PlateauAssessment,
  safety: CalorieAdjustmentSafety,
): MaintenanceIntervention[] {
  const output: MaintenanceIntervention[] = []
  if (estimate.quality.nutrition.state === 'insufficient') {
    output.push({
      id: 'maintenance:improve-nutrition',
      kind: 'improve_nutrition_evidence',
      priority: 'primary',
      title: 'Improve calorie-log coverage before changing intake',
      detail: 'Maintenance and plateau estimates are sensitive to missing or estimate-heavy calorie days. Fill the evidence gap before using the scale to justify a target change.',
      detailPath: '/nutrition',
      suggestedDeltaKcal: null,
    })
  }
  if (estimate.quality.body.state === 'insufficient') {
    output.push({
      id: 'maintenance:improve-weight',
      kind: 'improve_weigh_in_consistency',
      priority: output.length === 0 ? 'primary' : 'secondary',
      title: 'Collect more comparable weigh-ins',
      detail: 'Use the same normal measurement conditions when practical. Health needs a longer comparable weight series before treating a flat scale as a plateau.',
      detailPath: '/body',
      suggestedDeltaKcal: null,
    })
  }
  if (plateau.state === 'trend_in_goal_direction' || plateau.state === 'stable_at_maintenance' || plateau.state === 'noise_obscured') {
    output.push({
      id: 'maintenance:hold',
      kind: 'hold_course',
      priority: output.length === 0 ? 'primary' : 'secondary',
      title: plateau.state === 'noise_obscured' ? 'Hold the plan while the short-term noise clears' : 'Hold the current plan',
      detail: plateau.detail,
      detailPath: '/progress/body',
      suggestedDeltaKcal: null,
    })
  }
  if (plateau.state === 'trend_away_from_goal') {
    output.push({
      id: 'maintenance:review-plan',
      kind: 'review_goal_plan',
      priority: 'primary',
      title: 'Review the weight-goal plan before making a larger change',
      detail: 'The robust trend is moving away from the active goal. Review intake adherence, activity, and the goal plan rather than treating this as a plateau.',
      detailPath: '/goals',
      suggestedDeltaKcal: null,
    })
  }
  if (plateau.state === 'possible_plateau') {
    output.push({
      id: 'maintenance:observe',
      kind: 'hold_course',
      priority: output.length === 0 ? 'primary' : 'secondary',
      title: 'Keep the plan stable long enough to resolve the plateau question',
      detail: 'Avoid changing several variables at once. A longer, more comparable observation window will make the next decision more informative.',
      detailPath: '/progress/body',
      suggestedDeltaKcal: null,
    })
  }
  if (plateau.state === 'plateau_likely' && estimate.observedMaintenanceKcal != null && safety.status === 'blocked') {
    output.push({
      id: 'maintenance:review-safety',
      kind: 'review_goal_plan',
      priority: 'primary',
      title: 'Review calorie targets and recovery before adjusting intake',
      detail: safety.reasons.join(' ') + ' The plateau estimate is descriptive and does not authorize a new calorie target.',
      detailPath: '/goals',
      suggestedDeltaKcal: null,
    })
  }
  if (plateau.state === 'plateau_likely' && estimate.observedMaintenanceKcal != null && safety.status === 'review_possible') {
    const delta = roundTo25(Math.min(250, Math.max(100, estimate.observedMaintenanceKcal * 0.075)))
    const direction = plateau.goalDirection === 'gain' ? 'upward' : 'downward'
    output.push({
      id: 'maintenance:review-intake',
      kind: 'review_intake_adjustment',
      priority: 'primary',
      title: `Review a small ${direction} calorie adjustment`,
      detail: `The plateau evidence is strong enough to review a modest change of roughly ${delta} kcal/day (about five to ten percent of observed maintenance). This is a candidate adjustment, not an automatic target change.`,
      detailPath: '/nutrition',
      suggestedDeltaKcal: plateau.goalDirection === 'gain' ? delta : -delta,
    })
    output.push({
      id: 'maintenance:review-activity',
      kind: 'review_activity_adjustment',
      priority: 'secondary',
      title: 'Or change activity instead of changing both levers',
      detail: 'If you prefer an activity lever, make one modest, trackable change and hold intake steady so the effect is interpretable.',
      detailPath: '/progress/activity',
      suggestedDeltaKcal: null,
    })
  }
  return output
}

function calibrationFor(
  estimate: MaintenanceEstimate,
  plateau: PlateauAssessment,
  goal: MaintenanceWeightGoal | null | undefined,
): MaintenanceCalibrationSuggestion {
  const partialEvidence =
    estimate.quality.nutrition.reliableDays >= 5 &&
    (
      estimate.quality.body.usedMeasurements >= 3 ||
      estimate.quality.body.usualMeasurements + estimate.quality.body.unknownMeasurements >= 3
    )
  const eligible =
    Boolean(goal && goal.targetState !== 'satisfied' && goal.targetState !== 'unknown') &&
    (plateau.state === 'possible_plateau' ||
      plateau.state === 'noise_obscured' ||
      (estimate.state === 'available' && estimate.confidence !== 'high') ||
      (estimate.state === 'insufficient_evidence' && partialEvidence))
  return {
    eligible,
    title: 'Weight-response calibration',
    why: eligible
      ? 'A controlled observation period could reduce uncertainty before changing the weight-goal plan.'
      : 'Current evidence does not require a calibration experiment.',
    durationDays: 14,
    requiredNutritionDays: 10,
    requiredWeightMeasurements: 5,
    linkedGoalId: eligible ? goal?.goalId ?? null : null,
    linkedGoalVersionId: eligible ? goal?.goalVersionId ?? null : null,
    evidenceRefs: [
      'maintenance:estimate',
      'maintenance:nutrition-quality',
      'maintenance:body-quality',
      'maintenance:plateau-state',
    ],
  }
}

/**
 * Explanatory quality dimensions are intentionally separate. Estimate
 * confidence does not mean full-day intake was objectively witnessed,
 * plateau confidence is not a probability, and a review gate is not
 * clinical clearance to lower calories.
 */
export function explainMaintenanceEvidence(
  estimate: MaintenanceEstimate,
  plateau: PlateauAssessment,
  safety: CalorieAdjustmentSafety,
  noise: readonly ScaleNoiseFactor[],
  ownerVerifiedNutrition: boolean,
): MaintenanceEvidenceExplanation {
  const { nutrition, body } = estimate.quality
  const sampledDays = nutrition.calendarDays
  const nutritionStatus = nutrition.state === 'insufficient' ? 'insufficient'
    : !ownerVerifiedNutrition ? 'limited'
      : nutrition.state === 'sufficient' ? 'well_sampled' : 'limited'
  const nutritionDetail =
    `${nutrition.reliableDays} of ${sampledDays} completed days had eligible calorie observations ` +
    `(${nutrition.highConfidenceDays} high-source-quality, ${nutrition.estimateHeavyDays} estimate-heavy). ` +
    (ownerVerifiedNutrition
      ? 'Eligibility includes a matching owner full-day confirmation; that report does not prove every meal was captured.'
      : 'The fixture or historical source did not supply a verified full-day whitelist; source quality alone cannot prove a complete day.')
  const weightStatus = body.state === 'sufficient' ? 'well_sampled'
    : body.state === 'limited' ? 'limited' : 'insufficient'
  const weightDetail = `${body.usedMeasurements} comparable weight measurements across ${body.spanDays} days ` +
    `(${body.usualMeasurements} recorded under usual conditions, ${body.unknownMeasurements} with unknown conditions). ` +
    'A robust slope reduces individual-day influence but cannot remove water-weight, timing or scale variability.'
  const plateauStatus =
    plateau.state === 'plateau_likely' ? 'likely'
    : plateau.state === 'possible_plateau' || plateau.state === 'noise_obscured' ? 'possible'
      : plateau.state === 'insufficient_evidence' ? 'insufficient' : 'not_applicable'
  const plateauDetail = estimate.period && estimate.weightSlopePctPerWeek != null
    ? `${estimate.period.days}-day comparison (${estimate.period.start} through ${estimate.period.end}); ` +
      `weight trend ${estimate.weightSlopePctPerWeek.toFixed(2)}% per week. ` +
      `${plateau.headline}. ` +
      (noise.length ? `${noise.length} possible short-term scale confounder(s) recorded; no cause is established.`
        : 'No specific short-window confounder was identified in the available records; unrecorded factors remain possible.')
    : `Plateau cannot be classified from this evidence. ${plateau.detail}`
  const isCutDecision = plateau.state === 'plateau_likely' && plateau.goalDirection === 'lose'
  const decisionStatus = !isCutDecision ? 'not_applicable'
    : safety.status === 'blocked' ? 'withheld' : 'review_only'
  const decisionDetail = !isCutDecision
    ? 'No downward calorie adjustment is supported by this plateau/goal combination. This is separate from estimate quality.'
    : safety.status === 'blocked'
      ? `A calorie reduction is withheld: ${safety.reasons.join(' ')} Estimate confidence does not override these checks.`
      : `Only a manual review is eligible; no target is changed. ${safety.recentCheckinDays} recent check-in days and current plan context were screened, ` +
        'but the provisional intake threshold is not an individualized medical minimum or a safety certification.'
  return {
    nutrition: { status: nutritionStatus, detail: nutritionDetail },
    weightTrend: { status: weightStatus, detail: weightDetail },
    plateau: { status: plateauStatus, detail: plateauDetail },
    calorieDecision: { status: decisionStatus, detail: decisionDetail },
  }
}

export function buildMaintenanceState(input: BuildMaintenanceInput): MaintenanceState {
  // TypeScript requires a verified whitelist; unchecked JS callers still
  // fail closed instead of treating source-quality-only days as complete.
  const verifiedInput: BuildMaintenanceInput = {
    ...input,
    eligibleNutritionDates: input.eligibleNutritionDates ?? new Set<string>(),
  }
  const completeThrough = input.today != null && input.asOf === input.today
    ? addCalendarDays(input.asOf, -1)
    : input.asOf
  const estimate = buildEstimate(verifiedInput, completeThrough)
  const noise = noiseFactors(verifiedInput, completeThrough)
  const plateau = plateauAssessment(estimate, verifiedInput.weightGoal, noise)
  const safety = calorieAdjustmentSafety(verifiedInput, estimate, plateau, completeThrough)
  return {
    version: MAINTENANCE_ENGINE_VERSION,
    asOf: input.asOf,
    completeThrough,
    estimate,
    plateau,
    noiseFactors: noise,
    interventions: interventionsFor(estimate, plateau, safety),
    calibration: calibrationFor(estimate, plateau, input.weightGoal),
    calorieAdjustmentSafety: safety,
    evidenceExplanation: explainMaintenanceEvidence(estimate, plateau, safety, noise, input.eligibleNutritionDates != null),
    decisionRevision: input.adjustmentContext?.revisionStatus === 'consistent'
      ? input.adjustmentContext.decisionRevision ?? null : null,
  }
}
