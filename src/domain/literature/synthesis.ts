import { LITERATURE_ABSTRACT_MAX, LITERATURE_BLOCK_MAX, LITERATURE_BLOCK_TEXT_MAX, LITERATURE_PACKET_MAX, LITERATURE_SYSTEM_PROMPT } from './config.js'
import type { LiteratureRecord, LiteratureSynthesisBlock } from './types.js'

const ALLOWED_KEYS = new Set(['blocks'])
const ALLOWED_BLOCK_KEYS = new Set(['text', 'source_refs'])
const PROHIBITED = /\b(?:diagnos\w*|you should|stop taking|start taking|increase (?:the |your )?dose|decrease (?:the |your )?dose|your data|proves why|your metric)\b/i

export type SynthesisEvidence = {
  query: string
  sources: Array<{
    sourceRef: string
    title: string
    studyType: string
    journal: string | null
    publicationYear: number | null
    abstractText: string
  }>
}

export function synthesisEvidence(query: string, sources: readonly LiteratureRecord[]): SynthesisEvidence {
  const rows = sources.map((source) => ({
    sourceRef: source.sourceRef,
    title: source.title,
    studyType: source.studyType,
    journal: source.journal,
    publicationYear: source.publicationYear,
    abstractText: source.abstractText.slice(0, LITERATURE_ABSTRACT_MAX),
  }))
  while (packetSize(query, rows) > LITERATURE_PACKET_MAX) {
    let index = -1
    for (let cursor = rows.length - 1; cursor >= 0; cursor -= 1) {
      if (rows[cursor]!.abstractText.length > 0) {
        index = cursor
        break
      }
    }
    if (index === -1) {
      break
    }
    const current = rows[index]!.abstractText
    rows[index]!.abstractText = current.slice(0, Math.floor(current.length / 2))
  }
  return { query, sources: rows }
}

export function literatureUserPrompt(evidence: SynthesisEvidence): string {
  return JSON.stringify(evidence)
}

export function literatureSystemPrompt(): string {
  return LITERATURE_SYSTEM_PROMPT
}

export function validateLiteratureSynthesis(
  raw: string,
  sourceRefs: ReadonlySet<string>,
): { ok: true; blocks: LiteratureSynthesisBlock[] } | { ok: false; error: string } {
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
  if (!Array.isArray(record.blocks) || record.blocks.length === 0 || record.blocks.length > LITERATURE_BLOCK_MAX) {
    return { ok: false, error: 'provider response invalid' }
  }
  const blocks: LiteratureSynthesisBlock[] = []
  for (const item of record.blocks) {
    const block = readBlock(item, sourceRefs)
    if (!block.ok) {
      return block
    }
    blocks.push(block.block)
  }
  return { ok: true, blocks }
}

function readBlock(
  item: unknown,
  sourceRefs: ReadonlySet<string>,
): { ok: true; block: LiteratureSynthesisBlock } | { ok: false; error: string } {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return { ok: false, error: 'provider response invalid' }
  }
  const record = item as Record<string, unknown>
  if (Object.keys(record).some((key) => !ALLOWED_BLOCK_KEYS.has(key))) {
    return { ok: false, error: 'provider response invalid' }
  }
  if (typeof record.text !== 'string') {
    return { ok: false, error: 'provider response invalid' }
  }
  const text = record.text.trim()
  if (text.length === 0 || text.length > LITERATURE_BLOCK_TEXT_MAX || /[0-9]/.test(text) || /https?:\/\//i.test(text) || PROHIBITED.test(text)) {
    return { ok: false, error: 'provider response invalid' }
  }
  if (!Array.isArray(record.source_refs) || record.source_refs.length === 0) {
    return { ok: false, error: 'provider response invalid' }
  }
  const refs = record.source_refs.filter((ref): ref is string => typeof ref === 'string')
  if (refs.length !== record.source_refs.length || refs.some((ref) => !sourceRefs.has(ref))) {
    return { ok: false, error: 'provider response invalid' }
  }
  return { ok: true, block: { text, sourceRefs: refs } }
}

function packetSize(query: string, sources: SynthesisEvidence['sources']): number {
  return JSON.stringify({ query, sources }).length
}
