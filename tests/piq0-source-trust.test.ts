import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { nutritionDayQuality } from '../src/domain/nutrition/quality.js'
import { validateAskHealthAnswer } from '../src/domain/ask-health/validate.js'

function obs(key: IntelligenceObservation['key'], date: string, value: number, unit: string): IntelligenceObservation {
  return { key, date, value, unit, provenance: 'owner', sourceIds: ['synthetic'] }
}

function snapshot(observations: IntelligenceObservation[]) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: '2026-10-14', start: '2026-10-01', end: '2026-10-14',
    today: '2026-10-14', timezone: 'America/Phoenix', observations,
  })
}

describe('PIQ-0 source reliability — observed gaps vs protected invariants', () => {
  it('T03 KNOWN GAP: accurate food-source quality does not establish completeness of the whole day', () => {
    const quality = nutritionDayQuality([{ calories: 600, evidenceQuality: 'measured_reference' }])
    expect(quality.kind).toBe('high_confidence')
    expect(quality.entryCount).toBe(1)
    // Current behavior documented, not desirable: separate day-completeness
    // semantics and decision gate must be implemented in PIQ-1.
    expect(quality).not.toHaveProperty('dayCompleteness')
  })

  it('T14 PROTECTED: missing bowel observations stay absent; explicit zero remains zero', () => {
    const frame = snapshot([
      obs('bowel.count', '2026-10-10', 0, 'count'),
      obs('bowel.count', '2026-10-12', 1, 'count'),
    ]).frame
    expect(frame.find((d) => d.date === '2026-10-09')?.signals['bowel.count']).toBeUndefined()
    expect(frame.find((d) => d.date === '2026-10-10')?.signals['bowel.count']?.value).toBe(0)
    expect(frame.find((d) => d.date === '2026-10-12')?.signals['bowel.count']?.value).toBe(1)
  })

  it('T36 KNOWN GAP: pre-tracking training days are currently synthesized as zeros', () => {
    const frame = snapshot([obs('training.sessions', '2026-10-10', 1, 'sessions')]).frame
    expect(frame.find((d) => d.date === '2026-10-01')?.signals['training.sessions']?.value).toBe(0)
    expect(frame.find((d) => d.date === '2026-10-14')?.signals['training.sessions']).toBeUndefined()
    // PIQ-1 must distinguish days covered by tracking from pre-onboarding unknowns.
  })

  it('T28 PROTECTED: invented personal citation IDs cannot become trusted evidence', () => {
    const raw = JSON.stringify({
      blocks: [{ text: 'Your weight is 99 kg.', evidence_refs: ['body.weight.invented'] }],
      limitations: [], follow_ups: [],
    })
    expect(validateAskHealthAnswer(raw, []).ok).toBe(false)
  })
})
