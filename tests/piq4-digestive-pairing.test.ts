import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { selectDigestiveBowelWindow, summarizeBowelWindow } from '../src/domain/ask-health/digestive-window.js'
import { screenDigestiveLagReadiness } from '../src/domain/ask-health/digestive-pairing.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-09-01'
const question='Do my hard stools have anything to do with fiber or drinking water?'
const stoolDates=Array.from({length:16},(_,i)=>addCalendarDays('2026-09-15',i*2))
function metric(key: IntelligenceObservation['key'],date:string,value:number,
  extra:Partial<IntelligenceObservation>={}):IntelligenceObservation {
  return {key,date,value,unit:key==='nutrition.fiber_g'?'g':key==='hydration.ml'?'ml':'count',
    provenance:'owner',sourceIds:[key+date],...extra}
}
function fixture({stools=stoolDates, fiber=stoolDates, water=stoolDates, verified=fiber,
  todayStool=false, partial=false, verificationAvailable=true} : {
  stools?:string[], fiber?:string[], water?:string[], verified?:string[],
  todayStool?:boolean,partial?:boolean,verificationAvailable?:boolean
}={}) {
  const allStools=todayStool?[...stools,today]:stools
  const observations:IntelligenceObservation[]=[
    ...allStools.map(d=>metric('bowel.count',d,1)),
    ...fiber.map(d=>metric('nutrition.fiber_g',d,20,{quality:'high_confidence'})),
    ...water.map(d=>metric('hydration.ml',d,750)),
  ]
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'90d',start,end:today,asOf:today,timezone:'America/Phoenix',today,
    observations,nutritionVerifiedCompleteDates:new Set(verified),
    nutritionVerificationStatus:verificationAvailable?'available':'unavailable',
  })
  const focus=focusDigestiveContext({question,snapshot,today})!
  const selection=selectDigestiveBowelWindow(focus,today)!
  if(selection.status!=='ready')throw Error('unavailable scope')
  const rows=allStools.map(date=>({
    date,eventCount:1,typedCount:partial && date===stools[0]?0:1,
    hardCount:partial && date===stools[0]?0:1,
    matchedEventCount:1,
  }))
  const window=summarizeBowelWindow(snapshot,selection.scope,rows,today)
  return {snapshot,focus,window,pairing:screenDigestiveLagReadiness(snapshot,window,today)}
}
function facts(f=fixture(),mode:'personalized'|'deep'|'general_only'='personalized',q=question){
  const input:AskHealthPacketInput={
    question:q,lens:'general',range:'90d',contextMode:mode,asOf:today,
    period:{start,end:today},generatedAt:today+'T23:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],context:null,patterns:[],
    focusedDigestive:{...f.focus,digestivePairing:f.pairing,bowelWindow:f.window},
  }
  return buildAskHealthEvidencePacket(input).evidence
}
describe('PIQ-4.1 typed bowel/fiber/water lag pairing readiness',()=>{
  it('counts exact, directional 0/1/2 day matches and requires distinct weeks',()=>{
    const f=fixture()
    // Every other-day observation also overlaps the previous exposure at lag 2.
    // This is paired coverage, not independent confirmation of an effect.
    expect(f.pairing?.fiber.map(x=>x.pairedDays)).toEqual([16,0,15])
    expect(f.pairing?.fiber[0]).toMatchObject({
      maturity:'no_outcome_variation',pairedDays:16,
      fullyTypedBowelDays:16,missingOrUnqualifiedExposureDays:0,
    })
    expect(f.pairing?.loggedWater[0]?.maturity).toBe('logging_only')
    const evidence=facts(f).find(x=>x.id==='digestive.pairing.coverage.fiber')
    expect(evidence).toMatchObject({value:null,substantive:false,
      provenance:'quality_screen_only_no_association'})
    expect(evidence?.text).toContain('NOT for a claim of association')
    expect(evidence?.text).toContain('lacks variation')
    expect(evidence?.text).toContain('NOT independent replications')
    expect(evidence?.text).not.toContain('Spearman')
  })
  it('aligns earlier fiber to subsequent stool, not later fiber',()=>{
    const f=fixture({stools:['2026-10-11'],fiber:['2026-10-09','2026-10-12'],water:[],
      verified:['2026-10-09','2026-10-12']})
    expect(f.pairing?.fiber.map(x=>x.pairedDays)).toEqual([0,0,1])
    expect(f.pairing?.fiber[2]).toMatchObject({maturity:'insufficient_pairs',pairedCalendarWeeks:1})
  })
  it('does not borrow fiber outside the requested exact window',()=>{
    const f=fixture({stools:['2026-09-01'],fiber:['2026-08-31'],water:[],
      verified:['2026-08-31']})
    expect(f.pairing?.fiber.map(x=>x.pairedDays)).toEqual([0,0,0])
  })
  it('requires owner-confirmed reliable full days and suppresses verification failures',()=>{
    const unverified=fixture({verified:[]})
    expect(unverified.pairing?.fiber.map(x=>x.pairedDays)).toEqual([0,0,0])
    expect(unverified.pairing?.fiber[0]?.maturity).toBe('insufficient_pairs')
    const unavailable=fixture({verificationAvailable:false})
    expect(unavailable.pairing?.fiberVerification).toBe('unavailable')
    expect(unavailable.pairing?.fiber[0]?.maturity).toBe('insufficient_pairs')
    expect(facts(unavailable).find(x=>x.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('verification is unavailable')
  })
  it('never treats sparse, one-week or tied lag combinations as replicated relationships',()=>{
    const clustered=Array.from({length:13},(_,i)=>addCalendarDays('2026-10-01',i))
    const f=fixture({stools:clustered,fiber:clustered,water:clustered,verified:clustered})
    expect(f.pairing?.fiber[0]?.pairedDays).toBe(13)
    expect(f.pairing?.fiber[0]?.maturity).toBe('insufficient_pairs')
  })
  it('omits provisional day and incomplete Bristol types from all paired signals',()=>{
    const f=fixture({todayStool:true,partial:true})
    expect(f.pairing).toMatchObject({
      recordedBowelDays:17,fullyTypedBowelDays:15,
      partiallyTypedBowelDays:1,provisionalBowelDaysExcluded:1,
    })
    expect(f.pairing?.fiber[0]?.pairedDays).toBe(15)
  })
  it('never turns water event observations into verified hydration',()=>{
    const f=fixture({fiber:[],verified:[]})
    expect(f.pairing?.loggedWater[0]).toMatchObject({pairedDays:16,maturity:'logging_only'})
    expect(facts(f).find(x=>x.id==='digestive.pairing.coverage.water')?.text)
      .toContain('NOT total daily fluid intake')
  })
  it('withholds metadata on water-only or general-only requests, while deep opts in',()=>{
    const f=fixture()
    const personalWater=facts(f,'personalized','How much water did I drink?')
    expect(personalWater.some(x=>x.id.startsWith('digestive.pairing.'))).toBe(false)
    expect(facts(f,'general_only').some(x=>x.id.startsWith('digestive.pairing.'))).toBe(false)
    expect(facts(f,'deep','How has my health been?')
      .filter(x=>x.id.startsWith('digestive.pairing.coverage.')).map(x=>x.id).sort())
      .toEqual(['digestive.pairing.coverage.fiber','digestive.pairing.coverage.water'])
  })
  it('withholds readiness when canonical day-count reconciliation failed',()=>{
    const f=fixture()
    expect(screenDigestiveLagReadiness(f.snapshot,{status:'unavailable',
      scope:f.window.scope,reason:'source_mismatch'},today)).toBeNull()
  })
})
