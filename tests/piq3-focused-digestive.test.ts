import { describe, expect, it } from 'vitest'
import {
  buildHealthIntelligenceSnapshot, type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { buildAskHealthEvidencePacket, packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const start = '2026-10-01'
const today = '2026-10-15'
const question = 'Why are my stools small and hard; is fiber or water involved?'
function observation(
  key: IntelligenceObservation['key'], date: string, value: number,
  extras: Partial<IntelligenceObservation> = {},
): IntelligenceObservation {
  return { key, date, value, unit: key === 'nutrition.fiber_g' ? 'g'
    : key === 'hydration.ml' ? 'ml' : 'count',
  provenance: 'owner', sourceIds: [key + ':' + date], ...extras }
}
const fixture: IntelligenceObservation[] = [
  observation('nutrition.fiber_g', '2026-10-11', 16, { quality: 'high_confidence' }),
  observation('nutrition.fiber_g', '2026-10-12', 7, { quality: 'low_confidence' }),
  observation('nutrition.fiber_g', '2026-10-13', 8, { quality: 'high_confidence' }),
  observation('nutrition.fiber_g', '2026-10-14', 14, { quality: 'high_confidence' }),
  observation('nutrition.fiber_g', today, 3, { quality: 'high_confidence' }),
  observation('hydration.ml', '2026-10-13', 500),
  observation('hydration.ml', '2026-10-14', 1000),
  observation('hydration.ml', today, 250),
  observation('bowel.count', '2026-10-12', 0, { sourceIds: [] }),
  observation('bowel.count', '2026-10-14', 2),
  observation('bowel.count', today, 1),
  // This is never eligible: it lies after the request date.
  observation('hydration.ml', '2026-10-16', 9000),
]
function snapshot(input: {
  data?: IntelligenceObservation[]
  verified?: ReadonlySet<string>
  today?: string | null
} = {}) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: today, start, end: today, timezone: 'America/Phoenix',
    today: input.today === undefined ? today : input.today,
    observations: input.data ?? fixture,
    nutritionVerifiedCompleteDates: input.verified ?? new Set(['2026-10-11', '2026-10-12', '2026-10-14', today]),
    nutritionVerificationStatus: 'available',
  })
}
function packet(value: NonNullable<ReturnType<typeof focusDigestiveContext>>) {
  const input: AskHealthPacketInput = {
    question, lens: 'nutrition', range: '30d', asOf: today,
    generatedAt: today + 'T20:00:00.000Z', period: { start, end: today },
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [], focusedDigestive: value,
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ-3.3 focused digestive evidence', () => {
  it('selects context only for digestive, water and fiber questions', () => {
    expect(focusDigestiveContext({ question: 'How is my bench press?', snapshot: snapshot(), today })).toBeNull()
    for (const q of ['Am I getting enough fiber?', 'Why am I constipated?', 'What are my Bristol stool logs?', 'How much water intake did I log?', 'Why do I have hard stools?', 'How many bowel movements have I logged?']) {
      expect(focusDigestiveContext({ question: q, snapshot: snapshot(), today })).not.toBeNull()
    }
  })
  it('requires verified reliable past food days and never calls today complete', () => {
    const focused = focusDigestiveContext({ question, snapshot: snapshot(), today })!
    expect(focused.fiber).toMatchObject({
      recordedDays: 5, verifiedDays: 2, verificationStatus: 'available',
    })
    expect(focused.fiber.observations.map(x => [x.date, x.value]))
      .toEqual([['2026-10-14', 14], ['2026-10-11', 16]])
    expect(JSON.stringify(focused.fiber)).not.toContain('2026-10-12')
    expect(JSON.stringify(focused.fiber.observations)).not.toContain('2026-10-15')
  })
  it('distinguishes explicit no-bowel entries from missing dates; labels current events provisional', () => {
    const focus = focusDigestiveContext({ question, snapshot: snapshot(), today })!
    expect(focus.bowel.recordedDays).toBe(3)
    expect(focus.bowel.observations.find(x=>x.date === '2026-10-12'))
      .toMatchObject({ value: 0, sourceIds: [] })
    expect(focus.bowel.observations.some(x=>x.date === '2026-10-13')).toBe(false)
    expect(focus.bowel.observations[0]).toMatchObject({ date: today, provisional: true })
    const evidence = packet(focus).evidence.find(x=>x.id === 'digestive.focus.bowel.2026-10-12')
    expect(evidence?.text).toContain('explicitly reported no bowel movement')
    expect(packet(focus).evidence.find(x=>x.id === 'digestive.focus.coverage.bowel')?.text)
      .toContain('absent logs mean unknown')
  })
  it('hydration is logged water, not total fluid or inferred dehydration', () => {
    const focus = focusDigestiveContext({ question, snapshot: snapshot(), today })!
    expect(focus.hydration.observations.map(x => x.value)).toEqual([250, 1000, 500])
    expect(focus.hydration.observations[0]?.provisional).toBe(true)
    const evidence = packet(focus).evidence
    expect(evidence.find(x=>x.id === 'digestive.focus.hydration.2026-10-15')?.text)
      .toContain('actual total fluids may be higher')
    expect(JSON.stringify(evidence)).not.toMatch(/9000|cause of constipation|dehydrated due to/i)
  })
  it('when verification is unavailable, suppresses all asserted complete-day fiber values', () => {
    const raw = snapshot()
    const broken = { ...raw, coverage: raw.coverage.map(c => c.key === 'nutrition.fiber_g'
      ? { ...c, completenessCheck: 'unavailable' as const } : c) }
    const focus = focusDigestiveContext({ question, snapshot: broken, today })!
    expect(focus.fiber.recordedDays).toBe(5)
    expect(focus.fiber.verifiedDays).toBe(0)
    expect(focus.fiber.observations).toEqual([])
    const evidence = packet(focus).evidence
    expect(evidence.find(x=>x.id === 'digestive.focus.coverage.fiber')?.text)
      .toContain('Whole-day fiber verification unavailable')
    expect(evidence.filter(x=>x.id.startsWith('digestive.focus.fiber.'))).toEqual([])
  })
  it('without observations, does not manufacture bowel zero, fiber or hydration totals', () => {
    const focus = focusDigestiveContext({ question, snapshot: snapshot({ data: [] }), today })!
    for(const metric of [focus.fiber,focus.hydration,focus.bowel]){
      expect(metric.recordedDays).toBe(0)
      expect(metric.observations).toEqual([])
    }
    const out = packet(focus).evidence
    expect(out.filter(x=>x.id.startsWith('digestive.focus.') && !x.id.includes('.coverage.')))
      .toHaveLength(0)
    expect(out.every(x=>x.substantive === false)).toBe(true)
  })
  it('caps observations to three dates per signal and preserves selected coverage', () => {
    const data = Array.from({length: 10},(_,i)=>{
      const date = '2026-10-' + String(i+1).padStart(2,'0')
      return observation('hydration.ml',date,(i+1)*100)
    })
    const focus = focusDigestiveContext({ question, snapshot: snapshot({data}), today })!
    expect(focus.hydration.recordedDays).toBe(10)
    expect(focus.hydration.observations).toHaveLength(3)
    expect(focus.hydration.observations.map(x=>x.date)).toEqual(['2026-10-10','2026-10-09','2026-10-08'])
    expect(packet(focus).evidenceSelectionAudit?.exceedsMaxChars).toBe(false)
  })
  it('a corrected confirmed fiber total invalidates the explanation cache fingerprint', () => {
    const before = focusDigestiveContext({question,snapshot:snapshot(),today})!
    const revised = fixture.map(x=>x.key==='nutrition.fiber_g' && x.date==='2026-10-14'
      ? {...x,value:22}:x)
    const after = focusDigestiveContext({question,snapshot:snapshot({data:revised}),today})!
    expect(packet(before).evidence.find(x=>x.id==='digestive.focus.fiber.2026-10-14')?.value).toBe(14)
    expect(packet(after).evidence.find(x=>x.id==='digestive.focus.fiber.2026-10-14')?.value).toBe(22)
    expect(packetFingerprintMaterial(packet(before))).not.toBe(packetFingerprintMaterial(packet(after)))
  })
})
