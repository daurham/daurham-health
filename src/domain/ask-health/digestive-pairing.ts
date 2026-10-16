import { addCalendarDays, weekStartMonday } from '../training-plan.js'
import type { DailyContextTagKey } from '../context.js'
import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'
import type { DigestiveBowelWindow } from './digestive-window.js'

/**
 * PIQ-4.1: completeness, outcome/exposure variation and potential-context
 * review for pre-registered 0/1/2-day lagged observation pairs.
 * Never a correlation, causal claim, medical finding or instruction.
 */
export const DIGESTIVE_LAG_DAYS = [0, 1, 2] as const
export const MIN_DIGESTIVE_PAIRED_DAYS = 12
export const MIN_DIGESTIVE_PAIRED_WEEKS = 4
export const MIN_FIBER_SPAN_G = 2

export type DigestiveReviewState =
  | 'insufficient_pairs'
  | 'no_outcome_variation'
  | 'no_exposure_variation'
  | 'context_review_required'
  | 'candidate_for_review'
  | 'logging_only'

export type DigestiveLagPair = {
  lagDays: 0 | 1 | 2
  fullyTypedBowelDays: number
  pairedDays: number
  pairedCalendarWeeks: number
  missingOrUnqualifiedExposureDays: number
  /** Reported context may change interpretation; absent tags prove nothing. */
  contextFlaggedPairDays: number
  stoolHardnessVaries: boolean
  exposureVaries: boolean
  /** Co-recorded water events; not verified overall hydration. */
  daysAlsoLoggingWater: number
  coLoggedWaterVaries: boolean
  maturity: DigestiveReviewState
}

export type DigestivePairingReadiness = {
  scope: { start: string; end: string }
  recordedBowelDays: number
  fullyTypedBowelDays: number
  partiallyTypedBowelDays: number
  provisionalBowelDaysExcluded: number
  fiberVerification: 'available' | 'unavailable'
  fiber: DigestiveLagPair[]
  loggedWater: DigestiveLagPair[]
}

export type DigestiveContextTagDay = {
  contextDate: string
  tags: readonly DailyContextTagKey[]
}

/** Only expressly saved context TAGS. Never inspect narrative notes or
 * interpret absence of a saved tag as an absence of symptoms or confounders.
 * No claim that one of these flags caused a bowel or nutrition change.
 */
const REVIEW_TAGS: ReadonlySet<DailyContextTagKey> = new Set([
  'sick', 'travel', 'alcohol', 'late_meal', 'unusual_stress',
  'poor_sleep_opportunity', 'baby_night_interruption', 'pain',
  'new_supplement', 'medication_change', 'unusual_physical_labor',
])

function observedExposure(
  indexed: ReadonlyMap<string, HealthIntelligenceSnapshot['frame'][number]>,
  key: 'nutrition.fiber_g' | 'hydration.ml',
  date: string,
  snapshot: HealthIntelligenceSnapshot,
  today: string,
): IntelligenceObservation | null {
  if (date >= today || date > snapshot.asOf || date < snapshot.period.start ||
      date > snapshot.period.end) return null
  const observation = indexed.get(date)?.signals[key]
  if (!observation || !Number.isFinite(observation.value) || observation.value < 0 ||
      observation.sourceIds.length === 0) return null
  if (key === 'nutrition.fiber_g') {
    if (observation.dayCompleteness !== 'verified_complete' ||
        observation.quality !== 'high_confidence') return null
  } else if (observation.provenance !== 'owner') {
    return null
  }
  return observation
}

/** A comparison candidate requires BETWEEN-DATE variation, not a
 * mixture of Bristol types within one day or tiny numeric rounding noise.
 */
function spansAtLeast(values: readonly number[], minimum: number): boolean {
  return values.length >= 2 && Math.max(...values) - Math.min(...values) >= minimum
}

export function screenDigestiveLagReadiness(
  snapshot: HealthIntelligenceSnapshot,
  window: DigestiveBowelWindow | null | undefined,
  today: string,
  contexts: readonly DigestiveContextTagDay[] = [],
): DigestivePairingReadiness | null {
  if (!window || window.status !== 'available' ||
      window.scope.start < snapshot.period.start ||
      window.scope.end > snapshot.period.end ||
      window.scope.end > snapshot.asOf ||
      window.scope.end > today ||
      window.typedDays.some(day => day.date < window.scope.start || day.date > window.scope.end)) return null

  const frameByDate = new Map(snapshot.frame.map(day => [day.date, day]))
  const flaggedDates = new Set(contexts.filter(day =>
    day.contextDate >= window.scope.start && day.contextDate <= window.scope.end &&
    day.contextDate <= snapshot.asOf &&
    day.tags.some(tag => REVIEW_TAGS.has(tag))
  ).map(day => day.contextDate))
  const verifiedDaysStatus = snapshot.coverage.find(item =>
    item.key === 'nutrition.fiber_g')?.completenessCheck
  const fiberVerification = verifiedDaysStatus === 'available' ? 'available' : 'unavailable'
  const bowelDays = window.typedDays.filter(day => day.eventCount > 0)
  const completedBowelDays = bowelDays.filter(day => day.date < today)
  const fullyTyped = completedBowelDays.filter(day => day.typedCount === day.eventCount &&
    day.typedCount > 0)

  const readiness = (key: 'nutrition.fiber_g' | 'hydration.ml'): DigestiveLagPair[] =>
    DIGESTIVE_LAG_DAYS.map(lagDays => {
      const aligned = fullyTyped.flatMap(bowelDay => {
        const exposureDate = addCalendarDays(bowelDay.date, -lagDays)
        if (exposureDate < window.scope.start) return []
        const exposure = observedExposure(frameByDate, key, exposureDate, snapshot, today)
        if (!exposure) return []
        const water = observedExposure(frameByDate, 'hydration.ml', exposureDate, snapshot, today)
        let isFlagged = false
        for (let offset = 0; offset <= lagDays; offset += 1) {
          if (flaggedDates.has(addCalendarDays(exposureDate, offset))) isFlagged = true
        }
        return [{
          bowelDate: bowelDay.date,
          fiberOrWater: exposure.value,
          hardRatio: bowelDay.hardCount / bowelDay.typedCount,
          isFlagged,
          loggedWater: water?.value ?? null,
        }]
      })
      const qualified = aligned.filter(p => !p.isFlagged)
      const pairedCalendarWeeks = new Set(aligned.map(p => weekStartMonday(p.bowelDate))).size
      const qualifiedWeeks = new Set(qualified.map(p => weekStartMonday(p.bowelDate))).size
      const stoolHardnessVaries = spansAtLeast(qualified.map(p => p.hardRatio), 0.2)
      const exposureVaries = spansAtLeast(qualified.map(p => p.fiberOrWater),
        key === 'nutrition.fiber_g' ? MIN_FIBER_SPAN_G : 1)
      const coLogged = qualified.filter(p => p.loggedWater != null)
      const coLoggedWaterVaries = spansAtLeast(coLogged.map(p => p.loggedWater!), 1)
      const eligible = qualified.length >= MIN_DIGESTIVE_PAIRED_DAYS &&
        qualifiedWeeks >= MIN_DIGESTIVE_PAIRED_WEEKS
      const maturity: DigestiveReviewState =
        key === 'hydration.ml' ? 'logging_only'
          : fiberVerification !== 'available' || !eligible ? 'insufficient_pairs'
            : aligned.length !== qualified.length || (coLoggedWaterVaries && coLogged.length >= 2)
              ? 'context_review_required'
              : !stoolHardnessVaries ? 'no_outcome_variation'
                : !exposureVaries ? 'no_exposure_variation'
                  : 'candidate_for_review'
      return {
        lagDays,
        fullyTypedBowelDays: fullyTyped.length,
        pairedDays: aligned.length,
        pairedCalendarWeeks,
        missingOrUnqualifiedExposureDays: fullyTyped.length - aligned.length,
        contextFlaggedPairDays: aligned.length - qualified.length,
        stoolHardnessVaries, exposureVaries,
        daysAlsoLoggingWater: coLogged.length,
        coLoggedWaterVaries,
        maturity,
      }
    })
  return {
    scope: { start: window.scope.start, end: window.scope.end },
    recordedBowelDays: bowelDays.length,
    fullyTypedBowelDays: fullyTyped.length,
    partiallyTypedBowelDays: completedBowelDays.length - fullyTyped.length,
    provisionalBowelDaysExcluded: bowelDays.length - completedBowelDays.length,
    fiberVerification,
    fiber: readiness('nutrition.fiber_g'),
    loggedWater: readiness('hydration.ml'),
  }
}
