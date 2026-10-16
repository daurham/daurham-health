import type { IntelligenceContextItem } from '../intelligence/shared.js'

export const NUTRITION_COMPLETENESS_QUESTION_ID = 'nutrition-verify-logged-days-v1'

export type OwnerClarification = {
  id: typeof NUTRITION_COMPLETENESS_QUESTION_ID
  question: string
  reason: string
  destination: '/nutrition'
}

const PERSONAL = /\b(i|me|my|mine)\b/i
const DECISION = /\b(trend|trends|trending|average|averages|progress|plateau|plateauing|changed?|changes|compare|comparing|comparison|enough|accurate|accuracy|should|why|improv(?:e|ed|ing|ement)|worsen(?:ed|ing)?|over time|this week|this month|last week|last month|past week|past month|last \d+ days?|last \d+ weeks?|how much)\b/i
const TOPIC = /\b(calor(?:ie|ies)|diet|food|macros?|protein|carbs?|fiber|intake|nutrition|weight|plateau|constipat(?:ion|ed)?|bowel)\b/i

/** Fail closed: a missing sample, unavailable verification service, or merely
 * low coverage never implies the owner forgot to confirm a completed food day.
 * This prompt can make an intake-trend conclusion more reliable but cannot
 * repair unreliable food-source data.
 */
export function selectOwnerClarification(
  question: string,
  missing: readonly IntelligenceContextItem[],
): OwnerClarification | null {
  if (!PERSONAL.test(question) || !DECISION.test(question) || !TOPIC.test(question)) return null
  const calorieCoverage = missing.find((item) =>
    item.key === 'nutrition.calories' &&
    /[1-9]\d* logged day\(s\), but no verified complete, source-reliable days/i.test(item.detail) &&
    !/verification unavailable/i.test(item.detail))
  if (!calorieCoverage) return null
  return {
    id: NUTRITION_COMPLETENESS_QUESTION_ID,
    question: 'Were the past food-log days you want to compare fully recorded?',
    reason: 'Some intake was logged, but Health does not have a verified complete, source-reliable day for the selected range. Confirm completed days in Nutrition only if every meal and drink was logged; otherwise mark them partial. This cannot fix missing or unreliable nutrition values.',
    destination: '/nutrition',
  }
}

export type OwnerClarificationPreference = 'never' | { laterThrough: string } | null

export function parseOwnerClarificationPreference(raw: string | null): OwnerClarificationPreference {
  if (raw === 'never') return 'never'
  if (raw?.startsWith('later:')) {
    const date = raw.slice(6)
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return { laterThrough: date }
  }
  return null
}

export function serializeOwnerClarificationPreference(value: OwnerClarificationPreference): string | null {
  if (value === 'never') return 'never'
  if (value) return 'later:' + value.laterThrough
  return null
}

export function isOwnerClarificationSuppressed(
  preference: OwnerClarificationPreference,
  today: string,
): boolean {
  return preference === 'never' || (preference != null && preference.laterThrough >= today)
}

/** Only a browser-local preference, scoped to the app surface.
 * Never store answers, symptoms, question text, or medical details here.
 */
export function ownerClarificationStorageKey(prefix: string): string {
  return 'daurham-health:owner-clarification:v1:' +
    (prefix === '' ? 'app' : prefix.replace(/[^a-z0-9/-]/gi, '').slice(0, 64)) +
    ':' + NUTRITION_COMPLETENESS_QUESTION_ID
}
