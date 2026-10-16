import { describe, expect, it } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  selectAskHealthConditions,
  selectAskHealthProfileTextFields,
} from '../src/domain/ask-health/packet.js'
import type { AskClinicalProfileInput, AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const profile: AskClinicalProfileInput = {
  sexForPhysiology: null,
  persistentHealthContext: 'Sensitive long-term owner health background',
  trainingLimitations: 'Avoid heavy loaded flexion while recovering',
  dietaryContext: 'Pescatarian meals and extra dietary fiber',
  conditions: [
    { name: 'Migraine', status: 'active' },
    { name: 'Exercise-induced asthma', status: 'resolved' },
    { name: 'Eczema', status: 'unknown' },
  ],
  medications: [],
  allergies: [],
}
function evidence(question: string, lens: AskHealthPacketInput['lens'] = 'general') {
  const packet = buildAskHealthEvidencePacket({
    lens, question, range: '30d',
    asOf: '2026-10-15', generatedAt: '2026-10-15T12:00:00Z',
    period: { start: '2026-09-16', end: '2026-10-15' },
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
    profile,
  })
  return packet.evidence.filter((item) =>
    item.id.startsWith('clinical.condition.') ||
    ['clinical.persistent_context', 'clinical.training_limitations', 'clinical.dietary_context'].includes(item.id))
}

describe('PIQ-2.4 minimum necessary owner conditions and free-text context', () => {
  it('does not send private diagnoses or background with general science and unrelated questions', () => {
    expect(evidence('How do migraine headaches work?')).toEqual([])
    expect(evidence('What are signs of asthma?')).toEqual([])
    expect(evidence('What is a bench press?', 'training')).toEqual([])
    expect(evidence('How does creatine work?', 'nutrition')).toEqual([])
    expect(evidence('Why do people experience constipation?')).toEqual([])
  })

  it('selects only a named condition when asked personally, retaining stable indices', () => {
    const selected = evidence('Could my eczema be related to this?', 'recovery')
    expect(selected.map((item) => item.id)).toEqual(['clinical.condition.2'])
    expect(selected[0]?.value).toBe('unknown')
    expect(selected[0]?.provenance).toBe('owner_profile_current')
    expect(selected[0]?.detailPath).toBe('/settings#health-profile')
    expect(selected[0]?.text).toContain('not an independently verified diagnosis')
    expect(selectAskHealthConditions(profile, 'Could my eczematous skin be a factor?')).toEqual([])
    expect(evidence('Does my exercise-induced asthma still show up?')
      .map((item) => item.value)).toEqual(['resolved'])
  })

  it('uses recorded condition inventory only for an owner-specific request', () => {
    expect(evidence('Which conditions have I saved?').map((item) => item.id))
      .toEqual(['clinical.condition.0', 'clinical.condition.1', 'clinical.condition.2'])
    expect(evidence('Is my migraine still recorded?').map((item) => item.id))
      .toEqual(['clinical.condition.0'])
  })

  it('does not infer an unrelated condition explains a personal symptom', () => {
    expect(evidence('Why am I constipated?').map((item) => item.id))
      .toEqual(['clinical.dietary_context'])
    expect(evidence('Is my bloating caused by my migraine?').map((item) => item.id))
      .toEqual(['clinical.dietary_context', 'clinical.condition.0'])
  })

  it('selects the appropriate owner text source without attaching all private background', () => {
    expect(evidence('How should I improve my squat?', 'training').map((item) => item.id))
      .toEqual(['clinical.training_limitations'])
    expect(evidence('What should I eat for dinner?', 'nutrition').map((item) => item.id))
      .toEqual(['clinical.dietary_context'])
    expect(evidence('What is saved in my health profile?').map((item) => item.id))
      .toEqual(['clinical.persistent_context', 'clinical.training_limitations', 'clinical.dietary_context',
        'clinical.condition.0', 'clinical.condition.1', 'clinical.condition.2'])
    expect(selectAskHealthProfileTextFields('What makes my back pain flare?'))
      .toEqual(['trainingLimitations'])
    expect(selectAskHealthProfileTextFields('What are health profiles?')).toEqual([])
  })

  it('labels free text as current owner reporting, not clinical or historical truth', () => {
    const selected = evidence('Review my medical history')
    const text = selected.find((item) => item.id === 'clinical.persistent_context')
    expect(text?.text).toContain('not a verified clinical finding or dated history')
    expect(text?.provenance).toBe('owner_profile_current')
    expect(selected.find((item) => item.id === 'clinical.condition.1')?.value).toBe('resolved')
    expect(selectAskHealthConditions({ ...profile, conditions: [] }, 'What conditions have I saved?')).toEqual([])
  })
})
