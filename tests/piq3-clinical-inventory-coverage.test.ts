import { describe, expect, it } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  packetFingerprintMaterial,
} from '../src/domain/ask-health/packet.js'
import { askHealthUserPrompt } from '../src/domain/ask-health/prompt.js'
import type { AskClinicalProfileInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const DAY = '2026-10-15'
const profile = (count: number): AskClinicalProfileInput => ({
  sexForPhysiology: null,
  persistentHealthContext: null,
  trainingLimitations: null,
  dietaryContext: null,
  conditions: Array.from({ length: count }, (_, i) => ({
    name: 'Private Synthetic Condition ' + i,
    status: i === 1 ? 'resolved' as const : 'active' as const,
  })),
  allergies: Array.from({ length: count }, (_, i) => ({
    substance: 'Private Synthetic Allergen ' + i,
    reaction: null,
    severity: 'unknown' as const,
  })),
  medications: Array.from({ length: count }, (_, i) => ({
    name: 'Private Synthetic Medicine ' + i,
    dose: i === 1 ? 'private dose' : null,
    frequency: null,
    status: i === 1 ? 'paused' as const : i === 2 ? 'discontinued' as const : 'active' as const,
  })),
})
function packet(
  question: string,
  ownerProfile = profile(20),
  changes: Partial<AskHealthPacketInput> = {},
) {
  return buildAskHealthEvidencePacket({
    lens: 'general', range: '30d', asOf: DAY, healthToday: DAY,
    generatedAt: DAY + 'T17:00:00.000Z',
    question, period: { start: '2026-09-16', end: DAY },
    contextMode: 'personalized',
    overview: null, activity: null, sleep: null, goals: [],
    experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [],
    profile: ownerProfile, maxChars: 100_000,
    ...changes,
  })
}
const ids = (question: string, ownerProfile = profile(20), changes: Partial<AskHealthPacketInput> = {}) =>
  packet(question, ownerProfile, changes).evidence.map(item => item.id)
const caveat = (question: string, ownerProfile = profile(20), changes: Partial<AskHealthPacketInput> = {}) =>
  packet(question, ownerProfile, changes).limitations.find(item => item.code === 'clinical_evidence_limited')

describe('T48 pre-cap explicit clinical inventory completeness (synthetic only)', () => {
  it('a saved medication inventory includes paused/discontinued records and reveals the 16-record selection cap', () => {
    const question = 'Which medicines have I recorded?'
    const actual = packet(question)
    const entries = actual.evidence.filter(item => item.id.startsWith('clinical.medication.'))
    expect(entries).toHaveLength(16)
    expect(entries.map(item => item.id)).not.toContain('clinical.medication.19')
    expect(entries[1]?.value).toBe('paused')
    expect(entries[2]?.value).toBe('discontinued')
    expect(actual.evidenceSelectionAudit?.removedSubstantiveCount).toBe(0)
    const limitation = actual.limitations.find(item => item.code === 'clinical_evidence_limited')
    expect(limitation?.evidenceId).toBe('ask.range')
    expect(limitation?.text).toContain('medications')
    expect(limitation?.text).toContain('initial selection limit')
    expect(limitation?.text).toContain('not a complete review')
    expect(limitation?.text).not.toContain('Private Synthetic')
    const prompt = askHealthUserPrompt({ packet: actual, question, conversation: [] })
    expect(prompt).toContain('clinical_evidence_limited')
    expect(prompt).not.toContain('Private Synthetic Medicine 19')
    expect(prompt).not.toContain('private dose of omitted record')
  })

  it('allergies and conditions inventories name both omissions without revealing missing records', () => {
    const question = 'Show all my allergies and saved conditions'
    const actual = packet(question)
    expect(actual.evidence.filter(item => item.id.startsWith('clinical.allergy.'))).toHaveLength(12)
    expect(actual.evidence.filter(item => item.id.startsWith('clinical.condition.'))).toHaveLength(12)
    expect(actual.limitations.filter(item => item.code === 'clinical_evidence_limited')).toHaveLength(1)
    const limitation = actual.limitations.find(item => item.code === 'clinical_evidence_limited')
    expect(limitation?.text).toContain('allergies')
    expect(limitation?.text).toContain('conditions')
    expect(limitation?.text).not.toContain('Private Synthetic')
    const prompt = askHealthUserPrompt({ packet: actual, question, conversation: [] })
    expect(prompt).not.toContain('Private Synthetic Condition 19')
    expect(prompt).not.toContain('Private Synthetic Allergen 19')
  })

  it('no fabricated omission for a true complete list or when no clinical records exist', () => {
    for (const saved of [profile(0), profile(3), profile(12)]) {
      expect(caveat('What are my allergies?', saved)).toBeUndefined()
      expect(caveat('Which conditions have I saved?', saved)).toBeUndefined()
      expect(caveat('Which medicines have I recorded?', saved)).toBeUndefined()
    }
  })

  it('a named medication or clinical question does not become a full owner inventory', () => {
    const records = profile(20)
    const named = packet('Is Private Synthetic Medicine 1 still recorded on my profile?', records, {
      contextMode: 'smart',
    })
    expect(named.limitations.find(item => item.code === 'clinical_evidence_limited')).toBeUndefined()
    const decision = packet('Which of my active medications could be relevant?', records)
    // A clinical decision is not an explicit inventory request; normal
    // personalized selection stays scoped to currently active items.
    expect(decision.evidence.filter(item => item.id.startsWith('clinical.medication.'))).toHaveLength(8)
    expect(decision.limitations.find(item => item.code === 'clinical_evidence_limited')).toBeUndefined()
    expect(ids('How do medications generally work?', records, { contextMode: 'smart' }))
      .not.toContain('clinical.medication.19')
  })

  it('does not claim inventory coverage after source disagreement, in General Only, or in a historical context', () => {
    const q = 'List all my saved medications'
    for (const options of [
      { currentHealthProfileSourceRecheck: 'changed_or_unavailable' as const },
      { contextMode: 'general_only' as const },
      { asOf: '2026-10-01' },
    ]) {
      const result = packet(q, profile(20), options)
      expect(result.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
    }
    expect(ids(q, profile(20), { contextMode: 'general_only' }))
      .not.toContain('clinical.medication.0')
  })

  it('selector omission is represented in fingerprint even if no evidence item is removed by byte cap', () => {
    const question = 'Which medicines have I recorded?'
    const full = packet(question, profile(16))
    const partial = packet(question, profile(17))
    expect(full.evidence).toEqual(partial.evidence)
    expect(full.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
    expect(partial.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(true)
    expect(packetFingerprintMaterial(full)).not.toBe(packetFingerprintMaterial(partial))
  })
})
