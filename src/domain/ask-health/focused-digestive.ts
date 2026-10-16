import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'

/** PIQ-3.3: question-relevant observations from the *already-loaded*,
 * quality-gated owner intelligence snapshot. Never re-query private records.
 */
export type FocusedDigestiveMetric = {
  kind: 'fiber' | 'hydration' | 'bowel'
  recordedDays: number
  /** Verified, source-reliable whole-day FOOD logs only. */
  verifiedDays?: number
  verificationStatus?: 'available' | 'unavailable'
  observations: Array<{
    date: string
    value: number
    sourceIds: string[]
    /** Hydration is an event sum; zero bowel movements requires explicit entry. */
    provisional: boolean
  }>
}
export type FocusedDigestiveEvidence = {
  start: string
  end: string
  fiber: FocusedDigestiveMetric
  hydration: FocusedDigestiveMetric
  bowel: FocusedDigestiveMetric
}

const DIGESTIVE_QUESTION =
  /\b(?:fib(?:er|re)|constipat\w*|bowel|stool|poop|bristol|hydrat\w*|water intake|fluid intake|drinking enough)\b/i
const SAMPLE_DAYS = 3

function recent<T extends { date: string }>(items: readonly T[]): T[] {
  return items.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, SAMPLE_DAYS)
}

function observationDates(
  snapshot: HealthIntelligenceSnapshot,
  key: 'nutrition.fiber_g' | 'hydration.ml' | 'bowel.count',
  today: string,
): IntelligenceObservation[] {
  return snapshot.frame.flatMap((day) => {
    if (day.date < snapshot.period.start || day.date > snapshot.asOf) return []
    const item = day.signals[key]
    if (!item || !Number.isFinite(item.value)) return []
    // No implicit zero filling: only observed hydration events, bowel events
    // or explicitly owner-entered "no bowel movement" days are present here.
    // Exclude future events even if the synthetic snapshot is malformed.
    if (day.date > today) return []
    return [item]
  })
}

export function focusDigestiveContext(input: {
  question: string
  snapshot: HealthIntelligenceSnapshot
  today: string
}): FocusedDigestiveEvidence | null {
  if (!DIGESTIVE_QUESTION.test(input.question)) return null
  const { snapshot, today } = input
  const fiberAll = observationDates(snapshot, 'nutrition.fiber_g', today)
  const fiberStatus = snapshot.coverage.find((c) => c.key === 'nutrition.fiber_g')?.completenessCheck
  // Do not infer full-day intake from food items, even if all entries have
  // high-confidence nutrient estimates. Verification is a separate owner act.
  const verified = fiberStatus === 'available'
    ? fiberAll.filter((o) => o.date < today &&
      o.dayCompleteness === 'verified_complete' && o.quality === 'high_confidence')
    : []
  const water = observationDates(snapshot, 'hydration.ml', today)
  const bowel = observationDates(snapshot, 'bowel.count', today)
  const present = (kind: FocusedDigestiveMetric['kind'], source: IntelligenceObservation[]): FocusedDigestiveMetric => ({
    kind, recordedDays: source.length,
    observations: recent(source).map((o) => ({
      date: o.date, value: o.value, sourceIds: [...o.sourceIds].sort(),
      provisional: o.date === today,
    })),
  })
  const fiberMetric: FocusedDigestiveMetric = {
    kind: 'fiber',
    recordedDays: fiberAll.length,
    verifiedDays: verified.length,
    verificationStatus: fiberStatus === 'available' ? 'available' : 'unavailable',
    observations: recent(verified).map((o) => ({
      date: o.date, value: o.value, sourceIds: [...o.sourceIds].sort(),
      provisional: false,
    })),
  }
  return {
    start: snapshot.period.start,
    end: snapshot.period.end,
    fiber: fiberMetric,
    hydration: present('hydration', water),
    bowel: present('bowel', bowel),
  }
}
