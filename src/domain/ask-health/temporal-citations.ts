import { digestDateSelection } from './focused-digestive.js'
import type { AskEvidence, AskHealthAnswer, AskHealthPacket } from './types.js'

/** Conservative structural safeguard, not a semantic fact checker.
 * We only inspect clearly affirmative, owner-specific historical
 * measurements/trends. A valid ID or a broad selected-range summary is NOT
 * proof that it describes the day or calendar window the owner asked about.
 *
 * No AI calls: if one such statement has no temporally scoped source, withhold
 * it and disclose the gap instead of spending a second provider request.
 */
export type TemporalCitationScope = { start: string; end: string }

/** Relative-day questions are only grounded when the packet explicitly carries
 * the actual Health-local date. A selected historical asOf is NOT "today".
 * Direct/legacy packet callers with no healthToday conservatively skip these.
 */
export function temporalCitationScope(
  question: string, asOf: string, healthToday?: string,
): TemporalCitationScope | null {
  if (/\b(?:today|yesterday)\b/i.test(question) && !healthToday) return null
  const selection = digestDateSelection(question, healthToday ?? asOf, asOf)
  if (selection.issue) return null
  if (selection.date) return { start: selection.date, end: selection.date }
  return selection.window ? { start: selection.window.start, end: selection.window.end } : null
}

/** Only evidence with source dates or explicit source-qualified request
 * coverage can verify a historical measurement. Default packet period,
 * range metadata, unrelated current goals and baseline/trend summaries cannot.
 */
export function citationCoversHistoricalScope(item: AskEvidence, scope: TemporalCitationScope): boolean {
  if (!item.substantive) return false
  const dates = item.evidenceDates ?? []
  if (dates.length > 0) {
    return dates.every((date) => date >= scope.start && date <= scope.end)
  }
  const coverage = item.coverage
  if (!coverage) return false
  if (scope.start === scope.end &&
      coverage.requestedDate === scope.start && coverage.requestedDateScope === 'in_range') {
    return Number(coverage.selectedDays ?? coverage.eligibleAppearances ?? 0) > 0
  }
  return coverage.requestedWindowStart === scope.start &&
    coverage.requestedWindowEnd === scope.end &&
    coverage.requestedWindowScope === 'in_range' &&
    Number(coverage.observedDaysInWindow ?? coverage.eligibleAppearances ?? 0) > 0
}

/** High precision rather than a general NLP judge: numeric reported
 * measurements or affirmative trend words in owner context. Questions,
 * advice, hypothetical mechanisms and explicit uncertainty are untouched.
 */
export function affirmativeOwnerMetricClaim(text: string): boolean {
  const owner = /\b(?:you|your|yours|my|mine|i|the owner|health logs|your records|your logs)\b/i
  const quantity = /\b\d+(?:\.\d+)?\s*(?:kg|kilograms?|lbs?|pounds?|g|grams?|ml|milliliters?|kcal|calories|steps?|reps?|times?|sessions?|movements?|minutes?|hours?)\b/i
  const factVerb = /\b(?:recorded|logged|measured|averaged|lifted|completed|consumed|totaled|totalled|performed|improved|increased|decreased)\b/i
  const unsure = /\b(?:cannot|can't|not enough|unknown|uncertain|unavailable|insufficient|missing|unverified|no reliable|not proven|did not|does not|didn't)\b/i
  const conditional = /\b(?:could|might|may|should|would|if|consider|recommend|suggest|hypothetical|typically|generally)\b/i
  return owner.test(text) && (quantity.test(text) || factVerb.test(text)) &&
    !unsure.test(text) && !conditional.test(text)
}

/** A matching day alone is insufficient if an unrelated domain is cited.
 * Only act on explicit domain keywords; avoid guessing which owner metric
 * an ambiguous "number" means.
 */
export function explicitlyClaimedMetricDomains(text: string): string[] {
  const patterns: Array<[string, RegExp]> = [
    ['training', /\b(?:bench(?:\s+press)?|squat|deadlift|strength|lifted|reps?|working sets?)\b/i],
    ['hydration', /\b(?:water|hydrat\w*|fluid intake|fluid consumption)\b/i],
    ['nutrition', /\b(?:fib(?:er|re)|calor(?:ie|ies)|protein|carbohydrates?|carbs?|sodium|nutrients?)\b/i],
    ['bowel', /\b(?:bowels?|stools?|poop\w*|bristol|constipat\w*|diarrh\w*)\b/i],
    ['body', /\b(?:weigh(?:t|ed)?|body fat|waist|bmi)\b/i],
    ['sleep', /\b(?:sleep|sleeping|rem)\b/i],
    ['activity', /\b(?:steps?|walking|active energy|resting heart rate)\b/i],
  ]
  return patterns.filter(([, pattern]) => pattern.test(text)).map(([domain]) => domain)
}

type RecordedQuantity = { value: number; unit: 'kg' | 'lb' | 'g' | 'ml' | 'kcal' | 'reps' | 'steps' | 'sessions' | 'movements' }

function recordedUnit(raw: string): RecordedQuantity['unit'] | null {
  if (/^(?:kg|kilogram)/i.test(raw)) return 'kg'
  if (/^(?:lb|pound)/i.test(raw)) return 'lb'
  if (/^(?:g|gram)/i.test(raw)) return 'g'
  if (/^(?:ml|millilit)/i.test(raw)) return 'ml'
  if (/^(?:kcal|calorie)/i.test(raw)) return 'kcal'
  if (/^rep/i.test(raw)) return 'reps'
  if (/^step/i.test(raw)) return 'steps'
  if (/^session/i.test(raw)) return 'sessions'
  if (/^movement/i.test(raw)) return 'movements'
  return null
}

/** Intentionally excludes unqualified numbers, dates, percentages, macros in
 * different units, medication doses, and inferred conversions. Claim-value
 * comparison applies only to literal supported measurement-unit phrases.
 */
export function literalOwnerQuantities(text: string): RecordedQuantity[] {
  const pattern = /\b(\d+(?:\.\d+)?)\s*(kilograms?|kg|pounds?|lbs?|grams?|g|millilit(?:ers?|res?)|ml|kcal|calories?|reps?|steps?|sessions?|movements?)\b/gi
  return [...text.matchAll(pattern)].flatMap((match) => {
    const value = Number(match[1])
    const unit = recordedUnit(match[2] ?? '')
    return unit && Number.isFinite(value) ? [{ value, unit }] : []
  })
}

function closelyMatches(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  // Presentation may round a verified value to one decimal, but do not accept
  // arbitrary "about" amounts or nearby unrelated observations.
  return Math.abs(a - b) < 0.051
}

function numericEvidenceSupports(
  quantity: RecordedQuantity,
  sources: readonly AskEvidence[],
  claim: string,
  windowAggregate: boolean,
): boolean {
  const mean = /\b(?:averag(?:e|ed)|mean|per (?:logged|verified|observed) day)\b/i.test(claim)
  const candidate = sources.some((source) => {
    const c = source.coverage
    // A requested window aggregate has no complete-day numeric backing
    // unless the source explicitly carries a recorded sum or conditional mean.
    if (windowAggregate) {
      const expectedUnit = source.domain === 'hydration' ? 'ml'
        : source.domain === 'nutrition' ? 'g'
        : source.domain === 'bowel' ? 'movements' : null
      if (!expectedUnit || quantity.unit !== expectedUnit) return false
      const number = mean ? c?.meanPerObservedDay : c?.recordedWindowSum
      return typeof number === 'number' && closelyMatches(quantity.value, number)
    }
    const ownUnit = recordedUnit(source.unit ?? '')
    if (ownUnit === quantity.unit &&
        typeof source.value === 'number' && closelyMatches(quantity.value, source.value)) {
      return true
    }
    // A representative comparable training set includes separately typed
    // load and reps. Never mistake its estimated 1RM for the recorded load.
    if (source.id.startsWith('training.focus.set.')) {
      if (quantity.unit === 'kg' && !/\b(?:estimated|estimate|e1rm|1rm|one.rep max)\b/i.test(claim) &&
          typeof c?.recordedLoadKg === 'number' &&
          closelyMatches(quantity.value, c.recordedLoadKg)) return true
      if (quantity.unit === 'reps' && typeof c?.reps === 'number' &&
          closelyMatches(quantity.value, c.reps)) return true
    }
    return false
  })
  return candidate
}

export function groundHistoricalAnswer(
  answer: AskHealthAnswer,
  packet: Pick<AskHealthPacket, 'asOf' | 'healthToday' | 'evidence'>,
  question: string,
): AskHealthAnswer {
  const scope = temporalCitationScope(question, packet.asOf, packet.healthToday)
  if (!scope) return answer
  const byId = new Map(packet.evidence.map((item) => [item.id, item]))
  let withheld = 0
  const keep = (block: AskHealthAnswer['blocks'][number]) => {
    if (!affirmativeOwnerMetricClaim(block.text)) return true
    const windowAggregate = scope.start !== scope.end &&
      /\b(?:total(?:ed)?|sum(?:med)?|averag(?:e|ed)|throughout|per day|per week|during (?:the|that|last|this)|last week|this week|last month|this month)\b/i.test(block.text)
    const relevant = block.evidenceRefs.flatMap((id) => {
      const cited = byId.get(id)
      if (!cited || !citationCoversHistoricalScope(cited, scope)) return []
      // A single dated set/event cannot substantiate a seven-day aggregate.
      if (windowAggregate && !(cited.coverage?.requestedWindowStart === scope.start &&
        cited.coverage?.requestedWindowEnd === scope.end &&
        cited.coverage?.requestedWindowScope === 'in_range')) return []
      return [cited]
    })
    const domains = explicitlyClaimedMetricDomains(block.text)
    const values = literalOwnerQuantities(block.text)
    const hasVerifiedValue = values.every((quantity) => numericEvidenceSupports(
      quantity, relevant, block.text, windowAggregate,
    ))
    const grounded = relevant.length > 0 && hasVerifiedValue &&
      domains.every((domain) => relevant.some((item) => item.domain === domain))
    if (grounded) return true
    withheld += 1
    return false
  }
  const blocks = answer.blocks.filter(keep)
  const limitations = answer.limitations.filter(keep)
  if (!withheld) return answer
  const message = 'A personal historical measurement or trend statement was withheld because the cited date, metric domain, or recorded numeric value did not establish the requested ' +
    scope.start + (scope.end === scope.start ? ' date.' : ' through ' + scope.end + ' window.') +
    ' Health has not verified that statement for this period; check the saved records or choose a wider evidence range.'
  return {
    blocks: blocks.length > 0
      ? blocks
      : [{ text: 'I cannot verify a personal measurement or trend for the requested historical period from the supplied, date-matched Health evidence.', evidenceRefs: [] }],
    limitations: [...limitations, { text: message, evidenceRefs: [] }],
    followUps: answer.followUps,
  }
}
