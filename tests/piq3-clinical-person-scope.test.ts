import { describe, expect, it } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  selectAskHealthAllergies,
  selectAskHealthConditions,
  selectAskHealthMedications,
  selectAskHealthProfileTextFields,
} from '../src/domain/ask-health/packet.js'
import { askHealthUserPrompt } from '../src/domain/ask-health/prompt.js'
import type { AskClinicalProfileInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const clinical: AskClinicalProfileInput = {
  sexForPhysiology: 'female',
  persistentHealthContext: 'Private Synthetic Owner Health Note',
  trainingLimitations: 'Private Synthetic Owner Limitation',
  dietaryContext: 'Private Synthetic Owner Dietary',
  conditions: [
    { name: 'Private Owner Condition', status: 'active' },
    { name: 'Second Owner Condition', status: 'resolved' },
  ],
  allergies: [{ substance: 'Private Owner Allergen', reaction: 'Private Reaction', severity: 'unknown' }],
  medications: [
    { name: 'Private Owner Medication', dose: 'Private Dose', frequency: null, status: 'active' },
    { name: 'Second Owner Medication', dose: null, frequency: null, status: 'paused' },
  ],
}
function packet(question: string, contextMode: AskHealthPacketInput['contextMode'] = 'personalized') {
  return buildAskHealthEvidencePacket({
    lens: 'general', range: '30d', question, contextMode,
    asOf: '2026-10-15', healthToday: '2026-10-15',
    generatedAt: '2026-10-15T17:00:00.000Z',
    period: { start: '2026-09-16', end: '2026-10-15' },
    overview: null, activity: null, sleep: null, goals: [],
    experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
    profile: clinical, maxChars: 90000,
  })
}
const clinicalIds = (question: string, mode: AskHealthPacketInput['contextMode']) =>
  packet(question, mode).evidence.filter(item => item.id.startsWith('clinical.')).map(item => item.id)

describe('T48 clinical owner-subject privacy boundary (synthetic, no provider calls)', () => {
  it('does not borrow saved owner records for explicitly different family members', () => {
    const questions = [
      "List my wife's medications",
      "Show all my son's saved conditions",
      "What allergies does my daughter have?",
      "Are my mother's medical conditions recorded?",
      "Does my brother have my peanut allergy?",
      "Which of her medications could cause nausea?",
      "My friend's penicillin allergy: can she take this medicine?",
    ]
    for (const question of questions) {
      for (const mode of ['smart', 'personalized', 'deep'] as const) {
        const actual = packet(question, mode)
        expect(clinicalIds(question, mode), question + ' ' + mode).toEqual([])
        expect(actual.evidence.some(item => item.id.startsWith('profile.'))).toBe(false)
        expect(actual.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
        const prompt = askHealthUserPrompt({ packet: actual, question, conversation: [] })
        expect(prompt).not.toContain('Private Synthetic Owner')
        expect(prompt).not.toContain('Private Owner Medication')
        expect(prompt).not.toContain('Private Owner Allergen')
        expect(prompt).not.toContain('Private Dose')
      }
    }
  })

  it('blocks educational, explicitly quoted first-person speech across all modes', () => {
    const examples = [
      'What does the phrase "my recorded conditions" mean?',
      'Explain the sentence “What allergies do I have?”',
      'A friend asked "What medicines have I recorded?"; what does it mean?',
    ]
    for (const question of examples) {
      for (const mode of ['smart', 'personalized', 'deep'] as const) {
        expect(clinicalIds(question, mode), question + ' ' + mode).toEqual([])
      }
    }
  })

  it('does not suppress clear owner-specific saved records or legitimate clinical questions', () => {
    for (const mode of ['smart', 'personalized', 'deep'] as const) {
      expect(clinicalIds('Which medications have I recorded?', mode))
        .toContain('clinical.medication.0')
      expect(clinicalIds('What allergies do I have saved?', mode))
        .toContain('clinical.allergy.0')
      expect(clinicalIds('Could my current medication affect sleep?', mode))
        .toContain('clinical.medication.0')
    }
    expect(selectAskHealthProfileTextFields('What is saved in my health profile?'))
      .toEqual(['persistentHealthContext', 'trainingLimitations', 'dietaryContext'])
    // A clinician asking the owner for their own list is not automatically
    // a question about the clinician's separate medical records.
    expect(clinicalIds('My doctor needs my saved medications', 'personalized'))
      .toContain('clinical.medication.0')
  })

  it('direct smart selector calls cannot cross an explicit other-person subject boundary', () => {
    const foreign = "Can my wife take my sertraline medication?"
    expect(selectAskHealthMedications(clinical, foreign)).toEqual([])
    expect(selectAskHealthAllergies(clinical, 'Could my husband eat my saved allergen?')).toEqual([])
    expect(selectAskHealthConditions(clinical, 'Are my mother\'s conditions in my record?')).toEqual([])
    expect(selectAskHealthProfileTextFields('What does my daughter have recorded in my health profile?')).toEqual([])
  })

  it('historical or General Only questions remain private independently of person scope', () => {
    const other = packet("Show my sister's medications", 'general_only')
    expect(other.evidence.some(item => item.id.startsWith('clinical.'))).toBe(false)
    expect(other.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
  })
})
