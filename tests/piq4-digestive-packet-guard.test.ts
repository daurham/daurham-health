import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, routeHealthIntelligence, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusDigestiveContext } from '../src/domain/ask-health/focused-digestive.js'
import { digestivePacketGuard, guardedDigestiveIntelligence } from '../src/domain/ask-health/digestive-packet-guard.js'
import { buildAskHealthEvidencePacket, packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const asOf='2026-10-16',start='2026-09-01'
const observations: IntelligenceObservation[] = [
  {key:'nutrition.calories',date:'2026-10-10',value:1800,unit:'kcal',provenance:'owner',
    quality:'high_confidence',sourceIds:['f1']},
  {key:'nutrition.fiber_g',date:'2026-10-10',value:20,unit:'g',provenance:'owner',
    quality:'high_confidence',sourceIds:['f1']},
  {key:'hydration.ml',date:'2026-10-10',value:700,unit:'ml',provenance:'owner',sourceIds:['w1']},
  {key:'bowel.count',date:'2026-10-10',value:1,unit:'count',provenance:'owner',sourceIds:['b1']},
  {key:'sleep.total_minutes',date:'2026-10-10',value:450,unit:'min',provenance:'device',sourceIds:['s1']},
]
const snapshot=buildHealthIntelligenceSnapshot({range:'90d',start,end:asOf,asOf,
  timezone:'America/Phoenix',today:asOf,observations,
  nutritionVerifiedCompleteDates:new Set(['2026-10-10']),
  nutritionVerificationStatus:'available'})
const question='Did my hard stools come from fiber or water?'

function input(q=question,conflict=false,invalidBowel=false):AskHealthPacketInput {
  const focus=focusDigestiveContext({question:q,snapshot,today:asOf,includeBroadContext:true})!
  const routed=routeHealthIntelligence(snapshot,{question:q,lens:'general',wide:true})
  // Create synthetic available relationships with deliberately distinctive
  // unsupported rho, so filtering cannot pass by accident.
  const base={
    sampleSize:16,requiredSampleSize:10,rho:0.85,
    direction:'positive' as const,strength:'strong' as const,
    state:'available' as const,confidence:'high' as const,
    evidenceDates:[{xDate:'2026-10-09',yDate:'2026-10-10'}],
    summary:'Synthetic relationship not a personal stool type result',
    detailPaths:['/progress'],
  }
  const relations=[
    { ...base,id:'shared:fiber:bowel:same_day',xKey:'nutrition.fiber_g' as const,
      yKey:'bowel.count' as const,lagDays:0 },
    { ...base,id:'shared:hydration:bowel:next_day',xKey:'hydration.ml' as const,
      yKey:'bowel.count' as const,lagDays:1 },
    { ...base,id:'shared:sleep:steps',xKey:'sleep.total_minutes' as const,
      yKey:'activity.steps' as const,lagDays:0 },
  ]
  return {
    question:q,lens:'general',range:'90d',asOf,period:{start,end:asOf},
    generatedAt:asOf+'T18:00:00Z',contextMode:'deep',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],patterns:[],context:null,
    focusedDigestive:{
      ...focus,
      ...(conflict?{digestiveConsistencyIssue:'changed_or_unavailable' as const}:{}),
      ...(invalidBowel?{bowelWindow:{
        status:'unavailable' as const,reason:'source_mismatch' as const,
        scope:{start,end:asOf,calendarDays:46},
      }}:{}),
    },
    intelligence:{
      ...routed,relationships:relations,
      knows:[
        {key:'nutrition.fiber_g',label:'Fiber',detail:'Stale fiber source',confidence:'high',detailPath:'/nutrition'},
        {key:'shared:fiber:bowel:same_day',label:'Fiber relation',detail:'Stale relationship',confidence:'high',detailPath:'/progress'},
        {key:'sleep.total_minutes',label:'Sleep',detail:'Unaffected sleep',confidence:'high',detailPath:'/sleep'},
      ],
      missing:[],
    },
  }
}
describe('PIQ-4.1 whole-packet digestive evidence invalidation',()=>{
  it('safely suppresses old fiber, water and bowel intelligence after source conflict',()=>{
    const data=input(question,true)
    const guard=digestivePacketGuard(data)
    expect(guard).toMatchObject({crossSourceConflict:true,stoolTypeQuestion:true})
    const intel=guardedDigestiveIntelligence(data.intelligence,guard)!
    expect(intel.relationships.map(x=>x.id)).toEqual(['shared:sleep:steps'])
    expect(intel.coverage.some(x=>['nutrition.fiber_g','hydration.ml','bowel.count'].includes(x.key)))
      .toBe(false)
    expect(intel.knows.map(x=>x.key)).toEqual(['sleep.total_minutes'])
    const packet=buildAskHealthEvidencePacket(data)
    const ids=packet.evidence.map(e=>e.id)
    expect(ids).toContain('digestive.source_consistency.unavailable')
    expect(ids.some(id=>id.startsWith('digestive.focus.fiber.')||id.startsWith('digestive.focus.hydration.'))).toBe(false)
    expect(ids.some(id=>id.startsWith('intelligence.relationship.shared:fiber:bowel') ||
      id.startsWith('intelligence.relationship.shared:hydration:bowel'))).toBe(false)
    expect(ids).toContain('intelligence.relationship.shared:sleep:steps')
    expect(packet.contextSummary.knows.map(x=>x.key)).toEqual(['sleep.total_minutes'])
    expect(packetFingerprintMaterial(packet)).not.toContain('Stale fiber source')
  })
  it('blocks bowel-frequency correlations for stool-consistency prompts, even if inputs match',()=>{
    const data=input()
    const guard=digestivePacketGuard(data)
    expect(guard).toMatchObject({crossSourceConflict:false,stoolTypeQuestion:true})
    const intel=guardedDigestiveIntelligence(data.intelligence,guard)!
    expect(intel.relationships.map(x=>x.id)).toEqual(['shared:sleep:steps'])
    expect(intel.coverage.some(x=>x.key==='nutrition.fiber_g')).toBe(true)
  })
  it('preserves legitimate bowel-frequency relationships for explicit frequency questions',()=>{
    const data=input('How often did I record bowel movements?',false)
    const guard=digestivePacketGuard(data)
    expect(guard.stoolTypeQuestion).toBe(false)
    const intel=guardedDigestiveIntelligence(data.intelligence,guard)!
    expect(intel.relationships).toHaveLength(3)
  })
  it('suppresses obsolete bowel samples after failed ID+date verification',()=>{
    const data=input(question,false,true)
    const guard=digestivePacketGuard(data)
    expect(guard.bowelIdentityConflict).toBe(true)
    const packet=buildAskHealthEvidencePacket(data)
    const ids=packet.evidence.map(x=>x.id)
    expect(ids).toContain('digestive.window.unavailable')
    expect(ids.some(id=>id.startsWith('digestive.focus.bowel.') ||
      id==='digestive.screen.sampled_bristol'||
      id.startsWith('intelligence.relationship.shared:fiber:bowel'))).toBe(false)
    expect(ids.some(id=>id.startsWith('intelligence.baseline.bowel.count'))).toBe(false)
  })
  it('does not hide unrelated intelligence if there is no digest issue',()=>{
    const data=input('How did my sleep relate to steps?')
    const intel=guardedDigestiveIntelligence(data.intelligence,digestivePacketGuard(data))!
    expect(intel.relationships).toHaveLength(3)
    expect(intel.coverage.some(x=>x.key==='sleep.total_minutes')).toBe(true)
  })
})
