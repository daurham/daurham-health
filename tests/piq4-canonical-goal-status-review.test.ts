import {describe,expect,it} from 'vitest'
import {reviewCanonicalSelectedGoal} from '../src/domain/ask-health/canonical-goal-status-review.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskGoalInput,AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import type {GoalRead} from '../server/ask-health/current-weight-goal.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import type {WeightGoalObservation} from '../src/domain/ask-health/weight-goal-observation.js'
import type {PrimaryWeightGoalPriority} from '../src/domain/ask-health/primary-weight-goal-intent.js'
import {reconcileWeightEnergyEvidence} from '../src/domain/ask-health/weight-energy-reconciliation.js'

const today='2026-10-16'
const id='11111111-1111-4111-8111-111111111111'
const version='22222222-2222-4222-8222-222222222222'
const settings:WeightEnergyCurrentSettings={
 state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0,
 weightGoalMode:'at_most',
}
const read:GoalRead={status:'available',rows:[{
 id,versionId:version,targetMode:'at_most',targetMinKg:null,targetMaxKg:80,
}]}
const picked:PrimaryWeightGoalPriority={state:'selected_active_weight_goal'}
const weighed:WeightGoalObservation={
 state:'all_recorded_above_boundary',comparableWeightDays:3,sampledSpanDays:10,
}
const status=(patch:Partial<AskGoalInput>={}):AskGoalInput=>({
 id,versionId:version,kind:'body_metric',lifecycle:'active',label:'Bodyweight',
 targetText:'At most 80 kg',targetState:'above_target',
 deadlineState:'future_no_projection',projectionState:null,projectionReason:null,...patch,
})
function review(overrides:Partial<Parameters<typeof reviewCanonicalSelectedGoal>[0]>={}){
 return reviewCanonicalSelectedGoal({
  asOf:today,today,settings,priority:picked,read,snapshots:[status()],
  observation:weighed,...overrides,
 })
}
function packet(state:ReturnType<typeof review>){
 const snap=buildHealthIntelligenceSnapshot({
   range:'30d',start:'2026-09-17',end:today,asOf:today,today,
   timezone:'America/Phoenix',observations:[],
 })
 const f=focusWeightEnergyContext({
   question:'Why is my weight loss stalled?',snapshot:snap,today,
 })
 expect(f).not.toBeNull()
 f!.currentSettings=settings
 f!.primaryGoalPriority=picked
 f!.weightGoalObservation=weighed
 f!.canonicalGoalStatus=state
 f!.reconciliation=reconcileWeightEnergyEvidence({
   asOf:today,today,settings,primaryGoal:picked,goalObservation:weighed,
   performance:f!.exercisePreservationReview,
   timing:f!.experimentTimingReview,outcomes:f!.experimentOutcomeReview,
   recentResults:f!.recentExperimentResultReview,
   proteinTraining:f!.proteinTrainingContext,canonicalGoal:state,
 })
 const input:AskHealthPacketInput={
  lens:'general',range:'30d',asOf:today,healthToday:today,
  period:{start:'2026-09-17',end:today},generatedAt:today+'T18:00:00Z',
  question:'Why is my weight loss stalled?',contextMode:'personalized',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
  supplements:[],context:null,patterns:[],focusedWeightEnergy:f,
 }
 return buildAskHealthEvidencePacket(input)
}

describe('PIQ-4.2 current selected Goal Control version and deadline review',()=>{
 it('permits a matched current canonical STATUS REPORT but no action or independently attested measurement',()=>{
  const r=review()
  expect(r).toEqual({
   state:'canonical_reported',targetReport:'above_target',
   deadlineAttention:'future_or_projection',measurementRevision:'not_attested',
   intervention:'not_authorized',
  })
  const p=packet(r)
  const entry=p.evidence.find(x=>x.id==='weight_energy.canonical_goal_status')
  expect(entry).toMatchObject({
   substantive:false,value:null,coverage:{
    canonicalGoalReview:'canonical_reported',
    reportedTargetState:'above_target',
    measurementRevision:'not_attested',intervention:'not_authorized',
   },
  })
  expect(entry?.text).toContain('not atomically versioned')
  expect(JSON.stringify(entry)).not.toContain(id)
  expect(JSON.stringify(entry)).not.toContain(version)
  expect(JSON.stringify(entry)).not.toContain('80 kg')
  expect(p.evidence.find(x=>x.id==='weight_energy.decision_boundary')?.text)
   .toContain('CANNOT classify an owner-specific weight-loss plateau')
 })
 it('rejects missing versions, mismatched goal IDs, stale and duplicate canonical snapshots',()=>{
  for(const snapshots of [
   [],[status({versionId:undefined})],[status({versionId:'stale-version'})],
   [status({id:'other-goal'})],[status(),status()],
   [status({lifecycle:'paused'})],[status({kind:'nutrition_protein'})],
  ]){
   expect(review({snapshots}).state).toBe('version_mismatch')
  }
  expect(review({read:{status:'available',rows:[]}}).state).toBe('unavailable')
  expect(review({read:{status:'available',rows:[read.rows[0]!,read.rows[0]!]}}).state)
   .toBe('unavailable')
  expect(review({read:{status:'unavailable',rows:[]}}).state).toBe('unavailable')
 })
 it('strictly respects owner priority, no inferred goal from explicit clear or missing source',()=>{
  for(const state of ['not_set','explicitly_cleared','selected_goal_not_active_weight'] as const){
   expect(review({priority:{state}})).toMatchObject({
    state:'primary_not_weight',targetReport:'withheld',
   })
  }
  expect(review({priority:{state:'unavailable'}}).state).toBe('unavailable')
  expect(review({settings:{...settings,state:'changed_during_read'}}).state)
   .toBe('unavailable')
  expect(review({settings:{...settings,weightGoalMode:'at_least'}}).state)
   .toBe('unavailable')
  expect(review({asOf:'2026-10-15'})).toMatchObject({
   state:'unavailable',targetReport:'withheld',
  })
 })
 it('never calls an overdue deadline unmet when Goal Control has no usable measurement',()=>{
  expect(review({snapshots:[status({
   targetState:'unknown',deadlineState:'passed_unmet',
  })]})).toMatchObject({
    state:'canonical_target_unknown',targetReport:'unknown',
    deadlineAttention:'past_missing_measurement',
  })
  expect(review({snapshots:[status({
   targetState:'unknown',deadlineState:'due_today',
  })]}).deadlineAttention).toBe('due_today_missing_measurement')
  expect(review({snapshots:[status({
   targetState:'above_target',deadlineState:'passed_unmet',
  })]}).deadlineAttention).toBe('past_reported_unmet')
  expect(review({snapshots:[status({
   targetState:'satisfied',deadlineState:'passed_satisfied',
  })],observation:{...weighed,state:'all_recorded_within_boundary'}})
   .deadlineAttention).toBe('past_reported_satisfied')
 })
 it('flags comparable-source disagreement without asserting Goal Control is incorrect',()=>{
  const conflict=review({snapshots:[status({targetState:'satisfied'})]})
  expect(conflict.state).toBe('measurement_disagreement')
  const entry=packet(conflict).evidence.find(x=>x.id==='weight_energy.canonical_goal_status')
  expect(entry?.text).toContain('disagree')
  expect(entry?.text).toContain('review measurement timing')
  expect(review({
    snapshots:[status({targetState:'above_target'})],
    observation:{...weighed,state:'all_recorded_within_boundary'},
  }).state).toBe('measurement_disagreement')
  expect(review({
    snapshots:[status({targetState:'satisfied'})],
    observation:{...weighed,state:'insufficient_comparable_weights'},
  }).state).toBe('canonical_reported')
  expect(review({snapshots:[status({targetState:'below_target'})]}).state)
    .toBe('unavailable')
 })
 it('integrates status uncertainty and conflict with existing non-authorizing cross-signal ordering',()=>{
  const r=review({snapshots:[status({versionId:'incorrect'})]})
  const p=packet(r)
  expect(p.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.coverage)
    .toMatchObject({reconciliationState:'goal_source_conflict',
      calorieAdjustment:'not_authorized'})
  expect(p.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.text)
    .toContain('NOT AUTHORIZED')
  const missing=packet(review({snapshots:[]}))
  const reported=packet(review())
  expect(packetFingerprintMaterial(reported)).not.toBe(packetFingerprintMaterial(missing))
  const due=packet(review({snapshots:[status({
   targetState:'unknown',deadlineState:'passed_unmet',
  })]}))
  expect(packetFingerprintMaterial(reported)).not.toBe(packetFingerprintMaterial(due))
 })
})
