import { ASK_ANSWER_MAX_CHARS, ASK_BLOCK_MAX, ASK_BLOCK_TEXT_MAX } from './config.js'
import type { AskEvidence, AskHealthAnswer } from './types.js'

export function validateAskHealthAnswer(
  raw: string,
  evidence: readonly AskEvidence[],
): { ok: true; answer: AskHealthAnswer } | { ok: false; error: string } {
  const parsed = parseProviderJson(raw)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: 'provider response invalid' }
  }

  const record = parsed as Record<string, unknown>
  const ids = new Set(evidence.map((item) => item.id))
  const blocks = readBlocks(record.blocks ?? record.answer ?? record.text, ids, true)
  if (!blocks.ok) {
    return blocks
  }
  const limitations = readBlocks(record.limitations ?? [], ids, false)
  if (!limitations.ok) {
    return limitations
  }
  const followUps = readFollowUps(record.follow_ups ?? record.followUps ?? [])
  if (!followUps.ok) {
    return followUps
  }

  return {
    ok: true,
    answer: fitAnswerSize({
      blocks: blocks.blocks,
      limitations: limitations.blocks,
      followUps: followUps.values,
    }),
  }
}

function parseProviderJson(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) {
    return null
  }
  const unfenced = trimmed
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '')
    .trim()

  for (const candidate of [unfenced, jsonObjectSlice(unfenced)]) {
    if (!candidate) {
      continue
    }
    try {
      return JSON.parse(candidate) as unknown
    } catch {
      // Try the next representation.
    }
  }
  return null
}

function jsonObjectSlice(value: string): string | null {
  const start = value.indexOf('{')
  const end = value.lastIndexOf('}')
  if (start < 0 || end <= start) {
    return null
  }
  return value.slice(start, end + 1)
}

function readBlocks(
  value: unknown,
  ids: ReadonlySet<string>,
  required: boolean,
): { ok: true; blocks: AskHealthAnswer['blocks'] } | { ok: false; error: string } {
  const source = typeof value === 'string' ? [value] : value
  if (!Array.isArray(source)) {
    return required ? { ok: false, error: 'provider response invalid' } : { ok: true, blocks: [] }
  }

  const blocks: AskHealthAnswer['blocks'] = []
  for (const item of source.slice(0, ASK_BLOCK_MAX)) {
    const normalized = readBlock(item, ids)
    if (normalized) {
      blocks.push(normalized)
    }
  }

  if (required && blocks.length === 0) {
    return { ok: false, error: 'provider response invalid' }
  }
  return { ok: true, blocks }
}

function readBlock(item: unknown, ids: ReadonlySet<string>): AskHealthAnswer['blocks'][number] | null {
  if (typeof item === 'string') {
    const text = normalizeText(item, ASK_BLOCK_TEXT_MAX)
    return text ? { text, evidenceRefs: [] } : null
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null
  }

  const record = item as Record<string, unknown>
  const rawText =
    typeof record.text === 'string'
      ? record.text
      : typeof record.content === 'string'
        ? record.content
        : typeof record.answer === 'string'
          ? record.answer
          : ''
  const text = normalizeText(rawText, ASK_BLOCK_TEXT_MAX)
  if (!text) {
    return null
  }

  const rawRefs = Array.isArray(record.evidence_refs)
    ? record.evidence_refs
    : Array.isArray(record.evidenceRefs)
      ? record.evidenceRefs
      : []
  const evidenceRefs = [...new Set(rawRefs.filter((ref): ref is string => typeof ref === 'string' && ids.has(ref)))]
  return { text, evidenceRefs }
}

function readFollowUps(value: unknown): { ok: true; values: string[] } | { ok: false; error: string } {
  if (value == null) {
    return { ok: true, values: [] }
  }
  const source = typeof value === 'string' ? [value] : value
  if (!Array.isArray(source)) {
    return { ok: true, values: [] }
  }

  const values = source
    .filter((item): item is string => typeof item === 'string')
    .map((item) => normalizeText(item, 160))
    .filter((item): item is string => Boolean(item))
    .slice(0, 3)
  return { ok: true, values }
}

function normalizeText(value: string, max: number): string | null {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.length <= max) {
    return trimmed
  }
  return trimmed.slice(0, Math.max(1, max - 1)).trimEnd() + '…'
}

function fitAnswerSize(answer: AskHealthAnswer): AskHealthAnswer {
  const next: AskHealthAnswer = {
    blocks: [...answer.blocks],
    limitations: [...answer.limitations],
    followUps: [...answer.followUps],
  }

  while (JSON.stringify(next).length > ASK_ANSWER_MAX_CHARS && next.followUps.length > 0) {
    next.followUps.pop()
  }
  while (JSON.stringify(next).length > ASK_ANSWER_MAX_CHARS && next.limitations.length > 0) {
    next.limitations.pop()
  }
  while (JSON.stringify(next).length > ASK_ANSWER_MAX_CHARS && next.blocks.length > 1) {
    next.blocks.pop()
  }
  if (JSON.stringify(next).length > ASK_ANSWER_MAX_CHARS && next.blocks[0]) {
    next.blocks[0] = {
      ...next.blocks[0],
      text: normalizeText(next.blocks[0].text, Math.max(120, ASK_ANSWER_MAX_CHARS / 2)) ?? next.blocks[0].text,
    }
  }
  return next
}
