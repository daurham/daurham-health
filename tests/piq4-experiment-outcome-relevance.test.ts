import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {readCurrentExperimentOutcomes,CURRENT_EXPERIMENT_OUTCOMES_SQL,
  type CurrentExperimentOutcomesRead} from '../server/ask-health/current-experiment-outcomes.js'
import type {CurrentExperimentWindowsRead} from '../server/ask-health/current-experiment-windows.js'
import {screenExperimentOutcomeReview} from '../src/domain/ask-health/experiment-outcome-review.js'
import {screenExperimentTimingReview} from '../src/domain/ask-health/experiment-timing-review.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import {MAINTENANCE_DECISION_REVISION_SQL} from '../server/intelligence/maintenance-revision.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'

const today='2026-10-16'
const id='11111111-1111-4111-8111-111111111111'
const other='22222222-2222-4222-8222-222222222222'
const protocol='33333333-3333-4333-8333-333333333333'
const reqId='44444444-4444-4444-8444-444444444444'
const windows=(ids=[id],kind:'active'|'scheduled'='active'):CurrentExperimentWindowsRead=>({
  status:'available',rows:ids.map(x=>({id:x,status:kind,
    start:kind==='active'?'2026-10-10':'2026-10-26',
    end:'2026-11-04'})),
})
const row=(experiment=id,requirement=reqId,role='primary_outcome',
  domain='body',kind='body_metric',selector:unknown={metricKey:'weight'})=>({
  experiment_id:experiment,protocol_version_id:protocol,
  requirement_id:requirement,role,domain,requirement_kind:kind,selector,
})
const empty=(experiment=id)=>({
  experiment_id:experiment,protocol_version_id:protocol,
  requirement_id:null,role:null,domain:null,requirement_kind:null,selector:null,
})
const db=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql & {
  query:ReturnType<typeof vi.fn>
})
const settings=(count:number):WeightEnergyCurrentSettings=>({
  state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:count,
})
function review(w:CurrentExperimentWindowsRead,
  r:CurrentExperimentOutcomesRead,asOf=today,s=settings(w.status==='available'?w.rows.length:0)){
  const timing=screenExperimentTimingReview({asOf,today,settings:s,read:w})
  return screenExperimentOutcomeReview({asOf,today,settings:s,timing,windows:w,outcomes:r})
}
function packet(outcome:ReturnType<typeof review>){
  const snapshot=buildHealthIntelligenceSnapshot({
    range:'30d',start:'2026-09-17',end:today,asOf:today,today,
    timezone:'America/Phoenix',observations:[],
  })
  const focus=focusWeightEnergyContext({
    question:'Why is my weight loss stalled?',snapshot,today,
  })
  expect(focus).not.toBeNull()
  focus!.currentSettings=settings(1)
  focus!.experimentOutcomeReview=outcome
  const input:AskHealthPacketInput={
    lens:'general',range:'30d',asOf:today,healthToday:today,
    question:'Why is my weight loss stalled?',contextMode:'personalized',
    period:{start:'2026-09-17',end:today},generatedAt:today+'T20:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focus,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 typed experiment relevance, not causal efficacy',()=>{
  it('reads only cohort private IDs and attests requirement definitions in the revision',async()=>{
    const q=db([row()])
    const got=await readCurrentExperimentOutcomes(windows(),q)
    expect(q.query).toHaveBeenCalledWith(CURRENT_EXPERIMENT_OUTCOMES_SQL,[[id]])
    expect(got).toEqual({status:'available',rows:[{
      id,directWeightOrCalorieOutcome:true,
      otherOutcomeOnly:false,noOutcomeDeclared:false,
    }]})
    expect(CURRENT_EXPERIMENT_OUTCOMES_SQL).toContain('e.id = ANY($1::uuid[])')
    expect(CURRENT_EXPERIMENT_OUTCOMES_SQL).toContain('LIMIT 401')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('relevant_requirements AS')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain('r.selector')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain("'experiment_requirements'")
  })
  it('recognizes only typed primary/secondary weight and calorie outcomes',async()=>{
    for(const x of [
      row(id,reqId,'primary_outcome','body','body_metric',{metricKey:'weight'}),
      row(id,reqId,'secondary_outcome','nutrition','nutrition_metric',{metricKey:'calories'}),
    ]){
      expect(review(windows(),await readCurrentExperimentOutcomes(windows(),db([x]))))
        .toMatchObject({state:'direct_outcome_recorded',directOutcomeExperiments:1,
          directOutcomesActiveNow:1,directOutcomesScheduledSoon:0})
    }
    for(const x of [
      row(id,reqId,'adherence','nutrition','nutrition_metric',{metricKey:'calories'}),
      row(id,reqId,'primary_outcome','nutrition','nutrition_metric',{metricKey:'protein'}),
      row(id,reqId,'primary_outcome','body','body_metric',{metricKey:'waist_circumference'}),
      row(id,reqId,'primary_outcome','sleep','sleep_metric',{metricKey:'total_sleep_minutes'}),
    ]){
      const r=await readCurrentExperimentOutcomes(windows(),db([x]))
      expect(review(windows(),r).directOutcomeExperiments).toBe(0)
    }
  })
  it('never interprets another-domain outcome or absent primary outcome as irrelevance',async()=>{
    const w=windows()
    const otherOutcome=review(w,await readCurrentExperimentOutcomes(w,db([
      row(id,reqId,'primary_outcome','sleep','sleep_metric',
        {metricKey:'total_sleep_minutes'}),
    ])))
    expect(otherOutcome).toMatchObject({state:'other_outcomes_only',
      directOutcomeExperiments:0,noDirectOutcomeExperiments:1})
    const unspecified=review(w,await readCurrentExperimentOutcomes(w,db([empty()])))
    expect(unspecified).toMatchObject({state:'unclassified_protocols',
      noDeclaredOutcomeExperiments:1})
    expect(packet(otherOutcome).evidence.find(x=>x.id==='weight_energy.experiment_outcomes')?.text)
      .toContain('indirect effects remain entirely possible')
  })
  it('distinguishes planned vs active direct outcomes and mixed cohorts',async()=>{
    const scheduled=windows([id],'scheduled')
    const scheduledReview=review(scheduled,
      await readCurrentExperimentOutcomes(scheduled,db([
        row(id,reqId,'secondary_outcome','nutrition','nutrition_metric',{metricKey:'calories'}),
      ])))
    expect(scheduledReview).toMatchObject({
      directOutcomesActiveNow:0,directOutcomesScheduledSoon:1,
    })
    const mixed=windows([id,other])
    const rows=[row(),row(other,'55555555-5555-4555-8555-555555555555',
      'primary_outcome','training','training_measure',{measure:'total_reps'})]
    expect(review(mixed,await readCurrentExperimentOutcomes(mixed,db(rows))))
      .toMatchObject({state:'mixed_protocols',directOutcomeExperiments:1,
        noDirectOutcomeExperiments:1})
  })
  it('fails closed on missing/malformed cohort, duplicates, mismatches and too many outcomes',async()=>{
    const w=windows()
    for(const rows of [
      [],[row(other)],[row(),row()],
      [{...row(),protocol_version_id:''}],
      [{...row(),role:'not_valid'}],
      [{...row(),selector:{metricKey:'weight',extra:'invalid'}}],
      [{...row(),selector:null}],
      [{...row(),requirement_id:null}],
      [{...row(),protocol_version_id:null}],
      [{...empty(),role:'primary_outcome'}],
      Array.from({length:401},(_,i)=>row(id,'test-'+i)),
    ])expect((await readCurrentExperimentOutcomes(w,db(rows))).status).toBe('unavailable')
    expect((await readCurrentExperimentOutcomes(w,db(undefined))).status).toBe('unavailable')
    expect((await readCurrentExperimentOutcomes(w,{
      query:vi.fn(async()=>{throw Error('DB unavailable')}),
    } as unknown as Sql)).status).toBe('unavailable')
    expect((await readCurrentExperimentOutcomes(null,db([row()]))).status)
      .toBe('unavailable')
  })
  it('revision conflicts and absent reads never produce an attested relevance count',async()=>{
    const w=windows(),r=await readCurrentExperimentOutcomes(w,db([row()]))
    expect(review(w,r,today,{...settings(1),state:'changed_during_read'}).state)
      .toBe('unavailable')
    expect(review(w,r,'2026-10-15').state).toBe('unavailable')
    expect(review(w,r,today,settings(2)).state).toBe('unavailable')
    expect(review(w,{status:'unavailable',rows:[]}).state).toBe('unavailable')
    expect(review(windows([]),{status:'available',rows:[]})).toMatchObject({
      state:'none',directOutcomeExperiments:0,
    })
  })
  it('packet contains no private IDs/selectors/metric values and fingerprint changes',async()=>{
    const w=windows()
    const p=packet(review(w,await readCurrentExperimentOutcomes(w,db([row()]))))
    const item=p.evidence.find(x=>x.id==='weight_energy.experiment_outcomes')
    expect(item?.substantive).toBe(false)
    expect(item?.coverage).toMatchObject({
      relevanceState:'direct_outcome_recorded',directOutcomeExperiments:1,
    })
    expect(item?.text).toContain('not measured adherence')
    for(const secret of [id,protocol,reqId,'metricKey','2026-10-10'])
      expect(JSON.stringify(p)).not.toContain(secret)
    expect(p.evidence.find(x=>x.id==='weight_energy.decision_boundary')?.text)
      .toContain('CANNOT classify an owner-specific weight-loss plateau')
    const otherRead=await readCurrentExperimentOutcomes(w,db([
      row(id,reqId,'primary_outcome','nutrition','nutrition_metric',{metricKey:'protein'}),
    ]))
    expect(packetFingerprintMaterial(p)).not.toBe(
      packetFingerprintMaterial(packet(review(w,otherRead))))
  })
})
