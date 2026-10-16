import {describe,expect,it} from 'vitest'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {reconcileWeightEnergyEvidence} from '../src/domain/ask-health/weight-energy-reconciliation.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import type {FocusedWeightEnergyEvidence} from '../src/domain/ask-health/focused-weight-energy.js'

const today='2026-10-16'
const snap=buildHealthIntelligenceSnapshot({
  range:'30d',asOf:today,today,start:'2026-09-17',end:today,
  timezone:'America/Phoenix',observations:[],
})
function focus():FocusedWeightEnergyEvidence{
  const result=focusWeightEnergyContext({
    question:'Why is my weight loss stalled?',snapshot:snap,today,
  })
  expect(result).not.toBeNull()
  return result!
}
function wellKnown():FocusedWeightEnergyEvidence{
  const f=focus()
  f.currentSettings={state:'consistent_read',calorieTargetState:'configured',
    relevantExperimentCount:0,weightGoalMode:'at_most'}
  f.primaryGoalPriority={state:'selected_active_weight_goal'}
  f.weightGoalObservation={
    state:'all_recorded_above_boundary',comparableWeightDays:3,sampledSpanDays:10}
  f.exercisePreservationReview={
    state:'no_qualified_decline_flag',qualifiedRecentSeries:2,possibleDeclineExercises:0}
  f.experimentTimingReview={
    state:'none',activeWithinWindow:0,upcomingScheduled:0,activeOutsideOrUndated:0}
  f.experimentOutcomeReview={
    state:'none',directOutcomeExperiments:0,directOutcomesActiveNow:0,
    directOutcomesScheduledSoon:0,noDirectOutcomeExperiments:0,noDeclaredOutcomeExperiments:0}
  f.recentExperimentResultReview={
    state:'none_recent',recentFinalizations:0,interpretableDirectMetricResults:0,
    interpretableOtherResults:0,limitedOrInconclusiveResults:0,invalidatedResults:0}
  f.proteinTrainingContext={...f.proteinTrainingContext,
    proteinCoverage:'descriptive_window',verifiedProteinDays:7}
  return f
}
function reconcile(f:FocusedWeightEnergyEvidence,asOf=today){
  return reconcileWeightEnergyEvidence({
    asOf,today,settings:f.currentSettings,goalObservation:f.weightGoalObservation,
    primaryGoal:f.primaryGoalPriority,performance:f.exercisePreservationReview,
    timing:f.experimentTimingReview,outcomes:f.experimentOutcomeReview,
    recentResults:f.recentExperimentResultReview,proteinTraining:f.proteinTrainingContext,
  })
}
function packet(f:FocusedWeightEnergyEvidence){
  f.reconciliation=reconcile(f)
  const input:AskHealthPacketInput={
    question:'Why is my weight loss stalled?',contextMode:'personalized',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start:'2026-09-17',end:today},generatedAt:today+'T19:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
    supplements:[],context:null,patterns:[],focusedWeightEnergy:f,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 cross-signal reconciliation remains read-only',()=>{
  it('never authorizes calorie changes, plateau or strength preservation even with aligned signals',()=>{
    const r=reconcile(wellKnown())
    expect(r).toMatchObject({
      state:'descriptive_only',calorieAdjustment:'not_authorized',
      plateauClassification:'not_authorized',strengthPreservation:'not_verified',
    })
    expect(r.reasons).toEqual(expect.arrayContaining([
      'goal_status_not_verified','strength_preservation_not_verified',
      'calorie_adequacy_not_verified',
    ]))
    expect(r.reasons).not.toContain('performance_decline_attention')
  })
  it('flags an identity contradiction between explicitly selected primary goal and active goal source',()=>{
    const f=wellKnown()
    f.currentSettings.weightGoalMode='none'
    f.weightGoalObservation={state:'no_active_goal',comparableWeightDays:null,sampledSpanDays:null}
    const r=reconcile(f)
    expect(r.state).toBe('goal_source_conflict')
    expect(r.reasons).toContain('current_goal_sources_conflict')
    expect(r.calorieAdjustment).toBe('not_authorized')
  })
  it('respects owner explicitly cleared or non-weight priority over inferred weight loss',()=>{
    for(const state of ['explicitly_cleared','not_set','selected_goal_not_active_weight'] as const){
      const f=wellKnown()
      f.primaryGoalPriority={state}
      const r=reconcile(f)
      expect(r.state).toBe('primary_not_weight')
      expect(r.reasons).toContain('weight_not_selected_primary')
    }
  })
  it('prioritizes possible decline over experiment activity without treating no-decline as strength proof',()=>{
    const f=wellKnown()
    f.exercisePreservationReview={
      state:'possible_decline_for_review',qualifiedRecentSeries:3,possibleDeclineExercises:1}
    f.experimentTimingReview={
      state:'active_now',activeWithinWindow:1,upcomingScheduled:0,activeOutsideOrUndated:0}
    const result=reconcile(f)
    expect(result.state).toBe('performance_attention')
    expect(result.reasons).toContain('performance_decline_attention')
    expect(result.reasons).toContain('experiment_timing_attention')
    expect(result.strengthPreservation).toBe('not_verified')
  })
  it('never links a recent direct outcome to the present goal or infers effect size',()=>{
    const f=wellKnown()
    f.recentExperimentResultReview={
      state:'recent_direct_observation',recentFinalizations:1,
      interpretableDirectMetricResults:1,interpretableOtherResults:0,
      limitedOrInconclusiveResults:0,invalidatedResults:0}
    const r=reconcile(f)
    expect(r.state).toBe('experiment_review')
    expect(r.reasons).toContain('recent_result_not_linked_to_current_goal')
    expect(r.calorieAdjustment).toBe('not_authorized')
  })
  it('unavailable or changing sources never mean no experiments, good goal status, or adequate recovery',()=>{
    const f=wellKnown()
    f.currentSettings={state:'changed_during_read',calorieTargetState:'unknown',
      relevantExperimentCount:null}
    f.experimentTimingReview={
      state:'unavailable',activeWithinWindow:null,upcomingScheduled:null,
      activeOutsideOrUndated:null}
    expect(reconcile(f)).toMatchObject({
      state:'source_inconsistent',calorieAdjustment:'not_authorized',
    })
    const g=wellKnown()
    g.experimentOutcomeReview={...g.experimentOutcomeReview,
      state:'unavailable',directOutcomeExperiments:null}
    expect(reconcile(g).state).toBe('source_inconsistent')
    const h=wellKnown()
    h.proteinTrainingContext={...h.proteinTrainingContext,
      proteinCoverage:'insufficient_or_unverified'}
    expect(reconcile(h).reasons).toContain('protein_record_coverage_unverified')
    expect(reconcile(wellKnown(),'2026-10-15')).toMatchObject({
      state:'source_inconsistent',calorieAdjustment:'not_authorized'})
    expect(reconcile(focus()).state).toBe('not_checked')
  })
  it('publishes only neutral reason codes, without raw owner IDs or numeric calorie suggestions',()=>{
    const a=packet(wellKnown())
    const item=a.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')
    expect(item).toMatchObject({substantive:false,value:null,
      coverage:{reconciliationState:'descriptive_only',calorieAdjustment:'not_authorized'}})
    expect(item?.text).toContain('NOT AUTHORIZED')
    expect(item?.text).not.toMatch(/reduce by [0-9]|cut [0-9]|kcal\/day/)
    expect(JSON.stringify(item)).not.toContain('11111111-1111')
    const b=wellKnown()
    b.primaryGoalPriority={state:'explicitly_cleared'}
    expect(packetFingerprintMaterial(a)).not.toBe(packetFingerprintMaterial(packet(b)))
    const decision=a.evidence.find(x=>x.id==='weight_energy.decision_boundary')
    expect(decision?.coverage).toMatchObject({crossSignalReconciliation:'descriptive_only',
      calorieChangeAuthorization:'not_authorized'})
  })
})
