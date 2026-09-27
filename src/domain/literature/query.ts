import { LITERATURE_PREFILL_TERMS, LITERATURE_QUERY_MAX } from './config.js'

const DATE = /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g
const NUMBER_UNIT = /\b\d+(?:\.\d+)?\s*(?:hours?|hrs?|minutes?|mins?|lb|lbs|kg|g|mg|kcal|steps|bpm|%)\b/gi
const STANDALONE_NUMBER = /\b\d+(?:\.\d+)?\b/g
const FIRST_PERSON = /\b(?:i'm|im|i|my|me|mine|we|our|ours)\b/gi

export function buildLiteratureQueryPrefill(question: string): string {
  const collapsed = question.replace(/\s+/g, ' ').trim()
  const withoutDates = collapsed.replace(DATE, ' ')
  const withoutUnits = withoutDates.replace(NUMBER_UNIT, ' ')
  const withoutNumbers = withoutUnits.replace(STANDALONE_NUMBER, ' ')
  const withoutPerson = withoutNumbers.replace(FIRST_PERSON, ' ')
  const cleaned = withoutPerson.replace(/[?]/g, ' ').replace(/\s+/g, ' ').trim()
  const base = cleaned.length > 0 ? cleaned : withoutNumbers.replace(/\s+/g, ' ').trim()
  const terms = base.split(' ').filter((term) => term.length > 0).slice(0, LITERATURE_PREFILL_TERMS)
  return terms.join(' ').slice(0, LITERATURE_QUERY_MAX)
}

export function parseLiteratureQuery(body: unknown): { ok: true; query: string } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Literature search requires a query.' }
  }
  const record = body as Record<string, unknown>
  if (Object.keys(record).some((key) => key !== 'query')) {
    return { ok: false, error: 'Literature search accepts only a query.' }
  }
  if (typeof record.query !== 'string') {
    return { ok: false, error: 'Literature search requires a query.' }
  }
  const query = record.query.replace(/\s+/g, ' ').trim()
  if (hasControlCharacter(query)) {
    return { ok: false, error: 'Literature search query contains unsupported characters.' }
  }
  if (query.length === 0) {
    return { ok: false, error: 'Literature search requires a query.' }
  }
  if (query.length > LITERATURE_QUERY_MAX) {
    return { ok: false, error: 'Literature search query is too long.' }
  }
  return { ok: true, query }
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    if (code <= 31 || code === 127) {
      return true
    }
  }
  return false
}
