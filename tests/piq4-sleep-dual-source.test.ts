import {describe,expect,it} from 'vitest'
import type {SleepNightlySummary} from '../src/domain/sleep/summarize.js'
import {buildSleepProgressView} from '../src/domain/sleep/progress-view.js'
import {
  buildHealthIntelligenceSnapshot,routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import {
  reconcileAskSleepSources,guardInconsistentSleepIntelligence,
} from '../src/domain/ask-health/sleep-source-reconciliation.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',day='2026-10-15',timezone='America/Phoenix'
const night:SleepNightlySummary={
  sleepDate:day,timezone,logicalSourceKey:'watch:sleep',
  sourceName:'Watch',startAt:'2026-10-15T05:00:00.000Z',
  endAt:'2026-10-15T12:00:00.000Z',totalSleepMinutes:400,
  timeInBedMinutes:420,awakeMinutes:20,coreMinutes:230,
  deepMinutes:80,remMinutes:90,unspecifiedSleepMinutes:0,
  stageCoveragePct:100,stageConflictMinutes:0,
  observationStatus:'complete',analysisEligible:true,
  stageAnalysisEligible:true,selectionReason:'source_priority',
  calculationVersion:'test-v1',evidence:{} as SleepNightlySummary['evidence'],
}
const snapshot=(value:number|null=400,sourceIds=['sleep-summary-1'],
  additional:IntelligenceObservation[]=[])=>
  buildHealthIntelligenceSnapshot({
    range:'30d',start,end:today,asOf:today,today,timezone,
    observations:[
      ...(value===null?[]:[{
        key:'sleep.total_minutes' as const,date:day,value,unit:'min',
        provenance:'device' as const,sourceIds,
      }]),...additional,
    ],
  })
const check=(nights:SleepNightlySummary[],s=snapshot())=>
  reconcileAskSleepSources({nights,snapshot:s,start,end:today,today})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const snap=snapshot()
  const intelligence=routeHealthIntelligence(snap,{
    question:'How was my sleep duration and recovery?',lens:'general',
  })
  const input:AskHealthPacketInput={
    question:'How was my sleep duration and recovery?',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start,end:today},generatedAt:today+'T19:00:00Z',
    contextMode:'personalized',overview:null,activity:null,
    sleep:buildSleepProgressView([night],{
      range:'30d',asOf:today,timezone,
    }),sleepSnapshotConsistency:status,
    goals:[],experiments:[],benchmarks:[],supplements:[],
    context:null,patterns:[],intelligence,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 generic Sleep two-source quality screen',()=>{
  it('agrees on equal eligible duration and on no eligible sleep, without inventing zero',()=>{
    expect(check([night])).toBe('verified')
    expect(check([],snapshot(null))).toBe('verified')
    expect(check([{...night,analysisEligible:false,observationStatus:'partial_observation'}],
      snapshot(null))).toBe('verified')
    expect(check([{...night,totalSleepMinutes:0}],snapshot(0))).toBe('verified')
  })
  it('rejects changed duration, partial/eligibility corrections or missing nights',()=>{
    expect(check([{...night,totalSleepMinutes:390}])).toBe('changed_or_unavailable')
    expect(check([{...night,analysisEligible:false}])).toBe('changed_or_unavailable')
    expect(check([{...night,observationStatus:'partial_observation'}]))
      .toBe('changed_or_unavailable')
    expect(check([])).toBe('changed_or_unavailable')
    expect(check([night],snapshot(null))).toBe('changed_or_unavailable')
    expect(check([night],snapshot(400,[]))).toBe('changed_or_unavailable')
  })
  it('fails for wrong timezone, duplicate date or incompatible date range',()=>{
    expect(check([night,night])).toBe('changed_or_unavailable')
    expect(check([{...night,timezone:'UTC'}])).toBe('changed_or_unavailable')
    expect(reconcileAskSleepSources({
      nights:[night],snapshot:snapshot(),start:'2026-09-30',end:today,today,
    })).toBe('changed_or_unavailable')
    expect(reconcileAskSleepSources({
      nights:[night],snapshot:snapshot(),start,end:'2026-10-17',today,
    })).toBe('changed_or_unavailable')
  })
  it('drops relations involving Sleep but keeps unrelated independent information',()=>{
    const intelligence=routeHealthIntelligence(snapshot(),{
      question:'sleep, training and activity',lens:'general',
    })
    const prepared={...intelligence,
      relationships:[
        {id:'sleep:activity',xKey:'sleep.total_minutes',yKey:'activity.steps'},
        {id:'wellness:activity',xKey:'wellness.energy',yKey:'activity.steps'},
      ],
      knows:[
        {key:'sleep:activity',label:'Sleep correlation',detail:'private',
          confidence:'low',detailPath:'/progress/sleep'},
        {key:'wellness:activity',label:'Independent',detail:'independent',
          confidence:'low',detailPath:'/progress/activity'},
      ],
    } as unknown as typeof intelligence
    const guarded=guardInconsistentSleepIntelligence(prepared,'changed_or_unavailable')!
    expect(guarded.relationships.map(r=>r.id)).toEqual(['wellness:activity'])
    expect(guarded.knows.map(r=>r.key)).toEqual(['wellness:activity'])
    expect(guarded.coverage.some(r=>r.key==='sleep.total_minutes')).toBe(false)
    expect(guardInconsistentSleepIntelligence(prepared,'verified')).toBe(prepared)
  })
  it('suppresses generic Sleep, shared intelligence and changes packet fingerprint',()=>{
    const bad=packet('changed_or_unavailable')
    const good=packet('verified')
    expect(bad.evidence.find(x=>x.id==='sleep.source_consistency'))
      .toMatchObject({substantive:false,value:null,
        coverage:{sleepSourceAgreement:'changed_or_unavailable'}})
    expect(bad.evidence.some(x=>x.id.startsWith('sleep.')&&
      x.id!=='sleep.source_consistency')).toBe(false)
    expect(bad.evidence.some(x=>x.id==='intelligence.coverage.sleep.total_minutes'))
      .toBe(false)
    expect(good.evidence.some(x=>x.id==='sleep.duration')).toBe(true)
    expect(good.evidence.some(x=>x.id==='intelligence.coverage.sleep.total_minutes'))
      .toBe(true)
    expect(packetFingerprintMaterial(bad)).not.toBe(packetFingerprintMaterial(good))
  })
})
