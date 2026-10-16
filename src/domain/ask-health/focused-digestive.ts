import type { HealthIntelligenceSnapshot, IntelligenceObservation } from '../intelligence/shared.js'
import { addCalendarDays, weekStartMonday } from '../training-plan.js'
import type { DigestiveBowelWindow } from './digestive-window.js'
import type { DigestivePairingReadiness } from './digestive-pairing.js'

/** PIQ-3.3: question-relevant observations from the *already-loaded*,
 * quality-gated owner intelligence snapshot. Never re-query private records.
 */
export type FocusedDigestiveMetric = {
  kind: 'fiber' | 'hydration' | 'bowel'
  recordedDays: number
  /** Verified, source-reliable whole-day FOOD logs only. */
  verifiedDays?: number
  verificationStatus?: 'available' | 'unavailable'
  /** Calculated across ALL eligible window observations, never just sampled days. */
  windowSummary?: {
    calendarDays: number
    daysWithObservations: number
    summedRecordedValue: number | null
    meanPerObservedDay: number | null
    provisionalObservedDays: number
  }
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
  /** One unambiguous calendar day requested in the question, if recognized. */
  requestedDate?: { date: string; inSelectedRange: boolean } | null
  /** Unresolvable calendar scope: suppress recent samples rather than imply they answer it. */
  dateSelectionIssue?: 'invalid_or_ambiguous' | 'unsupported_period' | null
  /** Relative window resolved against the selected as-of date; never silently clipped. */
  requestedWindow?: {
    start: string
    end: string
    label: string
    calendarDays: number
    inSelectedRange: boolean
  } | null
  fiber: FocusedDigestiveMetric
  hydration: FocusedDigestiveMetric
  bowel: FocusedDigestiveMetric
  /** Full-window totals are separate from the existing three sampled example days. */
  bowelWindow?: DigestiveBowelWindow | null
  digestivePairing?: DigestivePairingReadiness | null
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
/** Historical date selection is a deterministic calendar operation, not an
 * inference from sparse Health data. Multi-day windows are inclusive and
 * anchored to selected asOf, not server UTC; "last week" means the preceding
 * complete Monday–Sunday week, while trailing N days includes asOf.
 */
export type DigestiveDateSelection = {
  date: string | null
  window: { start: string; end: string; label: string; calendarDays: number } | null
  issue: 'invalid_or_ambiguous' | 'unsupported_period' | null
}

function daySpan(start: string, end: string): number {
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000) + 1
}

function previousMonthStart(asOf: string): string {
  const first = asOf.slice(0, 7) + '-01'
  return addCalendarDays(first, -1).slice(0, 7) + '-01'
}

export function digestDateSelection(
  question: string,
  today: string,
  asOf: string = today,
): DigestiveDateSelection {
  const dates = question.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? []
  const valid = dates.filter((date) => {
    const parsed = new Date(date + 'T00:00:00.000Z')
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date
  })
  const relative = [
    ...(/\byesterday\b/i.test(question) ? [addCalendarDays(today, -1)] : []),
    ...(/\btoday\b/i.test(question) ? [today] : []),
  ]
  const requested = [...new Set([...valid, ...relative])]
  const ambiguousFormat = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b/i.test(question)
  const trailing = question.match(/\b(?:last|past|previous)\s+(\d+)\s+days?\b/i)
  const week = /\b(last|previous|this)\s+week\b/i.exec(question)
  const month = /\b(last|previous|this)\s+month\b/i.exec(question)
  // Remove the ONE supported span before looking for unsupported extras.
  // "last week and last year" must not silently narrow to "last week".
  const remaining = [trailing?.[0], week?.[0], month?.[0]]
    .filter((span): span is string => span != null)
    .reduce((text, span) => text.replace(span, ''), question)
  const unexpectedPeriod = /\b(?:last|past|previous|this|next)\s+(?:year|few\s+days|(?:\d+\s+)?weeks?|(?:\d+\s+)?months?|(?:\d+\s+)?years?)\b/i.test(remaining)
    || /\b(?:last|past|previous|this|next)\s+\d+\s+days?\b/i.test(remaining)
  const periodCount = Number(Boolean(trailing)) + Number(Boolean(week)) + Number(Boolean(month))
  // A genuinely temporal "from DATE/PERIOD" is a range, not a single
  // requested day. Plain causal "from" ("stools from low fiber?") is NOT a
  // historical date expression and must not suppress useful dated evidence.
  const temporalFrom = /\bfrom\s+(?:(?:\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{2,4})\b|(?:today|yesterday|tomorrow)\b|(?:last|past|previous|this|next)\s+(?:\d+\s+days?|weeks?|months?|years?)\b)/i.test(question)
  const relational = temporalFrom ||
    /\b(?:since|between|until|through|versus|vs\.?|compared?\s+(?:to|with))\b/i.test(question)
  const namedMonth = /\b(?:in|during|last|this|next|since|from|through|until)\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{4}\b/i.test(question)
  if (valid.length !== dates.length || ambiguousFormat || namedMonth || relational ||
      requested.length > 1 || (requested.length > 0 && periodCount > 0) || periodCount > 1 ||
      (periodCount > 0 && unexpectedPeriod)) {
    return { date: null, window: null, issue: 'invalid_or_ambiguous' }
  }
  if (requested.length === 1) return { date: requested[0]!, window: null, issue: null }
  if (periodCount === 0) {
    return { date: null, window: null, issue: unexpectedPeriod ? 'unsupported_period' : null }
  }

  let start: string
  let end = asOf
  let label: string
  if (trailing) {
    const n = Number(trailing[1])
    if (!Number.isSafeInteger(n) || n < 1 || n > 90) {
      return { date: null, window: null, issue: 'unsupported_period' }
    }
    start = addCalendarDays(asOf, 1 - n)
    label = 'Trailing ' + n + ' calendar days through ' + asOf
  } else if (week) {
    const monday = weekStartMonday(asOf)
    const previous = week[1]!.toLowerCase() !== 'this'
    start = previous ? addCalendarDays(monday, -7) : monday
    end = previous ? addCalendarDays(monday, -1) : asOf
    label = previous ? 'Previous complete Monday–Sunday week' : 'Current week through ' + asOf
  } else {
    const previous = month![1]!.toLowerCase() !== 'this'
    const first = asOf.slice(0, 7) + '-01'
    start = previous ? previousMonthStart(asOf) : first
    end = previous ? addCalendarDays(first, -1) : asOf
    label = previous ? 'Previous complete calendar month' : 'Current month through ' + asOf
  }
  const calendarDays = daySpan(start, end)
  if (calendarDays < 1 || calendarDays > 90) {
    return { date: null, window: null, issue: 'unsupported_period' }
  }
  return { date: null, window: { start, end, label, calendarDays }, issue: null }
}

export function requestedDigestiveCalendarDay(question: string, today: string): string | null {
  return digestDateSelection(question, today).date
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
  const dateSelection = digestDateSelection(input.question, today, snapshot.asOf)
  const askedDate = dateSelection.date
  const requestedDate = askedDate == null ? null : {
    date: askedDate,
    inSelectedRange: askedDate >= snapshot.period.start &&
      askedDate <= snapshot.period.end && askedDate <= snapshot.asOf && askedDate <= today,
  }
  const requestedWindow = dateSelection.window == null ? null : {
    ...dateSelection.window,
    inSelectedRange: dateSelection.window.start >= snapshot.period.start &&
      dateSelection.window.end <= snapshot.period.end &&
      dateSelection.window.end <= snapshot.asOf && dateSelection.window.end <= today,
  }
  // No silently clipped windows. A larger requested range must be explicitly
  // selected rather than turned into a misleading partial historical total.
  const windowFilter = (items: IntelligenceObservation[]) =>
    requestedWindow == null ? items : requestedWindow.inSelectedRange
      ? items.filter((item) => item.date >= requestedWindow.start && item.date <= requestedWindow.end)
      : []
  const sample = (observations: IntelligenceObservation[]) =>
    dateSelection.issue ? [] :
      requestedDate ? observations.filter((item) =>
        requestedDate.inSelectedRange && item.date === requestedDate.date) :
      requestedWindow && !requestedWindow.inSelectedRange ? [] :
      recent(windowFilter(observations))
  const windowSummary = (source: IntelligenceObservation[]) => {
    if (!requestedWindow || !requestedWindow.inSelectedRange || dateSelection.issue) return undefined
    const scoped = windowFilter(source)
    const sum = scoped.reduce((total, item) => total + item.value, 0)
    return {
      calendarDays: requestedWindow.calendarDays,
      daysWithObservations: scoped.length,
      summedRecordedValue: scoped.length > 0 ? sum : null,
      meanPerObservedDay: scoped.length > 0 ? sum / scoped.length : null,
      provisionalObservedDays: scoped.filter((item) => item.date === today).length,
    }
  }
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
    kind, recordedDays: windowFilter(source).length,
    windowSummary: windowSummary(source),
    observations: sample(source).map((o) => ({
      date: o.date, value: o.value, sourceIds: [...o.sourceIds].sort(),
      provisional: o.date === today,
    })),
  })
  const fiberMetric: FocusedDigestiveMetric = {
    kind: 'fiber',
    recordedDays: windowFilter(fiberAll).length,
    verifiedDays: windowFilter(verified).length,
    verificationStatus: fiberStatus === 'available' ? 'available' : 'unavailable',
    windowSummary: windowSummary(verified),
    observations: sample(verified).map((o) => ({
      date: o.date, value: o.value, sourceIds: [...o.sourceIds].sort(),
      provisional: false,
    })),
  }
  return {
    start: snapshot.period.start,
    end: snapshot.period.end,
    requestedDate,
    requestedWindow,
    dateSelectionIssue: dateSelection.issue,
    fiber: fiberMetric,
    hydration: present('hydration', water),
    bowel: present('bowel', bowel),
  }
}
