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
    /** Explicit stool types from individually saved bowel events, if retrieved. */
    bristolTypes?: number[]
  }>
}
export type FocusedDigestiveEvidence = {
  start: string
  end: string
  fiber: FocusedDigestiveMetric
  hydration: FocusedDigestiveMetric
  bowel: FocusedDigestiveMetric
}

/** Share terminology between retrieval and the evidence filter. A question
 * about bowel counts alone must not reveal unrelated fiber/water details. */
export function digestiveQuestionTopics(question: string): {
  fiber: boolean; hydration: boolean; bowel: boolean
} {
  const symptom = /\b(?:constipat\w*|diarrh\w*|hard stools?|pellet[- ]?like stools?)\b/i.test(question)
  return {
    fiber: symptom || /\bfib(?:er|re)\b/i.test(question),
    hydration: symptom || /\b(?:hydrat\w*|water|fluid intake|drinking enough)\b/i.test(question),
    bowel: symptom || /\b(?:bowels?|stools?|poop\w*|bristol)\b/i.test(question),
  }
}

/** Join only canonical saved events already referenced by the selected days.
 * Never infer stool type from bowel count, symptoms, or missing records.
 */
export function attachBristolTypes(
  focus: FocusedDigestiveEvidence | null,
  events: readonly { id: string; date: string; bristolType: number }[],
): FocusedDigestiveEvidence | null {
  if (!focus) return null
  const eventById = new Map(events.map((event) => [event.id, event]))
  return {
    ...focus,
    bowel: {
      ...focus.bowel,
      observations: focus.bowel.observations.map((day) => ({
        ...day,
        bristolTypes: day.sourceIds.flatMap((id) => {
          const event = eventById.get(id)
          return event && event.date === day.date && Number.isInteger(event.bristolType) &&
            event.bristolType >= 1 && event.bristolType <= 7 ? [event.bristolType] : []
        }),
      })),
    },
  }
}
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
  /** Explicit opt-in: allow Deep Dive to sample all three signals even
   * when a vague question has no digestive terminology. */
  includeBroadContext?: boolean
}): FocusedDigestiveEvidence | null {
  const topics = digestiveQuestionTopics(input.question)
  if (!input.includeBroadContext && !topics.fiber && !topics.hydration && !topics.bowel) return null
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
