import { addCalendarDays, weekStartMonday } from '../training-plan.js'
import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'
import type { DigestiveBowelWindow } from './digestive-window.js'

/**
 * PIQ-4.1: evidence-readiness screening for pre-registered 0/1/2-day lags.
 *
 * Not a correlation, a population statistic, a clinical result, or proof of
 * cause. This only measures how many owner-recorded, full-type stool days
 * have quality-qualified preceding exposure observations.
 */
export const DIGESTIVE_LAG_DAYS = [0, 1, 2] as const
export const MIN_DIGESTIVE_PAIRED_DAYS = 12
export const MIN_DIGESTIVE_PAIRED_WEEKS = 4

export type DigestiveLagPair = {
  lagDays: 0 | 1 | 2
  fullyTypedBowelDays: number
  pairedDays: number
  pairedCalendarWeeks: number
  missingOrUnqualifiedExposureDays: number
  maturity: 'insufficient_pairs' | 'candidate_for_review' | 'logging_only'
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

function observedExposure(
  snapshot: HealthIntelligenceSnapshot, key: 'nutrition.fiber_g' | 'hydration.ml',
  date: string, today: string,
): IntelligenceObservation | null {
  if (date >= today || date > snapshot.asOf || date < snapshot.period.start ||
      date > snapshot.period.end) return null
  const day = snapshot.frame.find(item => item.date === date)
  const observation = day?.signals[key]
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

export function screenDigestiveLagReadiness(
  snapshot: HealthIntelligenceSnapshot,
  window: DigestiveBowelWindow | null | undefined,
  today: string,
): DigestivePairingReadiness | null {
  if (!window || window.status !== 'available' ||
      window.scope.start < snapshot.period.start ||
      window.scope.end > snapshot.period.end ||
      window.scope.end > snapshot.asOf ||
      window.scope.end > today ||
      window.typedDays.some(day => day.date < window.scope.start || day.date > window.scope.end)) return null

  const verifiedDaysStatus = snapshot.coverage.find(item =>
    item.key === 'nutrition.fiber_g')?.completenessCheck
  const fiberVerification = verifiedDaysStatus === 'available' ? 'available' : 'unavailable'
  const bowelDays = window.typedDays.filter(day => day.eventCount > 0)
  const completedBowelDays = bowelDays.filter(day => day.date < today)
  const fullyTyped = completedBowelDays.filter(day => day.typedCount === day.eventCount &&
    day.typedCount > 0)
  const ready = (key: 'nutrition.fiber_g' | 'hydration.ml') =>
    DIGESTIVE_LAG_DAYS.map(lagDays => {
      const pairs = fullyTyped.filter(day => {
        const exposureDate = addCalendarDays(day.date, -lagDays)
        // Do not borrow exposure outside the exact requested history.
        return exposureDate >= window.scope.start &&
          observedExposure(snapshot, key, exposureDate, today) !== null
      })
      const weeks = new Set(pairs.map(day => weekStartMonday(day.date))).size
      const minimum = pairs.length >= MIN_DIGESTIVE_PAIRED_DAYS &&
        weeks >= MIN_DIGESTIVE_PAIRED_WEEKS
      return {
        lagDays,
        fullyTypedBowelDays: fullyTyped.length,
        pairedDays: pairs.length,
        pairedCalendarWeeks: weeks,
        missingOrUnqualifiedExposureDays: fullyTyped.length - pairs.length,
        // Water log events are never verified total fluid consumption.
        maturity: key === 'hydration.ml' ? 'logging_only' as const :
          fiberVerification !== 'available' || !minimum ? 'insufficient_pairs' as const :
          'candidate_for_review' as const,
      }
    })
  return {
    scope: { start: window.scope.start, end: window.scope.end },
    recordedBowelDays: bowelDays.length,
    fullyTypedBowelDays: fullyTyped.length,
    partiallyTypedBowelDays: completedBowelDays.length - fullyTyped.length,
    provisionalBowelDaysExcluded: bowelDays.length - completedBowelDays.length,
    fiberVerification,
    fiber: ready('nutrition.fiber_g'),
    loggedWater: ready('hydration.ml'),
  }
}
