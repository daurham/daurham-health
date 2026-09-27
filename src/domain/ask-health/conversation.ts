import { isCalendarDate } from '../training.js'
import { isProgressRange } from '../progress/periods.js'
import {
  ASK_CONVERSATION_CHARS,
  ASK_CONVERSATION_KEEP,
  ASK_CONVERSATION_REJECT,
  ASK_LENSES,
  ASK_QUESTION_MAX,
  ASK_TURN_MAX,
  type AskLens,
} from './config.js'
import type { AskTurn } from './types.js'

export type ParsedAskRequest = {
  question: string
  lens: AskLens
  range: '30d' | '90d' | '6m' | '1y' | 'all'
  asOf: string
  conversation: AskTurn[]
}

export function parseAskHealthRequest(
  body: unknown,
  today: string,
): { ok: true; value: ParsedAskRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Ask Health request must be an object.' }
  }
  const record = body as Record<string, unknown>
  if (typeof record.question !== 'string' || record.question.trim().length === 0) {
    return { ok: false, error: 'Question is required.' }
  }
  const question = record.question.trim()
  if (question.length > ASK_QUESTION_MAX) {
    return { ok: false, error: 'Question is too long.' }
  }
  const lens = typeof record.lens === 'string' ? record.lens : 'general'
  if (!(ASK_LENSES as readonly string[]).includes(lens)) {
    return { ok: false, error: 'lens must be general, training, nutrition, recovery, or experiments.' }
  }
  const range = typeof record.range === 'string' ? record.range : '30d'
  if (!isProgressRange(range)) {
    return { ok: false, error: 'range must be 30d, 90d, 6m, 1y, or all.' }
  }
  const asOf = typeof record.asOf === 'string' && record.asOf.trim() ? record.asOf.trim() : today
  if (!isCalendarDate(asOf)) {
    return { ok: false, error: 'asOf must be YYYY-MM-DD.' }
  }
  if (asOf > today) {
    return { ok: false, error: 'asOf cannot be in the future.' }
  }
  const bounded = boundConversation(record.conversation)
  if (!bounded.ok) {
    return bounded
  }
  return {
    ok: true,
    value: { question, lens: lens as AskLens, range, asOf, conversation: bounded.turns },
  }
}

export function boundConversation(
  value: unknown,
): { ok: true; turns: AskTurn[] } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, turns: [] }
  }
  if (!Array.isArray(value)) {
    return { ok: false, error: 'Conversation must be a list.' }
  }
  if (value.length > ASK_CONVERSATION_REJECT) {
    return { ok: false, error: 'Conversation history is too long.' }
  }
  const turns: AskTurn[] = []
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      return { ok: false, error: 'Conversation turn is invalid.' }
    }
    const record = item as Record<string, unknown>
    if (record.role !== 'user' && record.role !== 'assistant') {
      return { ok: false, error: 'Conversation turn is invalid.' }
    }
    if (typeof record.text !== 'string') {
      return { ok: false, error: 'Conversation turn is invalid.' }
    }
    const text = record.text.trim()
    if (text.length === 0 || text.length > ASK_TURN_MAX) {
      return { ok: false, error: 'Conversation turn is too long.' }
    }
    turns.push({ role: record.role, text })
  }
  const kept = turns.slice(-ASK_CONVERSATION_KEEP)
  while (kept.reduce((sum, turn) => sum + turn.text.length, 0) > ASK_CONVERSATION_CHARS && kept.length > 1) {
    kept.shift()
  }
  if (kept.reduce((sum, turn) => sum + turn.text.length, 0) > ASK_CONVERSATION_CHARS) {
    return { ok: false, error: 'Conversation history is too long.' }
  }
  return { ok: true, turns: kept }
}

export function normalizeAskQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, ' ')
}
