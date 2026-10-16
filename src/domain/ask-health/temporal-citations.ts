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

/** "Yesterday" and "today" depend on the actual Health-local current date,
 * which the answer validator does not own. The retrieval layer still handles
 * those; this narrower guard skips them rather than guessing from asOf.
 */
export function temporalCitationScope(question: string, asOf: string): TemporalCitationScope | null {
  if (/\b(?:today|yesterday)\b/i.test(question)) return null
  const selection = digestDateSelection(question, asOf, asOf)
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

export function groundHistoricalAnswer(
  answer: AskHealthAnswer,
  packet: Pick<AskHealthPacket, 'asOf' | 'evidence'>,
  question: string,
): AskHealthAnswer {
  const scope = temporalCitationScope(question, packet.asOf)
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
    const grounded = relevant.length > 0 &&
      domains.every((domain) => relevant.some((item) => item.domain === domain))
    if (grounded) return true
    withheld += 1
    return false
  }
  const blocks = answer.blocks.filter(keep)
  const limitations = answer.limitations.filter(keep)
  if (!withheld) return answer
  const message = 'A personal historical measurement or trend statement was withheld because its citations did not establish the requested ' +
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
