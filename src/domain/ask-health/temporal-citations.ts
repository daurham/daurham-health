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
export function historicalDateIssue(
  question: string, asOf: string, healthToday?: string,
): 'invalid_or_ambiguous' | 'unsupported_period' | null {
  // Do not resolve relative days against a selected historical asOf.
  if (/\b(?:today|yesterday)\b/i.test(question) && !healthToday) return null
  return digestDateSelection(question, healthToday ?? asOf, asOf).issue
}

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
  // Recognize unsupported measurement forms too, so a plausible personal
  // claim cannot bypass grounding merely by writing "liters" or "%".
  const quantity = /\b\d[\d,.]*\s*(?:kg|kilograms?|lbs?|pounds?|g|grams?|ml|milliliters?|kcal|calories|steps?|reps?|times?|sessions?|movements?|minutes?|hours?|mg|milligrams?|liters?|litres?|l|ounces?|oz)\b|\b\d[\d,.]*\s*%/i
  const factVerb = /\b(?:recorded|logged|measured|averaged|lifted|completed|consumed|totaled|totalled|performed|improved|increased|decreased)\b/i
  const unsure = /\b(?:cannot|can't|not enough|unknown|uncertain|unavailable|insufficient|missing|unverified|no reliable|not proven|did not|does not|didn't)\b/i
  const conditional = /\b(?:could|might|may|should|would|if|consider|recommend|suggest|hypothetical|typically|generally)\b/i
  // A verified log followed by speculative interpretation still contains an
  // affirmative logged fact that must be audited. Conversely "you might have
  // logged ..." is a hypothetical, not an owner measurement assertion.
  const factualPrefix = text.split(/\b(?:which|that)\s+(?:(?:it|this)\s+)?(?:might|may|could)\b/i)[0] ?? text
  return owner.test(factualPrefix) && (quantity.test(factualPrefix) || factVerb.test(factualPrefix)) &&
    !unsure.test(factualPrefix) && !conditional.test(factualPrefix)
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
type Nutrient = 'fiber' | 'protein' | 'carbs' | 'fat' | 'sodium'
type QualifiedQuantity = RecordedQuantity & {
  nutrient: Nutrient | null
  aggregation: 'mean' | 'sum' | null
  liftKind: 'estimated' | 'load' | null
}

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

function nutrientName(raw: string): Nutrient {
  const value = raw.toLowerCase()
  if (value === 'fiber' || value === 'fibre') return 'fiber'
  if (value === 'carb' || value === 'carbs' || value.startsWith('carbohydrate')) return 'carbs'
  return value as Nutrient
}

/** Read precisely typed units, allowing standard 1,234.5 grouping without
 * interpreting comma-delimited date fragments as owner measurements. Context
 * is localized to EACH number; two values in one block can be a sum and mean,
 * or a lifted load and derived 1RM, without confusing them.
 */
function qualifiedOwnerQuantities(text: string): QualifiedQuantity[] {
  const pattern = /\b((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(kilograms?|kg|pounds?|lbs?|grams?|g|millilit(?:ers?|res?)|ml|kcal|calories?|reps?|steps?|sessions?|movements?)\b/gi
  const matches = [...text.matchAll(pattern)]
  const qualifiers = (text: string) => {
    const words = [...text.matchAll(/\b(averag(?:e|ed|ing)|mean|total(?:ed)?|sum(?:med)?|estimated|estimate|e1rm|1rm|one.rep max|lifted|load(?:ed)?)\b/gi)]
    return words[words.length - 1]?.[1]?.toLowerCase() ?? null
  }
  return matches.flatMap((match, i) => {
    const value = Number((match[1] ?? '').replace(/,/g, ''))
    const unit = recordedUnit(match[2] ?? '')
    if (!unit || !Number.isFinite(value)) return []
    const offset = match.index ?? 0
    const priorEnd = i > 0 ? (matches[i - 1]!.index ?? 0) + matches[i - 1]![0].length : 0
    const before = text.slice(Math.max(priorEnd, offset - 120), offset)
    const after = text.slice(offset + match[0].length, offset + match[0].length + 35)
    const nutrientAfter = /^\s*(?:(?:of|in)\s+)?(fiber|fibre|protein|carbs?|carbohydrates?|fat|sodium)\b/i.exec(after)
    const nutrientMatches = [...before.matchAll(/\b(fiber|fibre|protein|carbs?|carbohydrates?|fat|sodium)\b/gi)]
    const nutrientBefore = nutrientMatches[nutrientMatches.length - 1]?.[1]
    const nutrient = unit === 'g' && (nutrientAfter?.[1] || nutrientBefore)
      ? nutrientName(nutrientAfter?.[1] ?? nutrientBefore!) : null
    const near = qualifiers(before)
    const afterRate = /^\s*per\s+(?:(?:logged|observed|verified)\s+)?(?:day|date)\b/i.test(after)
    const aggregation = afterRate || /^(?:averag|mean)/.test(near ?? '') ? 'mean'
      : /^(?:total|sum)/.test(near ?? '') ? 'sum' : null
    const liftKind = /^(?:estimated|estimate|e1rm|1rm|one.rep max)/.test(near ?? '') ? 'estimated'
      : /^(?:lifted|load)/.test(near ?? '') ? 'load' : null
    return [{ value, unit, nutrient, aggregation, liftKind }]
  })
}

/** Detect unsupported measurement expressions before reading parsed values.
 * Otherwise a malformed "1,5 g" could be partially parsed as "5 g" and
 * accidentally certified, or "1.5 L"/"35%" could bypass all numeric checks.
 * We do not silently convert units, locale separators, signed changes,
 * partial decimals, or medication quantities in this narrow source audit.
 */
export function unsupportedHistoricalMeasurement(text: string): boolean {
  const units = '(?:kilograms?|kg|pounds?|lbs?|grams?|g|millilit(?:ers?|res?)|ml|kcal|calories?|reps?|steps?|sessions?|movements?)'
  const candidate = new RegExp('\\b(-?\\d[\\d,.]*|\\.?\\d+)\\s*(' + units + ')\\b', 'gi')
  const validUSNumber = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/
  for (const match of text.matchAll(candidate)) {
    const numeric = match[1] ?? ''
    if (!validUSNumber.test(numeric)) return true
    const position = match.index ?? 0
    // Reject a detached final fragment, e.g. the "5 g" inside "1,5 g".
    if (position > 0 && /[\d,.-]/.test(text[position - 1]!)) return true
  }
  if (/\b-?\d[\d,.]*\s*(?:milligrams?|mg|liters?|litres?|l|ounces?|oz|fl\.?\s*oz|cups?)\b/i.test(text)) return true
  if (/\b-?\d[\d,.]*\s*%/.test(text)) return true
  // Space-grouped thousands are locale-dependent: do not certify a partial
  // "234 steps" substring of a claimed "1 234 steps" value.
  if (/\b\d{1,3}(?:[ \u00a0]\d{3})+\s*(?:kg|g|ml|lbs?|kcal|calories?|reps?|steps?|sessions?|movements?)\b/i.test(text)) return true
  if (/(?:^|[^\w])(?:\.\d+|\d+\.)\s*(?:kg|g|ml|lbs?|kcal|calories?|reps?|steps?|sessions?|movements?)\b/i.test(text)) return true
  return false
}

/** Exposes supported literal quantities without prose qualifiers; numbers
 * with other units or unsupported conversions remain outside this audit.
 */
export function literalOwnerQuantities(text: string): RecordedQuantity[] {
  return qualifiedOwnerQuantities(text).map(({ value, unit }) => ({ value, unit }))
}

function closelyMatches(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  // Presentation may round a verified value to one decimal, but do not accept
  // arbitrary "about" amounts or nearby unrelated observations.
  return Math.abs(a - b) < 0.051
}

/** Domain alone is not sufficient: two nutrition facts can both be measured
 * in grams yet describe entirely different nutrients.
 */
function matchesNutrientSource(source: AskEvidence, nutrient: Nutrient | null): boolean {
  if (!nutrient) return true
  if (source.domain !== 'nutrition') return false
  if (nutrient === 'fiber') {
    return source.id.startsWith('digestive.focus.fiber.') ||
      source.id === 'digestive.focus.coverage.fiber' || source.id === 'nutrition.fiber'
  }
  return source.id === 'nutrition.' + nutrient
}

function numericEvidenceSupports(
  quantity: QualifiedQuantity,
  sources: readonly AskEvidence[],
  claim: string,
  windowAggregate: boolean,
): boolean {
  const mean = quantity.aggregation === 'mean' ||
    (quantity.aggregation === null && /\b(?:averag(?:e|ed)|mean|per (?:logged|verified|observed) day)\b/i.test(claim))
  return sources.some((source) => {
    if (!matchesNutrientSource(source, quantity.nutrient)) return false
    const c = source.coverage
    // A requested window aggregate has no complete-day numeric backing
    // unless the source explicitly carries a recorded sum or conditional mean.
    if (windowAggregate && !(source.domain === 'training' && quantity.unit === 'sessions')) {
      const expectedUnit = source.domain === 'hydration' ? 'ml'
        : source.domain === 'nutrition' ? 'g'
        : source.domain === 'bowel' ? 'movements' : null
      if (!expectedUnit || quantity.unit !== expectedUnit) return false
      const number = mean ? c?.meanPerObservedDay : c?.recordedWindowSum
      return typeof number === 'number' && closelyMatches(quantity.value, number)
    }
    const ownUnit = recordedUnit(source.unit ?? '')
    if (source.id.startsWith('training.focus.set.')) {
      if (quantity.unit === 'kg') {
        // Distinct physical quantities, even though both are measured in kg.
        if (quantity.liftKind === 'load') return typeof c?.recordedLoadKg === 'number' &&
          closelyMatches(quantity.value, c.recordedLoadKg)
        if (quantity.liftKind === 'estimated') return typeof source.value === 'number' && ownUnit === 'kg' &&
          closelyMatches(quantity.value, source.value)
        return (typeof c?.recordedLoadKg === 'number' &&
          closelyMatches(quantity.value, c.recordedLoadKg)) ||
          (typeof source.value === 'number' && ownUnit === 'kg' &&
            closelyMatches(quantity.value, source.value))
      }
      if (quantity.unit === 'reps') return typeof c?.reps === 'number' &&
        closelyMatches(quantity.value, c.reps)
    }
    if (windowAggregate && source.domain === 'training' && quantity.unit === 'sessions') {
      return typeof c?.eligibleAppearances === 'number' &&
        closelyMatches(quantity.value, c.eligibleAppearances)
    }
    return ownUnit === quantity.unit &&
      typeof source.value === 'number' && closelyMatches(quantity.value, source.value)
  })
}

/** No observational packet, including a valid relationship statistic, proves
 * a personal cause. Only unmistakably asserted owner causation is blocked;
 * explicit uncertainty/negation and educational mechanism statements remain.
 */
export function definitiveOwnerCause(text: string): boolean {
  if (!/\b(?:you|your|yours|my|mine|i|myself|owner'?s)\b/i.test(text)) return false
  if (/\b(?:may|might|could|possibly|potentially|perhaps|hypothes(?:is|ized)|hypothetical|cannot|can't|not|no proof|no evidence|doesn't|didn't|uncertain|unknown|insufficient|plausible|suggests?)\b/i.test(text)) return false
  return /\b(?:caused|causing|triggered|triggering|led to|resulted in|responsible for|explains? why|because of|due to|cured|fixed|prevented)\b/i.test(text) ||
    (/\b(?:therefore|which is why)\b/i.test(text) && explicitlyClaimedMetricDomains(text).length > 1)
}

/** Descriptive owner-specific association is separate from two independently
 * recorded metrics. An assertion that they moved together requires an actual
 * relationship calculation, not a pair of date-aligned source values.
 */
export function affirmativeOwnerAssociation(text: string): boolean {
  if (!/\b(?:you|your|yours|my|mine|i|owner'?s)\b/i.test(text)) return false
  if (/\b(?:not|cannot|can't|didn't|doesn't|unknown|uncertain|no evidence|insufficient|hypothetical|could|might|may|possibly|potentially)\b/i.test(text)) return false
  return /\b(?:correlat(?:e|es|ed|ion|ions)|associat(?:ed|ion)|linked|tracked (?:with|alongside)|moved together|rose together|fell together|inversely related)\b/i.test(text) ||
    /\b(?:on days (?:when|with)|whenever)\b/i.test(text) &&
      explicitlyClaimedMetricDomains(text).length > 1
}

function relationshipCitationSupports(
  ids: readonly string[],
  evidence: ReadonlyMap<string, AskEvidence>,
  scope: TemporalCitationScope | null,
): boolean {
  return ids.some((id) => {
    const source = evidence.get(id)
    return Boolean(source && source.id.startsWith('intelligence.relationship.') &&
      source.domain === 'intelligence' && source.substantive &&
      (scope == null || citationCoversHistoricalScope(source, scope)))
  })
}

export function groundHistoricalAnswer(
  answer: AskHealthAnswer,
  packet: Pick<AskHealthPacket, 'asOf' | 'healthToday' | 'evidence'>,
  question: string,
): AskHealthAnswer {
  const scope = temporalCitationScope(question, packet.asOf, packet.healthToday)
  const dateIssue = historicalDateIssue(question, packet.asOf, packet.healthToday)
  const byId = new Map(packet.evidence.map((item) => [item.id, item]))
  if (!scope && !dateIssue && !answer.blocks.concat(answer.limitations).some((block) =>
    definitiveOwnerCause(block.text) || affirmativeOwnerAssociation(block.text))) return answer
  let withheld = 0
  const keep = (block: AskHealthAnswer['blocks'][number]) => {
    if (definitiveOwnerCause(block.text) ||
        (affirmativeOwnerAssociation(block.text) &&
         !relationshipCitationSupports(block.evidenceRefs, byId, scope))) {
      withheld += 1
      return false
    }
    if (!affirmativeOwnerMetricClaim(block.text)) return true
    if (dateIssue) {
      withheld += 1
      return false
    }
    if (!scope) return true
    if (unsupportedHistoricalMeasurement(block.text)) {
      withheld += 1
      return false
    }
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
    const values = qualifiedOwnerQuantities(block.text)
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
  const message = dateIssue
    ? 'A personal historical claim was withheld because the requested date or period is ambiguous or unsupported. Ask for one YYYY-MM-DD or a supported week/month; the selected-range records cannot resolve this comparison automatically.'
    : scope
      ? 'A personal historical claim was withheld because its cited date, metric domain, numeric value, or association was not established for the requested ' +
        scope.start + (scope.end === scope.start ? ' date.' : ' through ' + scope.end + ' window.') +
        ' An observational association does not prove a cause.'
      : 'An owner-specific causal or relationship claim was withheld because the supplied evidence cannot establish causation or did not include a qualifying personal relationship calculation.'
  return {
    blocks: blocks.length > 0
      ? blocks
      : [{ text: scope || dateIssue
        ? 'I cannot verify a personal measurement or trend for the requested historical period from the supplied, date-matched Health evidence.'
        : 'I cannot establish a personal cause or association from the supplied Health evidence.', evidenceRefs: [] }],
    limitations: [...limitations, { text: message, evidenceRefs: [] }],
    followUps: answer.followUps,
  }
}
