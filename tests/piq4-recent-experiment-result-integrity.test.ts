import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {readRecentExperimentResults,RECENT_EXPERIMENT_RESULTS_SQL}
 from '../server/ask-health/recent-experiment-results.js'
import {screenRecentExperimentResults} from '../src/domain/ask-health/recent-experiment-result-review.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import {MAINTENANCE_DECISION_REVISION_SQL} from '../server/intelligence/maintenance-revision.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16'
const experimentId='11111111-1111-4111-8111-111111111111'
const resultId='22222222-2222-4222-8222-222222222222'
const protocol='33333333-3333-4333-8333-333333333333'
const base={
 result_id:resultId,experiment_id:experimentId,
 protocol_version_id:protocol,pinned_protocol_version_id:protocol,
 experiment_status:'completed',classification:'completed_interpretable',status:'valid',
 protocol_attestation:'followed',stopped_for_safety:false,
 window_start:'2026-10-01',planned_window_end:'2026-10-10',
 effective_end_date:'2026-10-10',
 direct_metric_declared:true,direct_metric_observed:true,
}
const sql=(items:unknown)=>({query:vi.fn(async()=>items)} as unknown as Sql & {
 query:ReturnType<typeof vi.fn>
})
const good:WeightEnergyCurrentSettings={
 state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0,
}
function packet(result:ReturnType<typeof screenRecentExperimentResults>){
 const snap=buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-09-17',end:today,asOf:today,today,
  timezone:'America/Phoenix',observations:[],
 })
 const focus=focusWeightEnergyContext({
  question:'Why is my weight loss stalled?',snapshot:snap,today,
 })
 expect(focus).not.toBeNull()
 focus!.currentSettings=good
 focus!.recentExperimentResultReview=result
 const input:AskHealthPacketInput={
  question:'Why is my weight loss stalled?',contextMode:'personalized',
  lens:'general',range:'30d',asOf:today,healthToday:today,
  period:{start:'2026-09-17',end:today},generatedAt:today+'T21:00:00Z',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],
  benchmarks:[],supplements:[],context:null,patterns:[],
  focusedWeightEnergy:focus,
 }
 return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 recent finalized result integrity',()=>{
 it('uses a recent Health-calendar bounded result source with source-revision coverage',async()=>{
  const db=sql([base])
  const r=await readRecentExperimentResults(today,db)
  expect(db.query).toHaveBeenCalledWith(RECENT_EXPERIMENT_RESULTS_SQL,[today])
  expect(r.status).toBe('available')
  expect(RECENT_EXPERIMENT_RESULTS_SQL).toContain('r.effective_end_date BETWEEN $1::date - 27 AND $1::date')
  expect(RECENT_EXPERIMENT_RESULTS_SQL).toContain('LIMIT 101')
  expect(RECENT_EXPERIMENT_RESULTS_SQL).toContain('q.evaluation_status')
  expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('recent_result_sources AS')
  for(const needle of ['r.invalidated_at','r.evidence_fingerprint','q.evaluation_status',
    'q.summary','p.selector',"'recent_results'"])
   expect(MAINTENANCE_DECISION_REVISION_SQL).toContain(needle)
 })
 it('counts valid, protocol followed interpretable direct recorded metrics WITHOUT causality',async()=>{
  const read=await readRecentExperimentResults(today,sql([base]))
  const check=screenRecentExperimentResults({asOf:today,today,settings:good,read})
  expect(check).toMatchObject({
   state:'recent_direct_observation',recentFinalizations:1,
   interpretableDirectMetricResults:1,limitedOrInconclusiveResults:0,
  })
  const p=packet(check)
  const item=p.evidence.find(x=>x.id==='weight_energy.recent_experiment_results')
  expect(item?.substantive).toBe(false)
  expect(item?.text).toContain('does not establish weight direction')
  expect(item?.coverage).toMatchObject({resultReviewState:'recent_direct_observation'})
  for(const privateValue of [experimentId,resultId,protocol,'2026-10-10','33333333'])
    expect(JSON.stringify(p)).not.toContain(privateValue)
  expect(p.evidence.find(x=>x.id==='weight_energy.decision_boundary')?.text)
    .toContain('CANNOT classify an owner-specific weight-loss plateau')
 })
 it('withholds missing direct metrics and low adherence, inconclusive, safety-stopped outcomes',async()=>{
  const cases=[
   {...base,direct_metric_observed:false},
   {...base,classification:'completed_low_adherence'},
   {...base,classification:'incomplete',experiment_status:'inconclusive'},
   {...base,classification:'inconclusive',experiment_status:'inconclusive'},
   {...base,classification:'stopped_safety',experiment_status:'inconclusive',stopped_for_safety:true},
   {...base,classification:'invalid_protocol',experiment_status:'inconclusive',protocol_attestation:'not_followed'},
   {...base,protocol_attestation:'uncertain'},
  ]
  for(const source of cases){
   const read=await readRecentExperimentResults(today,sql([source]))
   expect(screenRecentExperimentResults({asOf:today,today,settings:good,read})
     .interpretableDirectMetricResults).toBe(0)
  }
  const other=await readRecentExperimentResults(today,sql([{
   ...base,direct_metric_declared:false,direct_metric_observed:false,
  }]))
  expect(screenRecentExperimentResults({asOf:today,today,settings:good,read:other}))
   .toMatchObject({interpretableOtherResults:1,state:'recent_non_direct_or_limited'})
 })
 it('separates invalidated records and no recent finalizations from unknown source coverage',async()=>{
  const invalidated=await readRecentExperimentResults(today,sql([{
   ...base,status:'invalidated',experiment_status:'active',
  }]))
  expect(screenRecentExperimentResults({asOf:today,today,settings:good,read:invalidated}))
   .toMatchObject({invalidatedResults:1,interpretableDirectMetricResults:0})
  const empty=await readRecentExperimentResults(today,sql([]))
  expect(screenRecentExperimentResults({asOf:today,today,settings:good,read:empty}))
   .toMatchObject({state:'none_recent',recentFinalizations:0})
  expect(screenRecentExperimentResults({asOf:today,today,
   settings:{...good,state:'changed_during_read'},read:empty}).state).toBe('unavailable')
  expect(screenRecentExperimentResults({asOf:'2026-10-15',today,settings:good,read:empty})
   .state).toBe('unavailable')
  expect(screenRecentExperimentResults({asOf:today,today,settings:good,read:null})
   .state).toBe('unavailable')
  expect(packet(screenRecentExperimentResults({asOf:today,today,settings:good,read:empty}))
   .evidence.find(x=>x.id==='weight_energy.recent_experiment_results')?.text)
   .toContain('outside this scope')
 })
 it('fails closed on future, out-of-window, protocol, status and duplicate source rows',async()=>{
  for(const rows of [
   [{...base,effective_end_date:'2026-10-17',planned_window_end:'2026-10-17'}],
   [{...base,effective_end_date:'2026-09-18'}],
   [{...base,pinned_protocol_version_id:'different'}],
   [{...base,experiment_status:'active'}],
   [{...base,classification:'unknown'}],
   [{...base,status:'invalid'}],
   [{...base,direct_metric_declared:false,direct_metric_observed:true}],
   [{...base,protocol_attestation:'invalid'}],
   [{...base,stopped_for_safety:null}],
   [{...base,window_start:'2026-10-11'}],
   [base,base],
   [base,{...base,result_id:'another-id'}],
   Array.from({length:101},(_,i)=>({...base,result_id:'id-'+i,status:'invalidated'})),
  ])expect((await readRecentExperimentResults(today,sql(rows))).status).toBe('unavailable')
  expect((await readRecentExperimentResults(today,sql(undefined))).status).toBe('unavailable')
  expect((await readRecentExperimentResults('invalid',sql([]))).status).toBe('unavailable')
  expect((await readRecentExperimentResults(today,{
   query:vi.fn(async()=>{throw Error('missing schema')}),
  } as unknown as Sql)).status).toBe('unavailable')
 })
 it('changes the deterministic packet fingerprint when recent classification changes',async()=>{
  const direct=await readRecentExperimentResults(today,sql([base]))
  const other=await readRecentExperimentResults(today,sql([{
   ...base,status:'invalidated',experiment_status:'active',
  }]))
  const a=packet(screenRecentExperimentResults({asOf:today,today,settings:good,read:direct}))
  const b=packet(screenRecentExperimentResults({asOf:today,today,settings:good,read:other}))
  expect(packetFingerprintMaterial(a)).not.toBe(packetFingerprintMaterial(b))
 })
})
