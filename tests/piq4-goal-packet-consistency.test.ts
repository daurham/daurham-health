import {describe,expect,it} from 'vitest'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskGoalInput} from '../src/domain/ask-health/types.js'
import type {CanonicalGoalStatusReview} from '../src/domain/ask-health/canonical-goal-status-review.js'

const day='2026-10-16'
const weightId='11111111-1111-4111-8111-111111111111'
const fatId='22222222-2222-4222-8222-222222222222'
const proteinId='33333333-3333-4333-8333-333333333333'
const goal=(id:string,kind:AskGoalInput['kind'],label:string):AskGoalInput=>({
  id,kind,lifecycle:'active',versionId:'current-version',label,
  targetText:'Private goal target 177.7',targetState:'above_target',
  deadlineState:'projected_before_deadline',projectionState:'available',
  projectionReason:null,
})
const goals:AskGoalInput[]=[
  goal(weightId,'body_metric','Bodyweight'),
  goal(fatId,'body_metric','Body fat percentage'),
  goal(proteinId,'nutrition_protein','Protein'),
]
function generate(input:{
  selected:string|null;state:CanonicalGoalStatusReview['state'];withFocus?:boolean
}){
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',start:'2026-09-17',end:day,asOf:day,today:day,
    timezone:'America/Phoenix',observations:[],
  })
  const focus=input.withFocus===false?null:focusWeightEnergyContext({
    question:'Is my current weight goal on track?',snapshot,today:day,
  })!
  if(focus){
    focus.selectedWeightGoalId=input.selected
    focus.canonicalGoalStatus={
      state:input.state,targetReport:input.state==='canonical_reported'?
        'above_target':'withheld',
      deadlineAttention:input.state==='canonical_reported'?
        'future_or_projection':'withheld',
      measurementRevision:'latest_point_rechecked',
      projectionRevision:'complete_series_rechecked',
      intervention:'not_authorized',
    }
  }
  return buildAskHealthEvidencePacket({
    lens:'general',range:'30d',asOf:day,healthToday:day,
    period:{start:'2026-09-17',end:day},
    generatedAt:day+'T22:00:00Z',
    question:'Is my current weight goal on track?',
    contextMode:'personalized',overview:null,activity:null,sleep:null,
    goals,experiments:[],benchmarks:[],supplements:[],context:null,
    patterns:[],focusedWeightEnergy:focus,
  })
}
describe('PIQ-4.2 generic Goals cannot bypass canonical weight goal screen',()=>{
  it('excludes the privately selected goal after projected history fails',()=>{
    const packet=generate({selected:weightId,state:'projection_quality_limited'})
    const ids=packet.evidence.map(e=>e.id)
    expect(ids).not.toContain('goals.'+weightId)
    expect(ids).toContain('goals.'+fatId)
    expect(ids).toContain('goals.'+proteinId)
    expect(packet.evidence.find(e=>e.id==='weight_energy.canonical_goal_status'))
      .toMatchObject({substantive:false,coverage:{
        canonicalGoalReview:'projection_quality_limited',reportedTargetState:'withheld'}})
    const serialized=JSON.stringify(packet.evidence)
    expect(serialized).not.toContain(weightId)
  })
  it('cannot leak any body-metric goal when selection identity is unknown',()=>{
    for(const state of ['version_mismatch','projection_source_unavailable',
      'measurement_disagreement','unavailable'] as const){
      const packet=generate({selected:null,state})
      expect(packet.evidence.some(e=>e.id==='goals.'+weightId)).toBe(false)
      expect(packet.evidence.some(e=>e.id==='goals.'+fatId)).toBe(false)
      expect(packet.evidence.some(e=>e.id==='goals.'+proteinId)).toBe(true)
    }
  })
  it('retains normal Goals for verified current reads and unrelated questions',()=>{
    const matched=generate({selected:weightId,state:'canonical_reported'})
    expect(matched.evidence.some(e=>e.id==='goals.'+weightId)).toBe(true)
    const noFocus=generate({selected:null,state:'not_checked',withFocus:false})
    expect(noFocus.evidence.some(e=>e.id==='goals.'+weightId)).toBe(true)
    const limited=generate({selected:weightId,state:'projection_quality_limited'})
    expect(packetFingerprintMaterial(matched))
      .not.toEqual(packetFingerprintMaterial(limited))
  })
})
