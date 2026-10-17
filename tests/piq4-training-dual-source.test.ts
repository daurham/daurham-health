import {describe,expect,it} from 'vitest'
import {
  buildHealthIntelligenceSnapshot,routeHealthIntelligence,
} from '../src/domain/intelligence/shared.js'
import type {ProgressWorkoutSummary} from '../src/domain/progress/types.js'
import {
  reconcileAskTrainingSources,guardInconsistentTrainingIntelligence,
} from '../src/domain/ask-health/training-source-reconciliation.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',day='2026-10-15'
const timezone='America/Phoenix'
const workout:ProgressWorkoutSummary={
  sessionId:'session-a',sessionDate:day,createdAt:day+'T12:00:00Z',
  effort:3,durationMin:45,
}
const snapshot=(ids=['session-a'],count=1,effort=3)=>buildHealthIntelligenceSnapshot({
  range:'30d',start,end:today,asOf:today,today,timezone,
  observations:[
    {key:'training.sessions',date:day,value:count,unit:'sessions',
      provenance:'owner',sourceIds:ids},
    {key:'training.effort',date:day,value:effort,unit:'1–5',
      provenance:'owner',sourceIds:ids},
  ],
})
const check=(workouts:ProgressWorkoutSummary[],s=snapshot())=>
  reconcileAskTrainingSources({workouts,snapshot:s,start,end:today,today})
const packet=(status:'verified'|'changed_or_unavailable')=>{
  const intelligence=routeHealthIntelligence(snapshot(),{
    question:'How many training sessions and how was my strength?',
    lens:'training',
  })
  const input:AskHealthPacketInput={
    question:'How many training sessions and how was my strength?',
    lens:'training',range:'30d',asOf:today,healthToday:today,
    period:{start,end:today},generatedAt:today+'T19:00:00Z',
    contextMode:'personalized',activity:null,sleep:null,
    overview:{training:{workouts:{status:'available',value:{count:1}},
      sessions:[workout],consistency:{status:'insufficient_data'}},
      exercises:[]} as unknown as AskHealthPacketInput['overview'],
    trainingSnapshotConsistency:status,
    goals:[],experiments:[],benchmarks:[],supplements:[],
    context:null,patterns:[],intelligence,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 Training two-source session quality',()=>{
  it('agrees on identified sessions, effort and completed-day derived zero',()=>{
    expect(check([workout])).toBe('verified')
    const empty=buildHealthIntelligenceSnapshot({
      range:'30d',start,end:today,asOf:today,today,timezone,observations:[],
    })
    expect(check([],empty)).toBe('verified')
  })
  it('rejects session replacement, same-ID effort edits and changed dates',()=>{
    expect(check([])).toBe('changed_or_unavailable')
    expect(check([{...workout,sessionId:'session-b'}]))
      .toBe('changed_or_unavailable')
    expect(check([{...workout,effort:4}])).toBe('changed_or_unavailable')
    expect(check([{...workout,sessionDate:'2026-10-14'}]))
      .toBe('changed_or_unavailable')
    expect(check([workout,workout])).toBe('changed_or_unavailable')
    expect(check([workout],snapshot([]))).toBe('changed_or_unavailable')
    expect(check([workout],snapshot(['session-a'],2))).toBe('changed_or_unavailable')
  })
  it('rejects malformed effort and incompatible date scope',()=>{
    expect(check([{...workout,effort:9}])).toBe('changed_or_unavailable')
    expect(check([{...workout,effort:2.5}])).toBe('changed_or_unavailable')
    expect(reconcileAskTrainingSources({
      workouts:[workout],snapshot:snapshot(),
      start:'2026-09-30',end:today,today,
    })).toBe('changed_or_unavailable')
    expect(reconcileAskTrainingSources({
      workouts:[workout],snapshot:snapshot(),start,end:'2026-10-17',today,
    })).toBe('changed_or_unavailable')
  })
  it('drops whole Training relationships, preserves independent sleep/activity',()=>{
    const routed=routeHealthIntelligence(snapshot(),{
      question:'training and sleep',lens:'general',
    })
    const prepared={...routed,relationships:[
      {id:'sleep-training',xKey:'sleep.total_minutes',yKey:'training.sessions'},
      {id:'sleep-activity',xKey:'sleep.total_minutes',yKey:'activity.steps'},
    ],knows:[
      {key:'sleep-training',label:'Related',detail:'private',confidence:'limited',detailPath:null},
      {key:'sleep-activity',label:'Independent',detail:'unrelated',confidence:'limited',detailPath:null},
    ]} as unknown as typeof routed
    const filtered=guardInconsistentTrainingIntelligence(prepared,'changed_or_unavailable')!
    expect(filtered.relationships.map(x=>x.id)).toEqual(['sleep-activity'])
    expect(filtered.knows.map(x=>x.key)).toEqual(['sleep-activity'])
    expect(filtered.coverage.some(x=>x.key.startsWith('training.'))).toBe(false)
    expect(guardInconsistentTrainingIntelligence(prepared,'verified')).toBe(prepared)
  })
  it('suppresses direct and shared Training and changes the packet fingerprint',()=>{
    const bad=packet('changed_or_unavailable')
    const good=packet('verified')
    expect(bad.evidence.find(x=>x.id==='training.source_consistency'))
      .toMatchObject({substantive:false,value:null})
    expect(bad.evidence.some(x=>x.id.startsWith('training.')&&
      x.id!=='training.source_consistency')).toBe(false)
    expect(bad.evidence.some(x=>x.id==='intelligence.coverage.training.sessions'))
      .toBe(false)
    expect(good.evidence.some(x=>x.id==='training.sessions')).toBe(true)
    expect(packetFingerprintMaterial(bad)).not.toBe(packetFingerprintMaterial(good))
  })
})
