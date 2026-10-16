import { describe, expect, it } from 'vitest'
import type { AskEvidence } from '../src/domain/ask-health/types.js'
import {
  canonicalCorrectionForEvidence,
  correctionFollowUpDraft,
  makeAskCorrectionState,
  readAskCorrectionState,
} from '../src/domain/ask-health/corrections.js'

function evidence(id: string, domain: string, detailPath: string | null): AskEvidence {
  return {
    id, domain, detailPath, label: 'Sample', text: 'Test evidence', value: null,
    unit: null, period: null, coverage: null, userEntered: true, substantive: true,
  }
}

describe('PIQ-2.5 owner correction routed to the canonical source', () => {
  it('accepts owner Profile DOB, calculated age input, height and clinical records', () => {
    for (const id of ['profile.height_cm', 'profile.date_of_birth', 'profile.age_years_as_of']) {
      expect(canonicalCorrectionForEvidence(evidence(id, 'profile', '/settings#health-profile')))
        .toMatchObject({ destination: '/settings#health-profile' })
    }
    for (const id of [
      'clinical.sex_for_physiology', 'clinical.condition.0', 'clinical.medication.1',
      'clinical.allergy.0', 'clinical.persistent_context', 'clinical.dietary_context',
    ]) {
      expect(canonicalCorrectionForEvidence(evidence(id, 'clinical_context', '/settings#health-profile')))
        .toMatchObject({ destination: '/settings#health-profile' })
    }
  })

  it('links only canonical Nutrition facts to the original food log', () => {
    expect(canonicalCorrectionForEvidence(evidence('nutrition.calories', 'nutrition', '/nutrition')))
      .toMatchObject({ destination: '/nutrition' })
    expect(canonicalCorrectionForEvidence(evidence('nutrition.average', 'nutrition', '/nutrition')))
      .toMatchObject({ destination: '/nutrition' })
    expect(canonicalCorrectionForEvidence(evidence('intelligence.nutrition.calories', 'intelligence', '/nutrition')))
      .toBeNull()
  })

  it('refuses to imply edit access for imported, derived, unknown or untrusted paths', () => {
    const unsupported = [
      evidence('sleep.source', 'sleep', '/progress/sleep'),
      evidence('ask.range', 'ask', '/progress'),
      evidence('body.weight.latest', 'body', '/progress/body'),
      evidence('clinical.medication.0', 'clinical_context', 'https://malicious.example/'),
      evidence('profile.height_cm', 'nutrition', '/settings#health-profile'),
      evidence('nutrition.calories', 'nutrition', '/settings#health-profile'),
      evidence('profile.sex_for_physiology', 'profile', null),
    ]
    expect(unsupported.every((item) => canonicalCorrectionForEvidence(item) === null)).toBe(true)
  })

  it('preserves the original question, lens and range only in transient navigation state', () => {
    const state = makeAskCorrectionState(' Has my protein intake improved? ', 'nutrition', '90d')
    expect(state).toEqual({ askCorrection: {
      kind: 'ask_health_correction', question: 'Has my protein intake improved?',
      lens: 'nutrition', range: '90d',
    } })
    expect(readAskCorrectionState(state)).toEqual(state?.askCorrection)
    expect(JSON.stringify(state)).not.toContain('http')
  })

  it('rejects injected, incomplete or oversized return state', () => {
    const valid = makeAskCorrectionState('Question?', 'general', '30d')
    expect(readAskCorrectionState(null)).toBeNull()
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, kind: 'assistant_verified' } })).toBeNull()
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, range: 'all_database' } })).toBeNull()
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, lens: 'malicious' } })).toBeNull()
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, question: 'x'.repeat(1001) } })).toBeNull()
    expect(makeAskCorrectionState('  ', 'general', '30d')).toBeNull()
    expect(makeAskCorrectionState('x'.repeat(1001), 'general', '30d')).toBeNull()
  })

  it('round-trips Deep Dive and General Only modes through transient correction state', () => {
    for (const mode of ['deep', 'general_only', 'personalized', 'smart'] as const) {
      const state = makeAskCorrectionState('Please reconsider', 'general', '90d', mode)
      expect(readAskCorrectionState(state)).toMatchObject({
        question: 'Please reconsider', range: '90d', contextMode: mode,
      })
    }
    const valid = makeAskCorrectionState('Question?', 'general', '30d', 'deep')
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, contextMode: 'super_admin' } })).toBeNull()
    expect(readAskCorrectionState({ askCorrection: { ...valid?.askCorrection, contextMode: null } })).toBeNull()
    // Legacy correction links without a mode remain backward-compatible.
    expect(readAskCorrectionState(makeAskCorrectionState('Question?', 'general', '30d'))?.contextMode).toBeUndefined()
  })

  it('drafts reconsideration instead of affirming unverified medical facts', () => {
    const followUp = correctionFollowUpDraft('Protein\ntrend')
    expect(followUp).toContain('Protein trend')
    expect(followUp).toContain('Separate saved observations from assumptions')
    expect(followUp.length).toBeLessThan(1000)
    expect(followUp).not.toContain('I have a diagnosis')
  })
})
