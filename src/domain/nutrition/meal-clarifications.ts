export const MEAL_CLARIFICATION_KINDS = ['preparation', 'hidden_fat', 'sauce', 'portion', 'ingredient_identity', 'other'] as const
export type MealClarificationKind = (typeof MEAL_CLARIFICATION_KINDS)[number]

export const MEAL_CLARIFICATION_ANSWER_KINDS = ['yes_no', 'short_text'] as const
export type MealClarificationAnswerKind = (typeof MEAL_CLARIFICATION_ANSWER_KINDS)[number]

export const MEAL_CLARIFICATION_YES_NO = ['yes', 'no', 'not_sure'] as const
export type MealClarificationYesNo = (typeof MEAL_CLARIFICATION_YES_NO)[number]

export const MEAL_CLARIFICATION_MAX = 3
export const MEAL_CLARIFICATION_QUESTION_MAX = 180
export const MEAL_CLARIFICATION_ANSWER_MAX = 160

export type MealClarification = {
  id: string
  kind: MealClarificationKind
  answerKind: MealClarificationAnswerKind
  question: string
}

export type MealClarificationAnswer = {
  id: string
  answer: string
}

export type MealClarificationFailure = {
  status: 400 | 409
  code: 'CLARIFICATION_ANSWER' | 'stale_clarification' | 'CONTEXT_TOO_LONG' | 'CLARIFICATION_PROVIDER_UNSUPPORTED'
}

const KIND_SET = new Set<string>(MEAL_CLARIFICATION_KINDS)
const ANSWER_KIND_SET = new Set<string>(MEAL_CLARIFICATION_ANSWER_KINDS)
const YES_NO_SET = new Set<string>(MEAL_CLARIFICATION_YES_NO)

const HEALTH_QUESTION = /calorie goal|lose weight|cutting carbs|apple health|usually eat|\bdiagnos|\btreatment\b|\bsupplement|\bweight\b|\bweigh\b|\bsleep\b|\bgoals?\b/i
const PREFILLED_QUANTITY = /\b\d+(?:\.\d+)?\s*(?:oz|g|grams|kcal|calories|calorie)\b/i
const NUMBERED_MACRO = /\b\d+(?:\.\d+)?\b/
const MACRO_WORD = /\b(?:calories|calorie|kcal|protein|carbs|carb|fat|macro|fiber)\b/i

function clarificationId(index: number): string {
  return `c${index + 1}`
}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}

function dropQuestion(question: string): boolean {
  if (!/[a-z]/i.test(question)) {
    return true
  }
  if (HEALTH_QUESTION.test(question)) {
    return true
  }
  if (PREFILLED_QUANTITY.test(question)) {
    return true
  }
  if (NUMBERED_MACRO.test(question) && MACRO_WORD.test(question)) {
    return true
  }
  return false
}

export function sanitizeMealClarifications(raw: unknown): MealClarification[] {
  if (!Array.isArray(raw)) {
    return []
  }
  const accepted: MealClarification[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (accepted.length >= MEAL_CLARIFICATION_MAX) {
      break
    }
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue
    }
    const source = item as Record<string, unknown>
    const kind = typeof source.kind === 'string' ? source.kind : ''
    const answerKind = typeof source.answerKind === 'string' ? source.answerKind : ''
    const question = typeof source.question === 'string' ? source.question.trim() : ''
    if (!KIND_SET.has(kind) || !ANSWER_KIND_SET.has(answerKind)) {
      continue
    }
    if (!question || question.length > MEAL_CLARIFICATION_QUESTION_MAX || dropQuestion(question)) {
      continue
    }
    const normalized = normalizeQuestion(question)
    if (seen.has(normalized)) {
      continue
    }
    seen.add(normalized)
    accepted.push({
      id: clarificationId(accepted.length),
      kind: kind as MealClarificationKind,
      answerKind: answerKind as MealClarificationAnswerKind,
      question,
    })
  }
  return accepted
}

function failure(status: 400 | 409, code: MealClarificationFailure['code']): { ok: false; failure: MealClarificationFailure } {
  return { ok: false, failure: { status, code } }
}

export function parseMealClarificationAnswers(
  raw: unknown,
): { ok: true; answers: MealClarificationAnswer[] } | { ok: false; failure: MealClarificationFailure } {
  if (raw == null) {
    return { ok: true, answers: [] }
  }
  if (!Array.isArray(raw) || raw.length > MEAL_CLARIFICATION_MAX) {
    return failure(400, 'CLARIFICATION_ANSWER')
  }
  const answers: MealClarificationAnswer[] = []
  const ids = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return failure(400, 'CLARIFICATION_ANSWER')
    }
    const source = item as Record<string, unknown>
    const id = typeof source.id === 'string' ? source.id.trim() : ''
    const answer = typeof source.answer === 'string' ? source.answer.trim() : ''
    if (!id || id.length > 16) {
      return failure(400, 'CLARIFICATION_ANSWER')
    }
    if (ids.has(id)) {
      return failure(400, 'CLARIFICATION_ANSWER')
    }
    ids.add(id)
    if (!answer) {
      continue
    }
    if (answer.length > MEAL_CLARIFICATION_ANSWER_MAX) {
      return failure(400, 'CLARIFICATION_ANSWER')
    }
    answers.push({ id, answer })
  }
  return { ok: true, answers }
}

function normalizeYesNo(answer: string): MealClarificationYesNo | null {
  const normalized = answer.trim().toLowerCase().replace(/\s+/g, '_')
  return YES_NO_SET.has(normalized) ? (normalized as MealClarificationYesNo) : null
}

export function displayClarificationAnswer(answer: string): string {
  return answer === 'not_sure' ? 'not sure' : answer
}

export function compileMealClarificationContext(input: {
  userContext: string | null
  items: Array<{ question: string; answer: string }>
}): string {
  const lines: string[] = []
  const context = input.userContext?.trim() ?? ''
  if (context) {
    lines.push('OWNER CONTEXT:', context, '')
  }
  if (input.items.length > 0) {
    lines.push('OWNER CLARIFICATIONS:')
    for (const item of input.items) {
      lines.push(`- ${item.question} Answer: ${displayClarificationAnswer(item.answer)}`)
    }
  }
  return lines.join('\n').trim()
}

export function resolveMealClarificationContext(input: {
  provider: 'gemini' | 'home_ai'
  storedUserContext: string | null
  clarifications: MealClarification[]
  answers: MealClarificationAnswer[]
  contextMax?: number
}):
  | { ok: true; mode: 'plain' }
  | { ok: true; mode: 'refine'; userContext: string }
  | { ok: false; failure: MealClarificationFailure } {
  if (input.answers.length === 0) {
    return { ok: true, mode: 'plain' }
  }
  if (input.provider === 'home_ai') {
    return failure(400, 'CLARIFICATION_PROVIDER_UNSUPPORTED')
  }
  const byId = new Map(input.clarifications.map((item) => [item.id, item]))
  const matched: Array<{ question: string; answer: string }> = []
  for (const answer of input.answers) {
    const clarification = byId.get(answer.id)
    if (!clarification) {
      return failure(409, 'stale_clarification')
    }
    if (clarification.answerKind === 'yes_no') {
      const yesNo = normalizeYesNo(answer.answer)
      if (!yesNo) {
        return failure(400, 'CLARIFICATION_ANSWER')
      }
      matched.push({ question: clarification.question, answer: yesNo })
      continue
    }
    const text = answer.answer.trim()
    if (!text || text.length > MEAL_CLARIFICATION_ANSWER_MAX) {
      return failure(400, 'CLARIFICATION_ANSWER')
    }
    matched.push({ question: clarification.question, answer: text })
  }
  const userContext = compileMealClarificationContext({
    userContext: input.storedUserContext,
    items: matched,
  })
  if (userContext.length > (input.contextMax ?? 2000)) {
    return failure(400, 'CONTEXT_TOO_LONG')
  }
  return { ok: true, mode: 'refine', userContext }
}

export function selectedClarificationAnswers(
  clarifications: MealClarification[],
  drafts: Readonly<Record<string, string>>,
): MealClarificationAnswer[] {
  const selected: MealClarificationAnswer[] = []
  for (const item of clarifications) {
    const answer = (drafts[item.id] ?? '').trim()
    if (!answer || answer.length > MEAL_CLARIFICATION_ANSWER_MAX) {
      continue
    }
    if (item.answerKind === 'yes_no' && !normalizeYesNo(answer)) {
      continue
    }
    selected.push({ id: item.id, answer: item.answerKind === 'yes_no' ? (normalizeYesNo(answer) as string) : answer })
  }
  return selected
}
