import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {
  BODY_GOAL_PROJECTION_SOURCE_SQL,MAX_HISTORY_ROWS,
  fingerprintBodyProjectionRows,loadBodyProjectionSource,
} from '../server/goals/body-projection-source.js'
import {readCurrentWeightProjectionSource}
 from '../server/ask-health/current-weight-projection-source.js'
import {reviewCanonicalSelectedGoal}
 from '../src/domain/ask-health/canonical-goal-status-review.js'
import type {WeightProjectionSourceRead}
 from '../server/ask-health/current-weight-projection-source.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import {reconcileWeightEnergyEvidence} from '../src/domain/ask-health/weight-energy-reconciliation.js'

const day='2026-10-16'
const goalId='11111111-1111-4111-8111-111111111111'
const versionId='22222222-2222-4222-8222-222222222222'
const row=(id:string,value:string,date='2026-09-23T16:00:00.000Z')=>({
  measurement_id:id,
  measurement_session_id:'77777777-7777-4777-8777-777777777777',
  metric_key:'weight',value,unit:'kg',value_kind:'measured',measured_at:date,
  timezone:'America/Phoenix',
  metric_updated_at:'2026-10-01T12:00:00.000Z',
  session_updated_at:'2026-10-01T12:00:00.000Z',
})
const first=row('33333333-3333-4333-8333-333333333333','87.2')
const latest=row('44444444-4444-4444-8444-444444444444','84.5','2026-10-15T16:00:00.000Z')
const db=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql & {
 query:ReturnType<typeof vi.fn>
})
const original=fingerprintBodyProjectionRows('weight',[first,latest])!
const checked=(rows:Record<string,unknown>[]):WeightProjectionSourceRead=>({
  status:'available',revision:fingerprintBodyProjectionRows('weight',rows)!,
  rowCount:rows.length,
})
const settings={state:'consistent_read' as const,calorieTargetState:'configured' as const,
 relevantExperimentCount:0,weightGoalMode:'at_most' as const}
function screen(result:WeightProjectionSourceRead|null,
  captured:string|null=original,overrides:{
    asOf?:string;targetState?:'above_target'|'unknown';priorityState?:
      'selected_active_weight_goal'|'explicitly_cleared'
  }={}){
 return reviewCanonicalSelectedGoal({
  asOf:overrides.asOf??day,today:day,settings,
  priority:{state:overrides.priorityState??'selected_active_weight_goal'},
  read:{status:'available',rows:[{
    id:goalId,versionId,targetMode:'at_most',targetMinKg:null,targetMaxKg:80,
  }]},
  snapshots:[{
    id:goalId,versionId,kind:'body_metric',lifecycle:'active',
    label:'Bodyweight',targetText:'At most 80kg',
    targetState:overrides.targetState??'above_target',
    deadlineState:'future_no_projection',projectionState:null,projectionReason:null,
    bodyWeightProjectionRevision:captured,
  }],
  observation:{state:'all_recorded_above_boundary',comparableWeightDays:3,
    sampledSpanDays:10},
  projectionSourceRead:result,
 })
}
function packet(canonical:ReturnType<typeof screen>){
 const snapshot=buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-09-17',end:day,asOf:day,today:day,
  timezone:'America/Phoenix',observations:[],
 })
 const focus=focusWeightEnergyContext({question:'Why is weight loss stalled?',snapshot,today:day})
 expect(focus).not.toBeNull()
 focus!.canonicalGoalStatus=canonical
 focus!.currentSettings=settings
 focus!.primaryGoalPriority={state:'selected_active_weight_goal'}
 focus!.reconciliation=reconcileWeightEnergyEvidence({
  asOf:day,today:day,settings,canonicalGoal:canonical,
  primaryGoal:focus!.primaryGoalPriority,
  goalObservation:focus!.weightGoalObservation,
  performance:focus!.exercisePreservationReview,
  timing:focus!.experimentTimingReview,
  outcomes:focus!.experimentOutcomeReview,
  recentResults:focus!.recentExperimentResultReview,
  proteinTraining:focus!.proteinTrainingContext,
 })
 const data:AskHealthPacketInput={
  question:'Why is weight loss stalled?',contextMode:'personalized',
  lens:'general',range:'30d',asOf:day,healthToday:day,
  period:{start:'2026-09-17',end:day},generatedAt:day+'T23:00:00Z',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
  supplements:[],context:null,patterns:[],focusedWeightEnergy:focus,
 }
 return buildAskHealthEvidencePacket(data)
}
describe('PIQ-4.2 canonical projection history source recheck',()=>{
 it('uses the same source SQL as Goal Control, including edit timestamps',async()=>{
  const sql=db([first,latest])
  const fromGoal=await loadBodyProjectionSource(sql,'weight')
  expect(sql.query).toHaveBeenCalledWith(BODY_GOAL_PROJECTION_SOURCE_SQL,['weight'])
  expect(BODY_GOAL_PROJECTION_SOURCE_SQL).toContain('metrics.updated_at::text')
  expect(BODY_GOAL_PROJECTION_SOURCE_SQL).toContain('sessions.updated_at::text')
  expect(BODY_GOAL_PROJECTION_SOURCE_SQL).toContain('ORDER BY metrics.id::text')
  expect(fromGoal).toMatchObject({total:2,revision:original})
  const recheck=await readCurrentWeightProjectionSource(db([first,latest]))
  expect(recheck).toEqual({status:'available',revision:original,rowCount:2})
  expect(screen(recheck)).toMatchObject({
   state:'canonical_reported',targetReport:'above_target',
   measurementRevision:'not_attested',
   projectionRevision:'complete_series_rechecked',intervention:'not_authorized',
  })
 })
 it('fingerprints full history independent of SQL row order',()=>{
  expect(fingerprintBodyProjectionRows('weight',[latest,first])).toBe(original)
  expect(fingerprintBodyProjectionRows('weight',[first,latest])).toBe(original)
  expect(fingerprintBodyProjectionRows('weight',[])).toMatch(/^[0-9a-f]{64}$/)
  expect(fingerprintBodyProjectionRows('body_fat_percentage',[first,latest])).toBeNull()
 })
 it('detects edits to older points even when latest point is unchanged',()=>{
  for(const changed of [
    [{...first,value:'88.1'},latest],
    [{...first,metric_updated_at:'2026-10-16T12:00:00Z'},latest],
    [{...first,session_updated_at:'2026-10-16T12:00:00Z'},latest],
    [{...first,timezone:'America/New_York'},latest],
    [{...first,unit:'lb'},latest],
    [{...first,measured_at:'2026-09-24T16:00:00Z'},latest],
    [latest],
    [first,latest,row('55555555-5555-4555-8555-555555555555','90','2026-08-01T16:00:00Z')],
  ]){
    const result=screen(checked(changed))
    expect(result).toMatchObject({
      state:'projection_source_changed',targetReport:'withheld',
      deadlineAttention:'withheld',projectionRevision:'changed_or_unavailable',
      intervention:'not_authorized',
    })
  }
 })
 it('fails closed for missing, invalid, duplicate or oversized row histories',async()=>{
  for(const rows of [
    [first,first],[{...first,metric_updated_at:null}],
    [{...first,value:'not-a-number'}],[{...first,measurement_id:''}],
    [{...first,timezone:55}],[{...first,metric_key:'body_fat_percentage'}],
    Array.from({length:MAX_HISTORY_ROWS+1},(_,i)=>row('row-'+i,String(90+i))),
  ]){
    expect(fingerprintBodyProjectionRows('weight',rows)).toBeNull()
    expect((await readCurrentWeightProjectionSource(db(rows))).status).toBe('unavailable')
  }
  expect((await readCurrentWeightProjectionSource({
    query:vi.fn(async()=>{throw Error('DB unreachable')}),
  } as unknown as Sql)).status).toBe('unavailable')
  expect(screen({status:'unavailable',revision:null,rowCount:null}).state)
    .toBe('projection_source_unavailable')
  expect(screen(checked([first,latest]),null).state).toBe('projection_source_unavailable')
  expect(screen(null).state).toBe('projection_source_unavailable')
 })
 it('empty historical series is distinguishable from verified attainment',()=>{
  const empty=checked([])
  expect(screen(empty,null,{targetState:'unknown'})).toMatchObject({
    state:'projection_source_unavailable',targetReport:'withheld',
  })
  // Verified-empty fingerprint is valid, but without a real point there
  // cannot be a satisfied/unmet weight measurement.
  const emptyFingerprint=fingerprintBodyProjectionRows('weight',[])!
  expect(screen(empty,emptyFingerprint,{targetState:'unknown'})).toMatchObject({
   state:'canonical_target_unknown',targetReport:'unknown',
   projectionRevision:'empty_series_rechecked',intervention:'not_authorized',
  })
  expect(screen(empty,emptyFingerprint).state).toBe('projection_source_changed')
  expect(screen(empty,emptyFingerprint,{asOf:'2026-10-15'}).state).toBe('unavailable')
  expect(screen(empty,emptyFingerprint,{priorityState:'explicitly_cleared'}).state)
   .toBe('primary_not_weight')
 })
 it('withholds source hashes and private values from AI evidence',()=>{
  const ok=packet(screen(checked([first,latest])))
  const stale=packet(screen(checked([{...first,value:'95.1'},latest])))
  const row=stale.evidence.find(x=>x.id==='weight_energy.canonical_goal_status')
  expect(row).toMatchObject({substantive:false,value:null,
    coverage:{canonicalGoalReview:'projection_source_changed',
      projectionRevision:'changed_or_unavailable',intervention:'not_authorized'}})
  expect(row?.text).toContain('WITHHELD')
  expect(row?.text).toContain('not atomically versioned')
  for(const privateData of [goalId,versionId,original,first.measurement_id,
    latest.measurement_id,'95.1'])
    expect(JSON.stringify(row)).not.toContain(privateData)
  expect(stale.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.coverage)
    .toMatchObject({calorieAdjustment:'not_authorized',
      reconciliationState:'goal_source_conflict'})
  expect(packetFingerprintMaterial(ok)).not.toBe(packetFingerprintMaterial(stale))
 })
})
