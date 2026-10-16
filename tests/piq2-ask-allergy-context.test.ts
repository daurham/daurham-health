import { describe, expect, it } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  selectAskHealthAllergies,
} from '../src/domain/ask-health/packet.js'
import type { AskClinicalProfileInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const profile: AskClinicalProfileInput = {
  sexForPhysiology: null,
  persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
  conditions: [], medications: [],
  allergies: [
    { substance: 'Penicillin', reaction: 'Hives', severity: 'moderate' },
    { substance: 'Peanuts', reaction: null, severity: 'severe' },
    { substance: 'Shellfish', reaction: 'Rash', severity: 'unknown' },
  ],
}
function facts(question: string, lens: AskHealthPacketInput['lens'] = 'general') {
  const packet = buildAskHealthEvidencePacket({
    lens, question, range: '30d',
    asOf: '2026-10-15', generatedAt: '2026-10-15T12:00:00Z',
    period: { start: '2026-09-16', end: '2026-10-15' },
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
    profile,
  })
  return packet.evidence.filter((item) => item.id.startsWith('clinical.allergy.'))
}

describe('PIQ-2.4 question-scoped owner allergy evidence', () => {
  it('omits private allergy details for unrelated coaching and general explanations', () => {
    expect(facts('How do I improve bench press?', 'training')).toEqual([])
    expect(facts('What causes allergic reactions in general?')).toEqual([])
    expect(facts('What is penicillin?')).toEqual([])
    expect(facts('Why am I constipated?')).toEqual([])
  })

  it('retrieves the matching saved allergen for an owner-specific question regardless of lens', () => {
    const evidence = facts('Can I take penicillin?', 'training')
    expect(evidence.map((item) => item.id)).toEqual(['clinical.allergy.0'])
    expect(evidence[0]?.text).toContain('Saved reaction: Hives')
    expect(evidence[0]?.text).toContain('not an independently verified diagnosis')
    expect(evidence[0]?.provenance).toBe('owner_profile_current')
    expect(evidence[0]?.detailPath).toBe('/settings#health-profile')
  })

  it('shows owner-entered allergy inventory only when the owner asks for it', () => {
    expect(facts('What allergies do I have saved?').map((item) => item.id))
      .toEqual(['clinical.allergy.0', 'clinical.allergy.1', 'clinical.allergy.2'])
    expect(facts('Could my known allergies and medications affect my recovery?')).toHaveLength(3)
    expect(facts('Which substances do I have a reaction to?').map((item) => item.id))
      .toEqual(['clinical.allergy.0', 'clinical.allergy.1', 'clinical.allergy.2'])
  })

  it('includes owner allergies when planning food, medications or supplements for possible exposure', () => {
    expect(facts('What should I eat for dinner?', 'nutrition')).toHaveLength(3)
    expect(facts('Should I take a supplement for recovery?', 'recovery')).toHaveLength(3)
    expect(facts('Can I safely use this medicine?', 'general')).toHaveLength(3)
  })

  it('does not silently treat a similar-looking term as the saved substance', () => {
    expect(selectAskHealthAllergies(profile, 'Is peanut butter healthy for me?')).toEqual([])
    const exact = selectAskHealthAllergies(profile, 'Is peanuts safe for me?')
    expect(exact.map((item) => item.index)).toEqual([1])
  })

  it('maintains source indices across filtered matches, and does not infer exposure', () => {
    const items = facts('Am I allergic to shellfish?')
    expect(items.map((item) => item.id)).toEqual(['clinical.allergy.2'])
    expect(items[0]?.value).toBe('unknown')
    expect(items[0]?.text).toContain('not an independently verified diagnosis')
    expect(items[0]?.text).not.toContain('was exposed')
  })

  it('returns empty evidence when no allergies were saved', () => {
    expect(selectAskHealthAllergies({ ...profile, allergies: [] }, 'What are my allergies?')).toEqual([])
  })
})
