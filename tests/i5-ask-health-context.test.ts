import { describe, expect, it } from 'vitest'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.ts'
import { ASK_HEALTH_PACKET_VERSION, ASK_HEALTH_PROMPT_VERSION } from '../src/domain/ask-health/config.ts'
import { buildHealthIntelligenceSnapshot, routeHealthIntelligence, type IntelligenceObservation } from '../src/domain/intelligence/shared.ts'

function observation(key: IntelligenceObservation['key'], date: string, value: number): IntelligenceObservation {
  const unit = key === 'hydration.ml' ? 'ml' : key === 'bowel.count' ? 'count' : 'g'
  return { key, date, value, unit, provenance: 'owner', sourceIds: [] }
}

describe('I5 Ask Health shared context', () => {
  it('routes Daily Signals relationships and missing context into the evidence packet', () => {
    const observations: IntelligenceObservation[] = []
    for (let day = 1; day <= 12; day += 1) {
      const date = `2026-09-${String(day).padStart(2, '0')}`
      observations.push(observation('hydration.ml', date, 1000 + day * 100))
      if (day > 1) observations.push(observation('bowel.count', date, day))
    }
    const snapshot = buildHealthIntelligenceSnapshot({
      range: '30d',
      asOf: '2026-09-12',
      start: '2026-09-01',
      end: '2026-09-12',
      timezone: 'America/Phoenix',
      today: null,
      observations,
    })
    const intelligence = routeHealthIntelligence(snapshot, {
      question: 'Is my hydration related to bowel movements?',
      lens: 'general',
    })
    const packet = buildAskHealthEvidencePacket({
      lens: 'general',
      range: '30d',
      asOf: '2026-09-12',
      period: { start: '2026-09-01', end: '2026-09-12' },
      generatedAt: '2026-09-12T18:00:00.000Z',
      question: 'Is my hydration related to bowel movements?',
      overview: null,
      activity: null,
      sleep: null,
      goals: [],
      experiments: [],
      benchmarks: [],
      supplements: [],
      context: null,
      patterns: [],
      intelligence,
    })

    expect(packet.packetVersion).toBe('ask-health-evidence-v2')
    expect(ASK_HEALTH_PACKET_VERSION).toBe('ask-health-evidence-v2')
    expect(ASK_HEALTH_PROMPT_VERSION).toBe('ask-health-v4')
    expect(packet.evidence.some((item) => item.id.includes('shared:hydration:bowel:next_day') && item.substantive)).toBe(true)
    expect(packet.contextSummary.knows.some((item) => item.label === 'Personal relationship')).toBe(true)
    expect(packet.contextSummary.missing.some((item) => item.key === 'nutrition.fiber_g')).toBe(true)
    expect(packet.limitations.some((item) => item.code.includes('missing_nutrition.fiber_g'))).toBe(true)
  })
})
