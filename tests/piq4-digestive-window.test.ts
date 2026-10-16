import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { selectDigestiveBowelWindow, summarizeBowelWindow } from '../src/domain/ask-health/digestive-window.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const start='2026-10-01', today='2026-10-16'
const question='What do my bowel records say about hard stools and fiber?'
const obs: IntelligenceObservation[] = [
  {key:'bowel.count',date:'2026-10-12',value:2,unit:'count',provenance:'owner',sourceIds:['a','b']},
  {key:'bowel.count',date:'2026-10-14',value:0,unit:'count',provenance:'owner',sourceIds:[]},
  {key:'hydration.ml',date:'2026-10-12',value:700,unit:'ml',provenance:'owner',sourceIds:['w']},
]
const rows=[{date:'2026-10-12',eventCount:2,typedCount:2,hardCount:1}]
function fixture(observations=obs, q=question, begin=start) {
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',asOf:today,start:begin,end:today,timezone:'America/Phoenix',today,
    observations,nutritionVerifiedCompleteDates:new Set<string>(),
    nutritionVerificationStatus:'available',
  })
  const focus=focusDigestiveContext({question:q,snapshot,today})
  return {snapshot,focus}
}
function packetFrom(window: NonNullable<ReturnType<typeof summarizeBowelWindow>>, q=question) {
  const focus=fixture().focus!
  const input: AskHealthPacketInput={
    question:q,lens:'general',contextMode:'personalized',range:'30d',asOf:today,
    generatedAt:today+'T20:00:00.000Z',period:{start,end:today},
    overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],context:null,patterns:[],focusedDigestive:{...focus,bowelWindow:window},
  }
  return buildAskHealthEvidencePacket(input).evidence
}
describe('PIQ-4.1 bounded full-window bowel evidence without causal inference',()=>{
  it('reconciles exact canonical days, recorded Bristol and explicit zero separately',()=>{
    const {snapshot,focus}=fixture()
    const selection=selectDigestiveBowelWindow(focus,today)!
    expect(selection.status).toBe('ready')
    if(selection.status!=='ready')throw Error('scope unexpectedly unavailable')
    const result=summarizeBowelWindow(snapshot,selection.scope,rows,today)
    expect(result).toMatchObject({status:'available',observedDays:2,movementEvents:2,
      typedEvents:2,hardTypedEvents:1,untypedEvents:0,explicitNoMovementDays:1,
      unobservedDays:14,provisionalDays:0})
    const value=packetFrom(result).find(e=>e.id==='digestive.window.bristol')
    expect(value?.value).toBe(1)
    expect(value?.text).toContain('UNKNOWN, not zero')
    expect(value?.text).toContain('not all bowel movements')
    expect(value?.text).toContain('no diagnosis or personal water/fiber correlation')
    expect(value?.period).toEqual({start,end:today})
    expect(value?.evidenceDates).toEqual(['2026-10-12','2026-10-14'])
  })
  it('suppresses mixed-snapshot count mismatches and malformed aggregate rows',()=>{
    const {snapshot,focus}=fixture(),selection=selectDigestiveBowelWindow(focus,today)!
    if(selection.status!=='ready')throw Error('scope')
    for(const bad of [
      [{...rows[0]!,eventCount:3}],
      [{...rows[0]!,typedCount:3}],
      [{...rows[0]!,hardCount:3}],
      [{...rows[0]!,date:'2026-10-13'}],
      [...rows,...rows],
      [],
    ]) {
      expect(summarizeBowelWindow(snapshot,selection.scope,bad,today))
        .toMatchObject({status:'unavailable',reason:'source_mismatch'})
    }
    const unavailable=summarizeBowelWindow(snapshot,selection.scope,[],today)
    expect(packetFrom(unavailable).some(e=>e.id==='digestive.window.bristol')).toBe(false)
    expect(packetFrom(unavailable).find(e=>e.id==='digestive.window.unavailable')?.substantive)
      .toBe(false)
  })
  it('does not treat no logged bowel events as a confirmed rest/zero day',()=>{
    const {snapshot,focus}=fixture([],question)
    const selection=selectDigestiveBowelWindow(focus,today)!
    if(selection.status!=='ready')throw Error('scope')
    const value=summarizeBowelWindow(snapshot,selection.scope,[],today)
    expect(value).toMatchObject({status:'available',observedDays:0,
      movementEvents:0,explicitNoMovementDays:0,unobservedDays:16})
    expect(packetFrom(value).find(e=>e.id==='digestive.window.bristol')?.substantive).toBe(false)
  })
  it('shows typed denominator explicitly when an event has no valid type',()=>{
    const {snapshot,focus}=fixture()
    const selection=selectDigestiveBowelWindow(focus,today)!
    if(selection.status!=='ready')throw Error('scope')
    expect(summarizeBowelWindow(snapshot,selection.scope,
      [{...rows[0]!,typedCount:1,hardCount:1}],today))
      .toMatchObject({typedEvents:1,hardTypedEvents:1,untypedEvents:1})
  })
  it('rejects oversized windows rather than truncating All or 6m history',()=>{
    const {focus}=fixture([],question,'2026-01-01')
    const selected=selectDigestiveBowelWindow(focus,today)!
    expect(selected).toMatchObject({status:'range_too_large'})
    const packet=packetFrom({status:'unavailable',reason:'range_too_large',
      scope:selected.scope})
    expect(packet.find(e=>e.id==='digestive.window.unavailable')?.text)
      .toContain('no silently clipped totals')
  })
  it('uses exactly the requested historical date or trailing window',()=>{
    const single=fixture(obs,'What were my stools on 2026-10-12?').focus
    expect(selectDigestiveBowelWindow(single,today)).toMatchObject({
      status:'ready',scope:{start:'2026-10-12',end:'2026-10-12',calendarDays:1}})
    const trailing=fixture(obs,'How were my stools in the past 7 days?').focus
    expect(selectDigestiveBowelWindow(trailing,today)).toMatchObject({
      status:'ready',scope:{start:'2026-10-10',end:today,calendarDays:7}})
    const invalid=fixture(obs,'Did my stools change between 2026-10-11 and 2026-10-14?').focus
    expect(selectDigestiveBowelWindow(invalid,today)).toBeNull()
    const old=fixture(obs,'What were my stools on 2026-09-12?').focus
    expect(selectDigestiveBowelWindow(old,today)).toBeNull()
  })
  it("recognizes today\'s record as provisional without assuming the day was completed",()=>{
    const current=[...obs,{key:'bowel.count' as const,date:today,value:1,unit:'count',
      provenance:'owner' as const,sourceIds:['c']}]
    const {snapshot,focus}=fixture(current)
    const selection=selectDigestiveBowelWindow(focus,today)!
    if(selection.status!=='ready')throw Error('scope')
    expect(summarizeBowelWindow(snapshot,selection.scope,[...rows,
      {date:today,eventCount:1,typedCount:1,hardCount:1}],today))
      .toMatchObject({status:'available',provisionalDays:1,observedDays:3})
  })
  it('never adds bowel window evidence to water-only or General Only context',()=>{
    const {snapshot,focus}=fixture()
    const selection=selectDigestiveBowelWindow(focus,today)!
    if(selection.status!=='ready')throw Error('scope')
    const full=summarizeBowelWindow(snapshot,selection.scope,rows,today)
    const focusWith={...focus!,bowelWindow:full}
    for(const [mode,q] of [['personalized','How much water have I logged?'],['general_only',question]] as const){
      const input:AskHealthPacketInput={question:q,lens:'general',contextMode:mode,range:'30d',
        asOf:today,generatedAt:today+'T20:00:00Z',period:{start,end:today},
        overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
        supplements:[],context:null,patterns:[],focusedDigestive:focusWith}
      expect(buildAskHealthEvidencePacket(input).evidence.some(e=>e.id.startsWith('digestive.window.')))
        .toBe(false)
    }
  })
})
