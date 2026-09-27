import { ASK_ANSWER_MAX_CHARS, ASK_BLOCK_MAX, ASK_BLOCK_TEXT_MAX } from './config.js'
import type { AskEvidence, AskHealthAnswer } from './types.js'

const ALLOWED_KEYS = new Set(['blocks', 'limitations', 'follow_ups'])

export function validateAskHealthAnswer(
  raw: string,
  evidence: readonly AskEvidence[],
): { ok: true; answer: AskHealthAnswer } | { ok: false; error: string } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'provider response invalid' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'provider response invalid' }
  }
  const record = parsed as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_KEYS.has(key))) {
    return { ok: false, error: 'provider response invalid' }
  }
  const ids = new Set(evidence.map((item) => item.id))
  const blocks = readBlocks(record.blocks, ids, true)
  if (!blocks.ok) {
    return blocks
  }
  const limitations = readBlocks(record.limitations ?? [], ids, false)
  if (!limitations.ok) {
    return limitations
  }
  const followUps = readFollowUps(record.follow_ups ?? [])
  if (!followUps.ok) {
    return followUps
  }
  const answer: AskHealthAnswer = {
    blocks: blocks.blocks,
    limitations: limitations.blocks,
    followUps: followUps.values,
  }
  const size = JSON.stringify(answer).length
  if (size > ASK_ANSWER_MAX_CHARS) {
    return { ok: false, error: 'provider response invalid' }
  }
  return { ok: true, answer }
}

function readBlocks(
  value: unknown,
  ids: ReadonlySet<string>,
  required: boolean,
): { ok: true; blocks: AskHealthAnswer['blocks'] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length > ASK_BLOCK_MAX || (required && value.length === 0)) {
    return { ok: false, error: 'provider response invalid' }
  }
  const blocks: AskHealthAnswer['blocks'] = []
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: 'provider response invalid' }
    }
    const record = item as Record<string, unknown>
    if (typeof record.text !== 'string' || record.text.trim().length === 0 || record.text.length > ASK_BLOCK_TEXT_MAX) {
      return { ok: false, error: 'provider response invalid' }
    }
    if (!Array.isArray(record.evidence_refs)) {
      return { ok: false, error: 'provider response invalid' }
    }
    const refs = record.evidence_refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0)
    if (refs.length !== record.evidence_refs.length) {
      return { ok: false, error: 'provider response invalid' }
    }
    if (required && refs.length === 0) {
      return { ok: false, error: 'provider response invalid' }
    }
    if (refs.some((ref) => !ids.has(ref) || ref.startsWith('literature.') || ref.startsWith('doi.'))) {
      return { ok: false, error: 'provider response invalid' }
    }
    blocks.push({ text: record.text.trim(), evidenceRefs: refs })
  }
  return { ok: true, blocks }
}

function readFollowUps(value: unknown): { ok: true; values: string[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length > 3) {
    return { ok: false, error: 'provider response invalid' }
  }
  const values: string[] = []
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length === 0 || item.length > 160) {
      return { ok: false, error: 'provider response invalid' }
    }
    values.push(item.trim())
  }
  return { ok: true, values }
}
