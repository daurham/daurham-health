import {describe,expect,it} from 'vitest'
import type {ActivityDailyRow} from '../src/domain/activity/analytics.js'
import {buildActivityProgressView} from '../src/domain/activity/progress-view.js'
import {buildHealthIntelligenceSnapshot,routeHealthIntelligence,
  type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import {reconcileAskActivitySources,guardInconsistentActivityIntelligence}
  from '../src/domain/ask-health/activity-source-reconciliation.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',date='2026-10-15',timezone='America/Phoenix'
const row:ActivityDailyRow={
  date,timezone,stepsCount:5000,activeEnergyKcal:300,
  exerciseMinutes:42,restingHeartRateBpm:61,walkingRunningDistanceM:null,
}
const signals=[
  ['activity.steps','stepsCount','steps'],
  ['activity.active_energy_kcal','activeEnergyKcal','kcal'],
  ['activity.exercise_minutes','exerciseMinutes','min'],
  ['activity.resting_heart_rate_bpm','restingHeartRateBpm','bpm'],
] as const
const snapshot=(item:ActivityDailyRow=row,sourceIds=['source-1'])=>{
  const observations:IntelligenceObservation[]=signals.flatMap(([key,field,unit])=>{
    const v=item[field]
    return v==null?[]:[{
      key,date:item.date,value:v,unit,provenance:'device',sourceIds,
    }]
  })
  return buildHealthIntelligenceSnapshot({
    range:'30d',start,end:today,asOf:today,today,timezone,observations,
  })
}
const check=(rows:ActivityDailyRow[],snap=snapshot())=>
  reconcileAskActivitySources({rows,snapshot:snap,start,end:today,today})
const packet=(agreement:'verified'|'changed_or_unavailable',
  focused=false):ReturnType<typeof buildAskHealthEvidencePacket>=>{
  const snap=snapshot()
  const question=focused?'Why has my weight loss stalled?':'How many steps did I walk?'
  const intelligence=routeHealthIntelligence(snap,{question,lens:'general'})
  const focus=focused?focusWeightEnergyContext({
    question,snapshot:snap,today,
  }):null
  const input:AskHealthPacketInput={
    contextMode:'personalized',lens:'general',range:'30d',
    period:{start,end:today},asOf:today,healthToday:today,
    question,generatedAt:today+'T20:00:00Z',
    overview:null,activity:buildActivityProgressView([row],{
      range:'30d',asOf:today,today,timezone,
    }),sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],context:null,patterns:[],intelligence,
    focusedWeightEnergy:focus,activitySnapshotConsistency:agreement,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 zero-SQL Activity dual-read consistency',()=>{
  it('matches selected Activity records including an explicitly measured zero',()=>{
    expect(check([row])).toBe('verified')
    const zeros={...row,stepsCount:0}
    expect(check([zeros],snapshot(zeros))).toBe('verified')
    expect(check([],snapshot({...row,stepsCount:null,activeEnergyKcal:null,
      exerciseMinutes:null,restingHeartRateBpm:null})))
      .toBe('verified')
  })
  it('rejects corrected, missing or added Activity observations across read paths',()=>{
    for(const corrected of [
      {...row,stepsCount:5020},
      {...row,exerciseMinutes:41},
      {...row,restingHeartRateBpm:null},
      {...row,activeEnergyKcal:301},
    ])expect(check([corrected])).toBe('changed_or_unavailable')
    expect(check([])).toBe('changed_or_unavailable')
    expect(check([row],snapshot({...row,stepsCount:null})))
      .toBe('changed_or_unavailable')
  })
  it('fails on duplicate dates, unmatched timezone or unknown source identity',()=>{
    expect(check([row,row])).toBe('changed_or_unavailable')
    expect(check([{...row,timezone:'UTC'}])).toBe('changed_or_unavailable')
    expect(check([row],snapshot(row,[]))).toBe('changed_or_unavailable')
    expect(reconcileAskActivitySources({
      rows:[row],snapshot:snapshot(),start:'2026-09-30',end:today,today,
    })).toBe('changed_or_unavailable')
    expect(reconcileAskActivitySources({
      rows:[row],snapshot:snapshot(),start,end:'2026-10-17',today,
    })).toBe('changed_or_unavailable')
  })
  it('removes specific Activity relationship paths but keeps unrelated evidence',()=>{
    const snap=snapshot()
    const routed=routeHealthIntelligence(snap,{
      question:'sleep activity steps and bowel patterns',lens:'general',
    })
    const fakeRelations=[
      {id:'r.activity',xKey:'sleep.total_minutes',yKey:'activity.steps'},
      {id:'r.sleep',xKey:'sleep.total_minutes',yKey:'wellness.energy'},
    ]
    const full={...routed,relationships:fakeRelations,
      knows:[{key:'r.activity',label:'Steps link',detail:'private',
        confidence:'low',detailPath:'/progress/activity'},
        {key:'r.sleep',label:'Sleep link',detail:'sleep',
          confidence:'low',detailPath:'/progress/sleep'}],
    } as unknown as typeof routed
    const guarded=guardInconsistentActivityIntelligence(full,'changed_or_unavailable')!
    expect(guarded.coverage.some(item=>item.key.startsWith('activity.'))).toBe(false)
    expect(guarded.relationships.map(x=>x.id)).toEqual(['r.sleep'])
    expect(guarded.knows.map(x=>x.key)).toEqual(['r.sleep'])
    expect(guardInconsistentActivityIntelligence(full,'verified')).toBe(full)
  })
  it('withholds direct Activity and shared Activity packet claims and changes fingerprint',()=>{
    const conflicted=packet('changed_or_unavailable')
    const clear=packet('verified')
    expect(conflicted.evidence.find(x=>x.id==='activity.source_consistency'))
      .toMatchObject({substantive:false,value:null,
        coverage:{activitySourceAgreement:'changed_or_unavailable'}})
    expect(conflicted.evidence.some(x=>x.id==='activity.steps')).toBe(false)
    expect(conflicted.evidence.some(x=>x.id==='activity.today')).toBe(false)
    expect(conflicted.evidence.some(x=>x.id==='intelligence.coverage.activity.steps')).toBe(false)
    expect(clear.evidence.some(x=>x.id==='activity.steps')).toBe(true)
    expect(clear.evidence.some(x=>x.id==='intelligence.coverage.activity.steps')).toBe(true)
    expect(packetFingerprintMaterial(conflicted)).not.toBe(packetFingerprintMaterial(clear))
  })
  it('cannot bypass a mismatched Activity source through focused weight evidence',()=>{
    const conflicted=packet('changed_or_unavailable',true)
    expect(conflicted.evidence.some(x=>x.id==='weight_energy.observed_balance')).toBe(false)
    expect(conflicted.evidence.some(x=>x.id==='weight_energy.scale_context')).toBe(false)
    expect(conflicted.evidence.find(x=>x.id==='weight_energy.source_consistency'))
      .toMatchObject({substantive:false,
        coverage:{activitySnapshotConsistency:'changed_or_unavailable'}})
    expect(conflicted.evidence.some(x=>x.id==='intelligence.coverage.activity.steps')).toBe(false)
    expect(conflicted.contextSummary.knows).toEqual([])
  })
})
