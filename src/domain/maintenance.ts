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

export type MaintenanceState = {
  version: typeof MAINTENANCE_ENGINE_VERSION
  asOf: string
  completeThrough: string
  estimate: MaintenanceEstimate
  plateau: PlateauAssessment
  noiseFactors: ScaleNoiseFactor[]
  interventions: MaintenanceIntervention[]
  calibration: MaintenanceCalibrationSuggestion
}

export type BuildMaintenanceInput = {
  asOf: string
  today: string | null
  intelligence: HealthIntelligenceSnapshot
  contexts: readonly DailyContext[]
  weightGoal?: MaintenanceWeightGoal | null
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
  return calendarDaysBetween(ordered[0]!.date, ordered.at(-1)!.date)
}

function windowEvidence(
  frame: readonly IntelligenceFrameDay[],
  completeThrough: string,
  days: number,
): WindowEvidence {
  const start = addCalendarDays(completeThrough, -(days - 1))
  const calorieAll = signal(frame, 'nutrition.calories', start, completeThrough)
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
  }
}

function usableWindow(evidence: WindowEvidence): boolean {
  const requiredCalories = Math.max(10, Math.ceil(evidence.days * 0.65))
  return (
    evidence.calories.length >= requiredCalories &&
    evidence.usedWeights.length >= 5 &&
    evidence.weightSpanDays >= 12
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
    usualShare >= 0.7
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
  for (const days of MAINTENANCE_WINDOWS) {
    const candidate = windowEvidence(input.intelligence.frame, completeThrough, days)
    if (usableWindow(candidate)) {
      chosen = candidate
      break
    }
  }
  if (!chosen) {
    const fallback = windowEvidence(input.intelligence.frame, completeThrough, 28)
    return {
      state: 'insufficient_evidence',
      period: null,
      averageIntakeKcal: null,
      observedMaintenanceKcal: null,
      rangeLowKcal: null,
      rangeHighKcal: null,
      weightSlopeKgPerWeek: null,
      weightSlopePctPerWeek: null,
      latestWeightKg: fallback.weights.at(-1)?.value ?? null,
      confidence: 'limited',
      quality: qualityFor(fallback, 28),
      explanation: 'Observed maintenance needs at least about two weeks of sufficiently complete Nutrition logging plus five reasonably comparable weight measurements spanning roughly twelve days.',
    }
  }
  const intake = robustMean(chosen.calories.map((item) => item.value))
  const slopePerDay = weightSlopePerDay(chosen.usedWeights)
  const latestWeight = [...chosen.usedWeights].sort((a, b) => a.date.localeCompare(b.date)).at(-1)?.value ?? null
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

  const sodiumRecent = averageSignal(input.intelligence.frame, 'nutrition.sodium_mg', recentStart, completeThrough)
  const sodiumBase = averageSignal(input.intelligence.frame, 'nutrition.sodium_mg', baselineStart, baselineEnd)
  if (finite(sodiumRecent.mean) && finite(sodiumBase.mean) && relativeIncrease(sodiumRecent.mean, sodiumBase.mean, 500, 0.2)) {
    output.push({
      id: 'scale-noise:sodium',
      kind: 'sodium',
      title: 'Recent sodium is higher than your prior week',
      detail: 'Higher sodium can coincide with short-term water-weight changes. This is context for the scale, not proof of the cause.',
      dates: sodiumRecent.dates,
      detailPath: '/nutrition',
    })
  }

  const carbsRecent = averageSignal(input.intelligence.frame, 'nutrition.carbs_g', recentStart, completeThrough)
  const carbsBase = averageSignal(input.intelligence.frame, 'nutrition.carbs_g', baselineStart, baselineEnd)
  if (finite(carbsRecent.mean) && finite(carbsBase.mean) && relativeIncrease(carbsRecent.mean, carbsBase.mean, 50, 0.2)) {
    output.push({
      id: 'scale-noise:carbs',
      kind: 'carbohydrate',
      title: 'Recent carbohydrate intake is higher than your prior week',
      detail: 'A carbohydrate shift can accompany short-term glycogen and water changes. Health treats this as possible scale noise, not fat-mass change.',
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

function interventionsFor(
  estimate: MaintenanceEstimate,
  plateau: PlateauAssessment,
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
  if (plateau.state === 'plateau_likely' && estimate.observedMaintenanceKcal != null) {
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

export function buildMaintenanceState(input: BuildMaintenanceInput): MaintenanceState {
  const completeThrough = input.today != null && input.asOf === input.today
    ? addCalendarDays(input.asOf, -1)
    : input.asOf
  const estimate = buildEstimate(input, completeThrough)
  const noise = noiseFactors(input, completeThrough)
  const plateau = plateauAssessment(estimate, input.weightGoal, noise)
  return {
    version: MAINTENANCE_ENGINE_VERSION,
    asOf: input.asOf,
    completeThrough,
    estimate,
    plateau,
    noiseFactors: noise,
    interventions: interventionsFor(estimate, plateau),
    calibration: calibrationFor(estimate, plateau, input.weightGoal),
  }
}
