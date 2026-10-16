import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { selectDigestiveBowelWindow, summarizeBowelWindow, type BowelDateCountRow } from '../src/domain/ask-health/digestive-window.js'
import { screenDigestiveLagReadiness, type DigestiveContextTagDay } from '../src/domain/ask-health/digestive-pairing.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const start='2026-08-01',today='2026-10-16'
const bowelDates=Array.from({length:16},(_,i)=>addCalendarDays('2026-09-06',i*2))
function construct(options:{
  fiber?:number[],water?:number[],hard?:number[],
  missingFiber?:string[],context?:DigestiveContextTagDay[],todayAdded?:boolean,
  incomplete?:boolean,stoolDates?:string[],explicitZeroDates?:string[],
}={}) {
  const activeDates=options.stoolDates??bowelDates
  const recorded=options.todayAdded?[...activeDates,today]:activeDates
  const observations:IntelligenceObservation[]=[]
  for(let i=0;i<recorded.length;i++){
    const date=recorded[i]!
    observations.push({key:'bowel.count',date,value:1,unit:'count',provenance:'owner',sourceIds:['b'+i]})
  }
  for(let i=0;i<activeDates.length;i++){
    const date=activeDates[i]!
    if(!options.missingFiber?.includes(date))observations.push({
      key:'nutrition.fiber_g',date,value:options.fiber?.[i]??(17+i),
      unit:'g',provenance:'owner',quality:'high_confidence',sourceIds:['f'+i],
    })
    if(options.water)observations.push({
      key:'hydration.ml',date,value:options.water[i]??700,
      unit:'ml',provenance:'owner',sourceIds:['w'+i],
    })
  }
  for(const [i,date] of (options.explicitZeroDates??[]).entries()){
    observations.push({key:'bowel.count',date,value:0,unit:'count',provenance:'owner',
      sourceIds:[]})
  }
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'90d',asOf:today,start,end:today,timezone:'America/Phoenix',today,
    observations,nutritionVerifiedCompleteDates:new Set(activeDates),
    nutritionVerificationStatus:'available',
  })
  const focused=focusDigestiveContext({snapshot,question:'Are my stools from my fiber?',today})!
  const scope=selectDigestiveBowelWindow(focused,today)!
  if(scope.status!=='ready')throw Error('unexpected scope')
  const rows:BowelDateCountRow[]=recorded.map((date,i)=>{
    const typedCount=options.incomplete && i===0?0:1
    const hardCount=typedCount===0?0:(options.hard?.[i]??i%2)
    return {date,typedCount,hardCount,eventCount:1,matchedEventCount:1}
  })
  const window=summarizeBowelWindow(snapshot,scope.scope,rows,today)
  const screen=screenDigestiveLagReadiness(snapshot,window,today,options.context)
  return {snapshot,focused,window,screen}
}
function evidence(f:ReturnType<typeof construct>){
  const input:AskHealthPacketInput={
    question:'Are my hard stools related to fiber and water?',lens:'nutrition',
    range:'90d',asOf:today,contextMode:'personalized',period:{start,end:today},
    generatedAt:today+'T16:00:00Z',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
    focusedDigestive:{...f.focused,bowelWindow:f.window,digestivePairing:f.screen},
  }
  return buildAskHealthEvidencePacket(input).evidence
}
describe('PIQ-4.1 variation and confounder readiness (synthetic, no owner records)',()=>{
  it('allows ONLY a non-substantive review candidate with changed Bristol and fiber across four weeks',()=>{
    const f=construct()
    expect(f.screen?.fiber[0]).toMatchObject({
      maturity:'candidate_for_review',pairedDays:16,stoolHardnessVaries:true,
      exposureVaries:true,contextFlaggedPairDays:0,
    })
    const item=evidence(f).find(e=>e.id==='digestive.pairing.coverage.fiber')
    expect(item).toMatchObject({substantive:false,value:null,provenance:'quality_screen_only_no_association'})
    expect(item?.text).toContain('LATER controlled review')
    expect(item?.text).toContain('Absence of owner-entered context tags does NOT prove')
  })
  it('does not invent improved stool outcomes when every saved type is hard',()=>{
    const f=construct({hard:bowelDates.map(()=>1)})
    expect(f.screen?.fiber[0]).toMatchObject({
      maturity:'no_outcome_variation',stoolHardnessVaries:false,exposureVaries:true,
    })
    expect(evidence(f).find(e=>e.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('fixed series cannot support a change relationship')
  })
  it('rejects flat fiber even when Bristol types alternate',()=>{
    const f=construct({fiber:bowelDates.map(()=>20)})
    expect(f.screen?.fiber[0]).toMatchObject({
      maturity:'no_exposure_variation',stoolHardnessVaries:true,exposureVaries:false,
    })
  })
  it('flags supplement and medication context without concluding supplement causes constipation',()=>{
    const f=construct({context:[
      {contextDate:bowelDates[4]!,tags:['new_supplement']},
      {contextDate:bowelDates[6]!,tags:['medication_change']},
    ]})
    expect(f.screen?.fiber[0]?.maturity).toBe('context_review_required')
    expect(f.screen?.fiber[0]?.contextFlaggedPairDays).toBe(2)
    const item=evidence(f).find(e=>e.id==='digestive.pairing.coverage.fiber')
    expect(item?.text).toContain('alternative-explanation review')
    expect(item?.text).not.toMatch(/caused by|dehydrating supplement|creatine caused/i)
  })
  it('flags an earlier travel day for a two-day lag while leaving same-day unflagged',()=>{
    const travel=addCalendarDays(bowelDates[8]!, -1)
    const f=construct({context:[{contextDate:travel,tags:['travel']}]})
    expect(f.screen?.fiber[0]?.contextFlaggedPairDays).toBe(0)
    expect(f.screen?.fiber[2]?.contextFlaggedPairDays).toBeGreaterThan(0)
  })
  it('does not treat note-only context or rest_day as an illness/medication confounder',()=>{
    const f=construct({context:[{contextDate:bowelDates[3]!,tags:[]},
      {contextDate:bowelDates[4]!,tags:['rest_day']}]})
    expect(f.screen?.fiber[0]?.contextFlaggedPairDays).toBe(0)
  })
  it('flags simultaneous changes in logged water and verified fiber as non-isolated levers',()=>{
    const f=construct({water:bowelDates.map((_,i)=>500+i*25)})
    expect(f.screen?.fiber[0]).toMatchObject({
      daysAlsoLoggingWater:16,coLoggedWaterVaries:true,maturity:'context_review_required',
    })
    expect(f.screen?.loggedWater[0]?.maturity).toBe('logging_only')
    expect(evidence(f).find(e=>e.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('co-changing logged-water values')
  })
  it('does not mark a large but sparse set of fiber days as evidence of no bowel movement',()=>{
    const f=construct({missingFiber:bowelDates.slice(0,8)})
    expect(f.screen?.fiber[0]?.pairedDays).toBe(8)
    expect(f.screen?.fiber[0]?.maturity).toBe('insufficient_pairs')
  })
  it('ignores provisional stool date and unknown Bristol coding even in context calculations',()=>{
    const f=construct({todayAdded:true,incomplete:true})
    expect(f.screen).toMatchObject({
      provisionalBowelDaysExcluded:1,partiallyTypedBowelDays:1,fullyTypedBowelDays:15,
    })
    expect(f.screen?.fiber[0]?.pairedDays).toBe(15)
  })

  it('requires evidence in two non-overlapping 14-day bins rather than one dense cluster plus an outlier',()=>{
    // Eleven saved dates in one fortnight and a single later date across a
    // fourth Monday-start week; 12 pairs across 4 weeks but not 2 bins of 4.
    const dates=[
      ...Array.from({length:11},(_,i)=>addCalendarDays('2026-08-29',i)),
      '2026-09-16',
    ]
    const f=construct({stoolDates:dates})
    expect(f.screen?.fiber[0]).toMatchObject({
      pairedDays:12,pairedCalendarWeeks:4,qualifiedReviewWindows:1,
      maturity:'insufficient_separated_windows',
    })
    expect(evidence(f).find(x=>x.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('non-overlapping 14-day bins')
  })
  it('does not call distant bowel-report clusters continuous observations',()=>{
    const dates=[
      ...Array.from({length:6},(_,i)=>addCalendarDays('2026-08-20',i)),
      ...Array.from({length:6},(_,i)=>addCalendarDays('2026-09-20',i)),
    ]
    const f=construct({stoolDates:dates})
    expect(f.screen?.fiber[0]?.pairedDays).toBe(12)
    expect(f.screen?.fiber[0]?.qualifiedReviewWindows).toBe(2)
    expect(f.screen?.fiber[0]?.longestUnknownBowelStreakDays).toBeGreaterThan(7)
    expect(f.screen?.fiber[0]?.maturity).toBe('incomplete_bowel_diary')
    expect(evidence(f).find(x=>x.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('unknown dates are NOT confirmed no-movement days')
  })
  it('explicit zero-day logs count as observed continuity, never hard stools or outcome pairs',()=>{
    const dates=[
      ...Array.from({length:6},(_,i)=>addCalendarDays('2026-08-20',i)),
      ...Array.from({length:6},(_,i)=>addCalendarDays('2026-09-20',i)),
    ]
    const zeroDates=Array.from({length:25},(_,i)=>addCalendarDays('2026-08-26',i))
    const f=construct({stoolDates:dates,explicitZeroDates:zeroDates})
    expect(f.screen?.fiber[0]).toMatchObject({
      pairedDays:12,qualifiedReviewWindows:2,longestUnknownBowelStreakDays:0,
      activeSpanContinuityScreenPassed:true,maturity:'candidate_for_review',
    })
    expect(f.window.status).toBe('available')
    if(f.window.status==='available'){
      expect(f.window.explicitNoMovementDays).toBe(25)
      expect(f.window.typedEvents).toBe(12)
    }
    expect(evidence(f).find(x=>x.id==='digestive.pairing.coverage.fiber')?.text)
      .toContain('does NOT verify complete daily bowel tracking')
  })
  it('reports the selected range unknown-status count without pretending unlogged dates are zero',()=>{
    const f=construct()
    expect(f.screen?.fiber[0]?.maturity).toBe('candidate_for_review')
    expect(f.screen?.selectedRangeUnknownStatusDays).toBeGreaterThan(0)
    const item=evidence(f).find(x=>x.id==='digestive.pairing.coverage.fiber')
    expect(item?.coverage?.unknownBowelStatusDays).toBeGreaterThan(0)
    expect(item?.text).toContain('absence of a saved event cannot be interpreted as no movement')
  })
})
