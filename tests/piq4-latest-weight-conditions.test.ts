import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {loadBodyGoalPointAsOf} from '../server/goals/as-of-point-evidence.js'
import {readCurrentWeightPointSource} from '../server/ask-health/current-weight-point-source.js'
import {reviewCanonicalSelectedGoal} from '../src/domain/ask-health/canonical-goal-status-review.js'
import {reconcileWeightEnergyEvidence} from '../src/domain/ask-health/weight-energy-reconciliation.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'

const today='2026-10-16',zone='America/Phoenix'
const id='11111111-1111-4111-8111-111111111111'
const version='22222222-2222-4222-8222-222222222222'
const row={
  metric_id:'33333333-3333-4333-8333-333333333333',
  session_id:'44444444-4444-4444-8444-444444444444',
  metric_updated_at:'2026-10-15T12:00:00.000Z',
  session_updated_at:'2026-10-15T12:00:00.000Z',
  measured_at:'2026-10-15T16:00:00.000Z',timezone:zone,
  value:'85.0',unit:'kg',comparability:'usual',
}
const sql=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql)
const settings={state:'consistent_read' as const,
  calorieTargetState:'configured' as const,relevantExperimentCount:0,
  weightGoalMode:'at_most' as const}
async function check(sourceRows:unknown,originalRows:unknown=sourceRows,
  goalTargetState:'above_target'|'unknown'='above_target'){
  const original=(await loadBodyGoalPointAsOf(sql(originalRows),'weight',zone,today))
  const current=await readCurrentWeightPointSource(today,zone,sql(sourceRows))
  const status=reviewCanonicalSelectedGoal({
    asOf:today,today,settings,
    priority:{state:'selected_active_weight_goal'},
    read:{status:'available',rows:[{id,versionId:version,targetMode:'at_most',
      targetMinKg:null,targetMaxKg:80}]},
    snapshots:[{id,versionId:version,kind:'body_metric',lifecycle:'active',
      label:'Weight',targetText:'At most 80 kg',targetState:goalTargetState,
      deadlineState:'future_no_projection',projectionState:null,
      projectionReason:null,bodyWeightSourceRevision:original?.sourceRevision??null}],
    observation:{state:'insufficient_comparable_weights',
      comparableWeightDays:0,sampledSpanDays:0},
    sourceRead:current,
  })
  return {original,current,status}
}
function packet(status:Awaited<ReturnType<typeof check>>['status']){
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',start:'2026-09-17',end:today,asOf:today,
    today,timezone:zone,observations:[],
  })
  const focus=focusWeightEnergyContext({
    question:'Is my current weight goal met?',snapshot,today,
  })!
  focus.canonicalGoalStatus=status
  focus.currentSettings=settings
  focus.primaryGoalPriority={state:'selected_active_weight_goal'}
  focus.reconciliation=reconcileWeightEnergyEvidence({
    asOf:today,today,settings,canonicalGoal:status,
    primaryGoal:focus.primaryGoalPriority,
    goalObservation:focus.weightGoalObservation,
    performance:focus.exercisePreservationReview,
    timing:focus.experimentTimingReview,
    outcomes:focus.experimentOutcomeReview,
    recentResults:focus.recentExperimentResultReview,
    proteinTraining:focus.proteinTrainingContext,
  })
  return buildAskHealthEvidencePacket({
    contextMode:'personalized',question:'Is my current weight goal met?',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start:'2026-09-17',end:today},
    generatedAt:today+'T21:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focus,
  })
}
describe('PIQ-4.2 latest-point condition integrity',()=>{
  it('permits a revision-matched, owner-reported usual-condition point only as a description',async()=>{
    const result=await check([row])
    expect(result.current).toMatchObject({
      status:'available',hasPoint:true,comparability:'usual'})
    expect(result.status).toMatchObject({
      state:'canonical_reported',targetReport:'above_target',
      measurementRevision:'latest_point_rechecked',intervention:'not_authorized'})
  })
  it('withholds goal attainment and deadline reports for explicitly nonusual or unknown points',async()=>{
    for(const comparability of ['unknown','different_conditions',null] as const){
      const source={...row,comparability}
      const result=await check([source])
      expect(result.status).toMatchObject({
        state:'measurement_conditions_unverified',targetReport:'withheld',
        deadlineAttention:'withheld',measurementRevision:'latest_point_rechecked',
        intervention:'not_authorized',
      })
      const evidence=packet(result.status).evidence.find(
        x=>x.id==='weight_energy.canonical_goal_status')!
      expect(evidence).toMatchObject({substantive:false,value:null,
        coverage:{canonicalGoalReview:'measurement_conditions_unverified',
          reportedTargetState:'withheld'}})
      expect(evidence.text).toContain('WITHHELD')
      for(const privateValue of [id,version,row.metric_id,row.session_id,'85.0'])
        expect(JSON.stringify({text:evidence.text,coverage:evidence.coverage}))
          .not.toContain(privateValue)
    }
  })
  it('checks the condition in the immutable-at-read point identity and detects a change',async()=>{
    const before=await loadBodyGoalPointAsOf(sql([row]),'weight',zone,today)
    const changed={...row,comparability:'different_conditions'}
    const after=await loadBodyGoalPointAsOf(sql([changed]),'weight',zone,today)
    expect(before?.sourceRevision).not.toBe(after?.sourceRevision)
    const result=await check([changed],[row])
    expect(result.status).toMatchObject({state:'measurement_source_changed',
      targetReport:'withheld',measurementRevision:'changed_or_unavailable'})
  })
  it('rejects missing or invalid latest-condition metadata at the independent recheck',async()=>{
    for(const bad of [
      {...row,comparability:undefined},
      {...row,comparability:'magically_healthy'},
    ]){
      const current=await readCurrentWeightPointSource(today,zone,sql([bad]))
      expect(current.status).toBe('unavailable')
    }
    const good=await check([{...row,comparability:'unknown'}])
    expect(good.current.status).toBe('available')
  })
  it('retains missing measurement status, without claiming attainment or bad conditions',async()=>{
    const result=await check([],[],'unknown')
    expect(result.current).toMatchObject({status:'available',hasPoint:false,
      comparability:null})
    expect(result.status).toMatchObject({
      state:'canonical_target_unknown',targetReport:'unknown',
      intervention:'not_authorized'})
  })
  it('propagates the unknown-condition state through reconciliation and packet fingerprints',async()=>{
    const usual=(await check([row])).status
    const unknown=(await check([{...row,comparability:'unknown'}])).status
    const p1=packet(usual),p2=packet(unknown)
    expect(p2.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.coverage)
      .toMatchObject({calorieAdjustment:'not_authorized'})
    expect(p2.evidence.find(x=>x.id==='weight_energy.cross_signal_reconciliation')?.text)
      .toContain('NOT AUTHORIZED')
    expect(packetFingerprintMaterial(p1)).not.toBe(packetFingerprintMaterial(p2))
  })
})
