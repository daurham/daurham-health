import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import {
  digestDateSelection, focusDigestiveContext, requestedDigestiveCalendarDay,
} from '../src/domain/ask-health/focused-digestive.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

const today = '2026-10-15'
const start = '2026-10-01'
const dates = ['2026-10-03', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']
const records: IntelligenceObservation[] = [
  ...dates.map((date, index) => ({
    key: 'hydration.ml' as const, date, value: 1000 + index * 100,
    unit: 'ml', provenance: 'owner' as const, sourceIds: ['water-' + date],
  })),
  { key: 'bowel.count', date: '2026-10-03', value: 1, unit: 'count',
    provenance: 'owner', sourceIds: ['bowel-early'] },
  { key: 'bowel.count', date: '2026-10-14', value: 0, unit: 'count',
    provenance: 'owner', sourceIds: [] },
  { key: 'nutrition.fiber_g', date: '2026-10-03', value: 21, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['fiber-verified'] },
  { key: 'nutrition.fiber_g', date: '2026-10-11', value: 8, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['fiber-unverified'] },
]
const snapshot = buildHealthIntelligenceSnapshot({
  range: '30d', asOf: today, start, end: today, timezone: 'America/Phoenix',
  today, observations: records,
  nutritionVerifiedCompleteDates: new Set(['2026-10-03']),
  nutritionVerificationStatus: 'available',
})
function evidence(question: string, mode: AskContextMode = 'personalized') {
  const focusedDigestive = focusDigestiveContext({
    question, snapshot, today, includeBroadContext: mode === 'deep',
  })
  const input: AskHealthPacketInput = {
    question, contextMode: mode, lens: 'general',
    range: '30d', asOf: today, period: { start, end: today },
    generatedAt: today + 'T18:00:00.000Z',
    overview: null, activity: null, sleep: null, goals: [],
    experiments: [], benchmarks: [], supplements: [], context: null,
    patterns: [], focusedDigestive,
  }
  return buildAskHealthEvidencePacket(input).evidence
}

describe('PIQ-3.3 specific historical digestive day retrieval', () => {
  it('chooses a valid explicitly requested older day instead of the three newest days', () => {
    const focus = focusDigestiveContext({ question: 'How much water on 2026-10-03?', snapshot, today })
    expect(focus?.requestedDate).toEqual({ date: '2026-10-03', inSelectedRange: true })
    expect(focus?.hydration.recordedDays).toBe(5)
    expect(focus?.hydration.observations.map(x => x.date)).toEqual(['2026-10-03'])
    expect(focus?.hydration.observations[0]?.value).toBe(1000)

    const facts = evidence('How much water on 2026-10-03?')
    expect(facts.find(x => x.id === 'digestive.focus.hydration.2026-10-03')?.value).toBe(1000)
    expect(facts.some(x => x.id === 'digestive.focus.hydration.2026-10-14')).toBe(false)
    expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
      .toContain('Showing only the requested day 2026-10-03')
  })

  it('resolves yesterday from the instance-local Health date, retaining explicit zero reports', () => {
    expect(requestedDigestiveCalendarDay('What did I log yesterday?', today)).toBe('2026-10-14')
    const bowel = evidence('How many times did I poop yesterday?')
    const day = bowel.find(x => x.id === 'digestive.focus.bowel.2026-10-14')
    expect(day?.value).toBe(0)
    expect(day?.text).toContain('explicitly reported no bowel movement')
    expect(bowel.some(x => x.id === 'digestive.focus.bowel.2026-10-03')).toBe(false)
  })

  it('does not treat a missing date as zero or use an unrelated recent date', () => {
    const facts = evidence('How much water on 2026-10-04?')
    const coverage = facts.find(x => x.id === 'digestive.focus.coverage.hydration')
    expect(coverage?.text).toContain('No eligible hydration observation')
    expect(coverage?.text).toContain('unknown, not zero')
    expect(coverage?.coverage).toMatchObject({
      requestedDate: '2026-10-04', requestedDateScope: 'in_range', selectedDays: 0,
    })
    expect(facts.some(x => x.id.startsWith('digestive.focus.hydration.'))).toBe(false)
  })

  it('fails closed when the requested historical date lies outside the selected scope', () => {
    const facts = evidence('What were my bowel movements on 2026-09-01?', 'deep')
    expect(facts.find(x => x.id === 'digestive.focus.coverage.bowel')?.text)
      .toContain('outside the selected')
    expect(facts.find(x => x.id === 'digestive.focus.coverage.bowel')?.coverage)
      .toMatchObject({ requestedDate: '2026-09-01', requestedDateScope: 'out_of_range' })
    expect(facts.some(x => x.id.startsWith('digestive.focus.bowel.'))).toBe(false)
  })

  it('keeps whole-day fiber reliability distinct from a dated food fragment', () => {
    const facts = evidence('How much fiber did I consume on 2026-10-11?')
    expect(facts.find(x => x.id === 'digestive.focus.coverage.fiber')?.text)
      .toContain('No eligible fiber observation')
    expect(facts.some(x => x.id === 'digestive.focus.fiber.2026-10-11')).toBe(false)
    expect(evidence('How much fiber on 2026-10-03?')
      .find(x => x.id === 'digestive.focus.fiber.2026-10-03')?.value).toBe(21)
  })

  it('does not silently substitute recent observations for invalid or multiple dates', () => {
    for (const question of [
      'How much water on 2026-02-30?',
      'Compare water on 2026-10-03 and 2026-10-14',
      'How much water on 10/03/2026?',
      'How much water October 3?',
      'How much water last year?',
    ]) {
      const resolved = digestDateSelection(question, today)
      expect(resolved.date).toBeNull()
      expect(resolved.issue).not.toBeNull()
      const facts = evidence(question)
      expect(facts.some(x => x.id.startsWith('digestive.focus.hydration.'))).toBe(false)
      expect(facts.find(x => x.id === 'digestive.focus.coverage.hydration')?.text)
        .toContain('No recent-day observations were substituted')
    }
  })

  it('preserves a bounded latest-three sample for undated Deep Dive questions', () => {
    const facts = evidence('How is my health generally?', 'deep')
    const dayEvidence = facts.filter(x => x.id.startsWith('digestive.focus.hydration.'))
    expect(dayEvidence.map(x => x.evidenceDates?.[0]).sort()).toEqual([
      '2026-10-12', '2026-10-13', '2026-10-14',
    ])
  })
})
