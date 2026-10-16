import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import {
  attachBristolTypes, digestiveQuestionTopics, focusDigestiveContext,
} from '../src/domain/ask-health/focused-digestive.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

const today = '2026-10-15'
const start = '2026-10-01'
const observations: IntelligenceObservation[] = [
  { key: 'nutrition.fiber_g', date: '2026-10-12', value: 22, unit: 'g', provenance: 'owner',
    quality: 'high_confidence', sourceIds: ['fiber'] },
  { key: 'hydration.ml', date: '2026-10-13', value: 850, unit: 'ml',
    provenance: 'owner', sourceIds: ['water'] },
  { key: 'bowel.count', date: '2026-10-13', value: 2, unit: 'count',
    provenance: 'owner', sourceIds: ['b1', 'b2'] },
  { key: 'bowel.count', date: '2026-10-14', value: 0, unit: 'count',
    provenance: 'owner', sourceIds: [] },
]
const snapshot = buildHealthIntelligenceSnapshot({
  range: '30d', asOf: today, start, end: today, timezone: 'America/Phoenix',
  today, observations, nutritionVerifiedCompleteDates: new Set(['2026-10-12']),
  nutritionVerificationStatus: 'available',
})

function evidence(mode: AskContextMode, question: string, withTypes = false) {
  const focused = focusDigestiveContext({
    question, snapshot, today, includeBroadContext: mode === 'deep',
  })
  const focusedDigestive = withTypes ? attachBristolTypes(focused, [
    { id: 'b1', date: '2026-10-13', bristolType: 1 },
    { id: 'b2', date: '2026-10-13', bristolType: 2 },
  ]) : focused
  const input: AskHealthPacketInput = {
    question, contextMode: mode, lens: 'general',
    range: '30d', asOf: today, period: { start, end: today },
    generatedAt: today + 'T18:00:00.000Z',
    overview: null, activity: null, sleep: null, goals: [], experiments: [],
    benchmarks: [], supplements: [], context: null, patterns: [], focusedDigestive,
  }
  return buildAskHealthEvidencePacket(input).evidence
}

describe('PIQ-3.3 focused digestive stool and minimum-necessary evidence', () => {
  it('recognizes recorded poop and drinking-enough questions using the same topic filter', () => {
    expect(digestiveQuestionTopics('How many times did I poop?')).toMatchObject({
      bowel: true, fiber: false, hydration: false,
    })
    expect(digestiveQuestionTopics('Am I drinking enough?')).toMatchObject({
      bowel: false, fiber: false, hydration: true,
    })
    for (const mode of ['smart', 'personalized'] as const) {
      const poop = evidence(mode, 'How many times did I poop?')
      expect(poop.some((item) => item.id === 'digestive.focus.bowel.2026-10-13')).toBe(true)
      expect(poop.some((item) => item.id.startsWith('digestive.focus.fiber.'))).toBe(false)
      expect(poop.some((item) => item.id.startsWith('digestive.focus.hydration.'))).toBe(false)
      const water = evidence(mode, 'Am I drinking enough?')
      expect(water.some((item) => item.id === 'digestive.focus.hydration.2026-10-13')).toBe(true)
      expect(water.some((item) => item.id.startsWith('digestive.focus.bowel.'))).toBe(false)
      expect(water.some((item) => item.id.startsWith('digestive.focus.fiber.'))).toBe(false)
    }
  })

  it('preserves deliberately multi-domain symptom context without claiming causality', () => {
    const symptom = evidence('personalized', 'Why have I been constipated?')
    for (const key of ['fiber', 'hydration', 'bowel']) {
      expect(symptom.some((item) => item.id === 'digestive.focus.coverage.' + key)).toBe(true)
    }
    expect(symptom.find((item) => item.id === 'digestive.focus.bowel.2026-10-14')?.text)
      .toContain('explicitly reported no bowel movement')
  })

  it('joins Bristol types only when matching the canonical source ID and day', () => {
    const focused = focusDigestiveContext({
      question: 'What kind of stools have I had?', snapshot, today,
    })
    const attached = attachBristolTypes(focused, [
      { id: 'b1', date: '2026-10-13', bristolType: 1 },
      { id: 'b2', date: '2026-10-13', bristolType: 6 },
      { id: 'b1', date: '2026-10-14', bristolType: 7 },
      { id: 'unknown', date: '2026-10-13', bristolType: 4 },
    ])
    // The last duplicate ID is a deliberately hostile fixture. A mismatched
    // date must not be associated with a saved source even if its ID collides.
    expect(attached?.bowel.observations.find((day) => day.date === '2026-10-13')?.bristolTypes)
      .toEqual([6])
    expect(attached?.bowel.observations.find((day) => day.date === '2026-10-14')?.bristolTypes)
      .toEqual([])
  })

  it('reports saved Bristol types as descriptive owner evidence, not a diagnosis', () => {
    const detail = evidence('personalized', 'What Bristol stool types did I log?', true)
      .find((item) => item.id === 'digestive.focus.bowel.2026-10-13')
    expect(detail?.text).toContain('owner-recorded Bristol stool types: 1, 2')
    expect(detail?.text).toContain('2 of 2 selected event records')
    expect(detail?.text).toContain('do not establish a cause or diagnosis')
    expect(detail?.provenance).toBe('owner_logged')
    expect(detail?.evidenceDates).toEqual(['2026-10-13'])
  })

  it('does not invent zero-day stool types or expose bowel records to a hydration-only question', () => {
    const zero = evidence('deep', 'What is changing for me?', true)
      .find((item) => item.id === 'digestive.focus.bowel.2026-10-14')
    expect(zero?.value).toBe(0)
    expect(zero?.text).not.toContain('owner-recorded Bristol stool types')
    expect(evidence('personalized', 'Did I drink enough water?', true)
      .some((item) => item.id.startsWith('digestive.focus.bowel.'))).toBe(false)
  })
})
