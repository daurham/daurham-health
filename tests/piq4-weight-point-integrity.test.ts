import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {loadBodyGoalPointAsOf,BODY_GOAL_AS_OF_SQL} from '../server/goals/as-of-point-evidence.js'
import {readCurrentWeightPointSource} from '../server/ask-health/current-weight-point-source.js'
import {reviewCanonicalSelectedGoal} from '../src/domain/ask-health/canonical-goal-status-review.js'
import {reconcileWeightEnergyEvidence} from '../src/domain/ask-health/weight-energy-reconciliation.js'
import type {AskGoalInput} from '../src/domain/ask-health/types.js'
import type {GoalRead} from '../server/ask-health/current-weight-goal.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const day='2026-10-16'
const tz='America/Phoenix'
const id='11111111-1111-4111-8111-111111111111'
const version='22222222-2222-4222-8222-222222222222'
const raw={
 metric_id:'33333333-3333-4333-8333-333333333333',
 session_id:'44444444-4444-4444-8444-444444444444',
 metric_updated_at:'2026-10-15T16:00:00.000Z',
 session_updated_at:'2026-10-15T16:00:00.000Z',
 measured_at:'2026-10-15T15:00:00.000Z',
 timezone:tz,
 value:'84.50',unit:'kg',comparability:'usual',
}
const db=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql&{
 query:ReturnType<typeof vi.fn>
})
const settings:WeightEnergyCurrentSettings={
 state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0,
 weightGoalMode:'at_most',
}
const read:GoalRead={status:'available',rows:[{
 id,versionId:version,targetMode:'at_most',targetMinKg:null,targetMaxKg:80,
}]}
const goal=(rev:string|null,targetState:AskGoalInput['targetState']='above_target'):
 AskGoalInput=>({
 id,versionId:version,kind:'body_metric',lifecycle:'active',label:'Bodyweight',
 targetText:'at most 80 kg',targetState,deadlineState:'future_no_projection',
 projectionState:null,projectionReason:null,bodyWeightSourceRevision:rev,
})
function review(source:Awaited<ReturnType<typeof readCurrentWeightPointSource>>,
 rev:string|null,targetState:AskGoalInput['targetState']='above_target'){
 return reviewCanonicalSelectedGoal({
  asOf:day,today:day,settings,priority:{state:'selected_active_weight_goal'},
  read,snapshots:[goal(rev,targetState)],sourceRead:source,
  observation:{state:'all_recorded_above_boundary',comparableWeightDays:3,sampledSpanDays:10},
 })
}
function packet(result:ReturnType<typeof review>){
 const snapshot=buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-09-17',end:day,asOf:day,today:day,
  timezone:tz,observations:[],
 })
 const focus=focusWeightEnergyContext({question:'Why did my weight loss stall?',snapshot,today:day})
 expect(focus).not.toBeNull()
 focus!.currentSettings=settings
 focus!.canonicalGoalStatus=result
 focus!.primaryGoalPriority={state:'selected_active_weight_goal'}
 focus!.reconciliation=reconcileWeightEnergyEvidence({
  asOf:day,today:day,settings,canonicalGoal:result,
  primaryGoal:focus!.primaryGoalPriority,
  goalObservation:focus!.weightGoalObservation,
  performance:focus!.exercisePreservationReview,
  timing:focus!.experimentTimingReview,
  outcomes:focus!.experimentOutcomeReview,
  recentResults:focus!.recentExperimentResultReview,
  proteinTraining:focus!.proteinTrainingContext,
 })
 const input:AskHealthPacketInput={
  question:'Why did my weight loss stall?',contextMode:'personalized',
  lens:'general',range:'30d',asOf:day,healthToday:day,
  period:{start:'2026-09-17',end:day},generatedAt:day+'T21:00:00Z',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
  supplements:[],context:null,patterns:[],focusedWeightEnergy:focus,
 }
 return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 latest canonical weight point identity recheck',()=>{
 it('uses the same as-of point query as Goal Control including source identity and update times',async()=>{
  const sql=db([raw])
  const point=await loadBodyGoalPointAsOf(sql,'weight',tz,day)
  expect(point).toMatchObject({value:84.5,unit:'kg',observedOn:'2026-10-15',
    comparability:'usual'})
  expect(point?.sourceRevision).toMatch(/^[0-9a-f]{64}$/)
  expect(BODY_GOAL_AS_OF_SQL).toContain("metrics.metric_key = $1")
  expect(BODY_GOAL_AS_OF_SQL).toContain("LIMIT 1")
  expect(BODY_GOAL_AS_OF_SQL).toContain("metrics.updated_at::text")
  expect(BODY_GOAL_AS_OF_SQL).toContain("sessions.updated_at::text")
  expect(BODY_GOAL_AS_OF_SQL).toContain('sessions.comparability')
  expect(BODY_GOAL_AS_OF_SQL).toContain("sessions.measured_at AT TIME ZONE")
  expect(sql.query).toHaveBeenCalledWith(BODY_GOAL_AS_OF_SQL,['weight',tz,day])
  const checked=await readCurrentWeightPointSource(day,tz,db([raw]))
  expect(checked).toMatchObject({
   status:'available',hasPoint:true,revision:point?.sourceRevision,
   comparability:'usual',
  })
  expect(review(checked,point!.sourceRevision!)).toMatchObject({
   state:'canonical_reported',targetReport:'above_target',
   measurementRevision:'latest_point_rechecked',intervention:'not_authorized',
  })
 })
 it('detects update time changes, even if the raw weight value stays the same',async()=>{
  const old=(await readCurrentWeightPointSource(day,tz,db([raw])))
  expect(old.status).toBe('available')
  const revised={...raw,metric_updated_at:'2026-10-16T13:00:00.000Z'}
  const recent=await readCurrentWeightPointSource(day,tz,db([revised]))
  expect(review(recent,old.revision)).toMatchObject({
   state:'measurement_source_changed',targetReport:'withheld',
   deadlineAttention:'withheld',measurementRevision:'changed_or_unavailable',
   intervention:'not_authorized',
  })
  const pk=packet(review(recent,old.revision))
  const row=pk.evidence.find(x=>x.id==='weight_energy.canonical_goal_status')
  expect(row?.substantive).toBe(false)
  expect(row?.text).toContain('WITHHELD')
  expect(JSON.stringify(row)).not.toContain(raw.metric_id)
  expect(JSON.stringify(row)).not.toContain(old.revision??'unknown')
  expect(pk.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.coverage)
   .toMatchObject({calorieAdjustment:'not_authorized',
    reconciliationState:'goal_source_conflict'})
 })
 it('rejects changed latest identity, deletion, missing fingerprint and recheck failure',async()=>{
  const original=await readCurrentWeightPointSource(day,tz,db([raw]))
  for(const value of [
   [{...raw,metric_id:'55555555-5555-4555-8555-555555555555'}],
   [{...raw,value:'82.00'}],
   [{...raw,measured_at:'2026-10-15T14:00:00.000Z'}],
   [],
  ]){
   const next=await readCurrentWeightPointSource(day,tz,db(value))
   expect(review(next,original.revision).state).toBe('measurement_source_changed')
  }
  expect(review(original,null).state).toBe('measurement_source_changed')
  const bad=await readCurrentWeightPointSource(day,tz,db([{
   ...raw,metric_updated_at:null,
  }]))
  expect(bad.status).toBe('unavailable')
  expect(review(bad,original.revision)).toMatchObject({
   state:'measurement_source_unavailable',targetReport:'withheld',
  })
  const failed=await readCurrentWeightPointSource(day,tz,{
   query:vi.fn(async()=>{throw Error('read failed')}),
  } as unknown as Sql)
  expect(review(failed,original.revision).state).toBe('measurement_source_unavailable')
 })
 it('missing weight remains unknown, not certified goal attainment or missed target',async()=>{
  const missing=await readCurrentWeightPointSource(day,tz,db([]))
  const status=review(missing,null,'unknown')
  expect(status).toMatchObject({
   state:'canonical_target_unknown',targetReport:'unknown',
   measurementRevision:'not_attested',intervention:'not_authorized',
  })
  expect(review(missing,null,'above_target').state).toBe('measurement_source_changed')
  expect(review(missing,undefined as unknown as string,'above_target').state)
   .toBe('measurement_source_changed')
  expect((await readCurrentWeightPointSource('not-date',tz,db([raw]))).status)
   .toBe('unavailable')
 })
})
