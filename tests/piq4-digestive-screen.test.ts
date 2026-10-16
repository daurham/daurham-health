import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { attachBristolTypes, digestDateSelection, focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { deriveDigestiveSampleScreen } from '../src/domain/ask-health/digestive-screen.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

const today = '2026-10-16'
const start = '2026-10-01'
const question = 'Are my hard stools from not drinking enough water or fiber?'
const events: IntelligenceObservation[] = [
  { key: 'bowel.count', date: '2026-10-12', value: 2, unit: 'count',
    provenance: 'owner', sourceIds: ['bowel-1', 'bowel-2'] },
  { key: 'bowel.count', date: '2026-10-14', value: 0, unit: 'count',
    provenance: 'owner', sourceIds: [] },
  { key: 'hydration.ml', date: '2026-10-12', value: 600, unit: 'ml',
    provenance: 'owner', sourceIds: ['water-1'] },
  { key: 'nutrition.fiber_g', date: '2026-10-12', value: 17, unit: 'g',
    provenance: 'owner', quality: 'high_confidence', sourceIds: ['food-1'] },
]
function fixture(q=question, observations=events, withBristol=true,
  verified: ReadonlySet<string>=new Set(['2026-10-12'])) {
  const snapshot = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: today, start, end: today, timezone: 'America/Phoenix', today,
    observations, nutritionVerifiedCompleteDates: verified,
    nutritionVerificationStatus: 'available',
  })
  const focused = focusDigestiveContext({ question:q, snapshot, today })
  return withBristol ? attachBristolTypes(focused, [
    { id: 'bowel-1', date: '2026-10-12', bristolType: 1 },
    { id: 'bowel-2', date: '2026-10-12', bristolType: 2 },
  ]) : focused
}
function evidence(mode: AskContextMode, q=question, observations=events,
  withBristol=true, verified?: ReadonlySet<string>) {
  const focusedDigestive = fixture(q, observations, withBristol, verified)
  const input: AskHealthPacketInput = {
    question:q, contextMode:mode, lens:'nutrition', range:'30d', asOf:today,
    period:{start,end:today}, generatedAt:'2026-10-16T16:00:00.000Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],context:null,patterns:[],focusedDigestive,
  }
  return buildAskHealthEvidencePacket(input).evidence
}

describe('PIQ-4.1 sampled digestive screen (synthetic only)', () => {
  it('distinguishes a causal from-question from a historical from-date range', () => {
    expect(digestDateSelection(question, today).issue).toBeNull()
    expect(digestDateSelection('Were my hard stools from low fiber last week?', today).issue).toBeNull()
    expect(digestDateSelection('How much water from 2026-10-02 to 2026-10-08?', today).issue)
      .not.toBeNull()
    expect(digestDateSelection('How much water from last week through today?', today).issue)
      .not.toBeNull()
  })

  it('detects hard Bristol observations as a *sample*, not a personal cause', () => {
    const screen = deriveDigestiveSampleScreen(fixture())!
    expect(screen).toMatchObject({
      typedEvents:2,hardTypedEvents:2,sampledBowelDays:2,explicitZeroDays:1,
      daysAlsoShowingLoggedWater:1,daysAlsoShowingVerifiedFiber:1,
      provisionalBowelDays:0,typedEvidenceDates:['2026-10-12'],
    })
    const derived=evidence('personalized').find(e=>e.id==='digestive.screen.sampled_bristol')
    expect(derived?.value).toBe(2)
    expect(derived?.text).toContain('at most three selected dated bowel-observation days')
    expect(derived?.text).toContain('not a complete stool history')
    expect(derived?.text).toContain('logged water is not total fluid consumption')
    expect(derived?.text).toContain('not proof of dehydration')
    expect(derived?.provenance).toBe('derived_from_selected_owner_logged_events')
    expect(derived?.evidenceDates).toEqual(['2026-10-12'])
  })

  it('does not classify hard stool without recorded Bristol types or assume missing bowel days were zero', () => {
    expect(deriveDigestiveSampleScreen(fixture(question, events, false))).toBeNull()
    expect(evidence('personalized',question,events,false).some(e=>e.id==='digestive.screen.sampled_bristol'))
      .toBe(false)
    expect(deriveDigestiveSampleScreen(fixture(question,events.filter(o=>o.key!=='bowel.count'))))
      .toBeNull()
    const screen=deriveDigestiveSampleScreen(fixture())!
    expect(screen.explicitZeroDays).toBe(1)
    expect(screen.sampledBowelDays).toBe(2) // not 16 calendar days
  })

  it('does not interpret missing or incomplete food days as zero fiber or dehydration', () => {
    const noWater=events.filter(o=>o.key!=='hydration.ml')
    const screen=deriveDigestiveSampleScreen(fixture(question,noWater,true,new Set()))!
    expect(screen.daysAlsoShowingLoggedWater).toBe(0)
    expect(screen.daysAlsoShowingVerifiedFiber).toBe(0)
    const derived=evidence('personalized',question,noWater,true,new Set())
      .find(e=>e.id==='digestive.screen.sampled_bristol')
    expect(derived?.text).toContain('missing logs are unknown')
    expect(derived?.text).not.toMatch(/caused by|is dehydrated|because you failed to drink/i)
  })

  it('does not leak digestive screening into water-only or unrelated questions', () => {
    for (const q of ['Did I log water?', 'What did I do yesterday?', 'How is my protein?']) {
      expect(evidence('personalized',q).some(e=>e.id==='digestive.screen.sampled_bristol'))
        .toBe(false)
    }
    expect(evidence('general_only').some(e=>e.id==='digestive.screen.sampled_bristol')).toBe(false)
  })

  it('does not substitute recent samples for an impossible or out-of-range historical request', () => {
    for (const q of ['On 2026-09-12 were my hard stools related to fiber?',
      'On 10/12/2026 were my hard stools related to fiber?']) {
      expect(deriveDigestiveSampleScreen(fixture(q))).toBeNull()
      expect(evidence('personalized',q).some(e=>e.id==='digestive.screen.sampled_bristol'))
        .toBe(false)
    }
  })

  it('does not extrapolate from a single type or a provisional current day', () => {
    const current: IntelligenceObservation[] = [
      { key:'bowel.count',date:today,value:2,unit:'count',provenance:'owner',
        sourceIds:['bowel-1','bowel-2'] },
    ]
    const snapshot=buildHealthIntelligenceSnapshot({
      range:'30d',asOf:today,start,end:today,timezone:'America/Phoenix',today,
      observations:current,nutritionVerifiedCompleteDates:new Set<string>(),
      nutritionVerificationStatus:'available',
    })
    const focused=focusDigestiveContext({question,snapshot,today})!
    const augmented=attachBristolTypes(focused,[
      {id:'bowel-1',date:today,bristolType:1},
    ])
    expect(deriveDigestiveSampleScreen(augmented)).toMatchObject({
      typedEvents:1,hardTypedEvents:1,untypedEventRecords:1,provisionalBowelDays:1,
    })
  })

  it('does not mistake non-hard samples for proof of no hard stool outside samples', () => {
    const base=fixture()
    const nonHard=attachBristolTypes(base,[
      {id:'bowel-1',date:'2026-10-12',bristolType:3},
      {id:'bowel-2',date:'2026-10-12',bristolType:4},
    ])
    expect(deriveDigestiveSampleScreen(nonHard)).toMatchObject({typedEvents:2,hardTypedEvents:0})
  })
})
