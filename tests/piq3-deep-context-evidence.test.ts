import { describe, expect, it } from 'vitest'
import {
  buildHealthIntelligenceSnapshot, type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

const date = '2026-10-15'
const start = '2026-10-01'
const question = 'What should I know about creatine?'

const records: IntelligenceObservation[] = [
  { key: 'nutrition.fiber_g', date: '2026-10-12', value: 19, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['food-fixture'] },
  { key: 'nutrition.fiber_g', date: '2026-10-13', value: 5, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['unverified-food'] },
  { key: 'hydration.ml', date: '2026-10-14', value: 900, unit: 'ml',
    provenance: 'owner', sourceIds: ['water-fixture'] },
  { key: 'bowel.count', date: '2026-10-14', value: 2, unit: 'count',
    provenance: 'owner', sourceIds: ['event-fixture'] },
]
const snapshot = buildHealthIntelligenceSnapshot({
  range: '30d', asOf: date, start, end: date, timezone: 'America/Phoenix',
  today: date, observations: records,
  nutritionVerifiedCompleteDates: new Set(['2026-10-12']),
  nutritionVerificationStatus: 'available',
})

function packet(mode: AskContextMode, inputQuestion: string) {
  const focusedDigestive = focusDigestiveContext({
    question: inputQuestion, snapshot, today: date, includeBroadContext: mode === 'deep',
  })
  const input: AskHealthPacketInput = {
    question: inputQuestion, contextMode: mode, lens: 'general', range: '30d',
    asOf: date, period: { start, end: date }, generatedAt: date + 'T16:00:00.000Z',
    overview: null, activity: null, sleep: null, goals: [], experiments: [],
    benchmarks: [], supplements: [], context: null, patterns: [],
    focusedDigestive,
  }
  return buildAskHealthEvidencePacket(input).evidence
}

describe('PIQ-3 Context Mode owner data inclusion', () => {
  it('vague questions do not load digestive details unless Deep Dive was explicitly selected', () => {
    expect(focusDigestiveContext({ question, snapshot, today: date })).toBeNull()
    expect(packet('smart', question).some(x => x.id.startsWith('digestive.focus.'))).toBe(false)
    expect(packet('personalized', question).some(x => x.id.startsWith('digestive.focus.'))).toBe(false)

    const deep = packet('deep', question)
    expect(deep.map(x => x.id)).toEqual(expect.arrayContaining([
      'digestive.focus.coverage.fiber',
      'digestive.focus.coverage.hydration',
      'digestive.focus.coverage.bowel',
      'digestive.focus.fiber.2026-10-12',
      'digestive.focus.hydration.2026-10-14',
      'digestive.focus.bowel.2026-10-14',
    ]))
    expect(deep.some(x => x.id === 'digestive.focus.fiber.2026-10-13')).toBe(false)
  })

  it('single-topic Personalized and Smart avoid transmitting unrelated detail', () => {
    for (const mode of ['smart', 'personalized'] as const) {
      const water = packet(mode, 'How much water did I log?').map(x => x.id)
      expect(water).toContain('digestive.focus.hydration.2026-10-14')
      expect(water).not.toContain('digestive.focus.fiber.2026-10-12')
      expect(water).not.toContain('digestive.focus.bowel.2026-10-14')
      const fiber = packet(mode, 'How much fiber did I log?').map(x => x.id)
      expect(fiber).toContain('digestive.focus.fiber.2026-10-12')
      expect(fiber).not.toContain('digestive.focus.hydration.2026-10-14')
      expect(fiber).not.toContain('digestive.focus.bowel.2026-10-14')
    }
  })

  it('Deep Dive retains source caution and does not promote unverified days to complete', () => {
    const evidence = packet('deep', question)
    const fiberCoverage = evidence.find(x => x.id === 'digestive.focus.coverage.fiber')
    expect(fiberCoverage?.coverage).toMatchObject({
      recordedDays: 2, verifiedDays: 1, unverifiedDays: 1,
    })
    expect(fiberCoverage?.text).toContain('Unverified days are unknown')
    expect(evidence.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
      .toContain('not proof of total daily fluid intake')
    expect(evidence.length).toBeLessThanOrEqual(9)
  })
})
