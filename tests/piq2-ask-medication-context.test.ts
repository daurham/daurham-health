import { describe, expect, it } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  selectAskHealthMedications,
} from '../src/domain/ask-health/packet.js'
import type { AskClinicalProfileInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const profile: AskClinicalProfileInput = {
  sexForPhysiology: null,
  persistentHealthContext: null,
  trainingLimitations: null,
  dietaryContext: null,
  conditions: [],
  allergies: [],
  medications: [
    { name: 'Sertraline HCl', dose: '50 mg', frequency: 'daily', status: 'active' },
    { name: 'Omeprazole', dose: null, frequency: 'as needed', status: 'paused' },
    { name: 'Metformin', dose: '500 mg', frequency: 'twice daily', status: 'discontinued' },
  ],
}

function packet(question: string, lens: AskHealthPacketInput['lens'] = 'general') {
  return buildAskHealthEvidencePacket({
    lens, question,
    asOf: '2026-10-15', generatedAt: '2026-10-15T12:00:00Z',
    period: { start: '2026-09-16', end: '2026-10-15' },
    range: '30d', overview: null, activity: null, sleep: null, goals: [],
    experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
    profile,
  })
}
const meds = (question: string, lens?: AskHealthPacketInput['lens']) =>
  packet(question, lens).evidence.filter((fact) => fact.id.startsWith('clinical.medication.'))

describe('PIQ-2.4 question-scoped medication evidence', () => {
  it('does not indiscriminately attach recorded medications to training or general questions', () => {
    expect(meds('How can I improve my bench press?', 'training')).toEqual([])
    expect(meds('How do medicines work?')).toEqual([])
    expect(meds('What are side effects in general?')).toEqual([])
  })

  it('a named medication resolves its saved record even through an unrelated lens', () => {
    const matched = meds('Is sertraline affecting my sleep?', 'recovery')
    expect(matched.map((fact) => fact.id)).toEqual(['clinical.medication.0'])
    expect(matched[0]?.text).toContain('Saved status: active')
    expect(matched[0]?.text).toContain('Recorded dose: 50 mg')
    expect(matched[0]?.text).toContain('not proof the medication was taken')
    expect(matched[0]?.text).toContain('cannot establish it caused a symptom')
    expect(matched[0]?.provenance).toBe('owner_profile_current')
    expect(meds('Is metformin still on my saved list?').map((fact) => fact.value))
      .toEqual(['discontinued'])
  })

  it('personal medication/interaction questions include the saved records and their differing statuses', () => {
    expect(meds('Do any of my medications interact with creatine?', 'training')
      .map((fact) => fact.value)).toEqual(['active', 'paused', 'discontinued'])
    expect(meds('Which medicines have I recorded?').map((fact) => fact.id))
      .toEqual(['clinical.medication.0', 'clinical.medication.1', 'clinical.medication.2'])
  })

  it('personal GI symptoms may include active medication context, never implying a causal diagnosis', () => {
    expect(meds('Why am I constipated?').map((fact) => fact.id))
      .toEqual(['clinical.medication.0'])
    expect(meds('Why do people get constipation?')).toEqual([])
    expect(meds('Is my bloating connected to anything?', 'nutrition')
      .map((fact) => fact.id)).toEqual(['clinical.medication.0'])
  })

  it('matching is word-boundary-based, and never guesses a discontinued medicine is taken', () => {
    expect(selectAskHealthMedications(profile, 'What is my serotonin level?')).toEqual([])
    expect(meds('What does creatinine mean?')).toEqual([])
    const archived = meds('Do I still have Metformin recorded?')
    expect(archived).toHaveLength(1)
    expect(archived[0]?.value).toBe('discontinued')
    expect(archived[0]?.text).not.toContain('currently taking')
  })
})
