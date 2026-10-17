import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {buildHealthIntelligenceSnapshot,type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import {recheckCurrentWeightActivity,LATE_ACTIVITY_INTELLIGENCE_SQL,
  LATE_WEIGHT_INTELLIGENCE_SQL} from '../server/ask-health/current-weight-activity-recheck.js'

const today='2026-10-16',date='2026-10-15',tz='America/Phoenix'
const activity={summary_id:'activity-a',date,steps_count:'5100',
  active_energy_kcal:'320',exercise_minutes:'45',resting_heart_rate_bpm:'63'}
const weight={metric_id:'metric-a',session_id:'session-a',value:'83',
  unit:'kg',measured_at:'2026-10-15T17:00:00Z',timezone:tz,
  comparability:'usual',source_kind:'manual'}
const snapshot=()=>buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-10-01',end:today,asOf:today,today,
  timezone:tz,observations:[
    {date,key:'activity.steps',value:5100,unit:'steps',provenance:'device',sourceIds:['activity-a']},
    {date,key:'activity.active_energy_kcal',value:320,unit:'kcal',provenance:'device',sourceIds:['activity-a']},
    {date,key:'activity.exercise_minutes',value:45,unit:'min',provenance:'device',sourceIds:['activity-a']},
    {date,key:'activity.resting_heart_rate_bpm',value:63,unit:'bpm',provenance:'device',sourceIds:['activity-a']},
    {date,key:'body.weight_kg',value:83,unit:'kg',provenance:'owner',
      quality:'usual',sourceIds:['metric-a']},
  ] satisfies IntelligenceObservation[],
})
const read=(rows1:unknown= [activity],rows2:unknown=[weight])=>
  ({query:vi.fn(async(sql:string)=>sql===LATE_ACTIVITY_INTELLIGENCE_SQL?rows1:
    sql===LATE_WEIGHT_INTELLIGENCE_SQL?rows2:[])}) as unknown as Sql &{
      query:ReturnType<typeof vi.fn>
    }
const verify=(db:Sql,adjust:Partial<Parameters<typeof recheckCurrentWeightActivity>[0]>={})=>
  recheckCurrentWeightActivity({
    snapshot:snapshot(),today,start:'2026-10-01',end:date,
    sqlOverride:db,...adjust,
  })
function packet(state:'verified'|'changed_or_unavailable'|'not_checked'){
  const focused=focusWeightEnergyContext({
    question:'Why has my weight loss stalled?',snapshot:snapshot(),today,
  })!
  focused.weightActivitySourceRecheck=state
  focused.nutritionSourceRecheck='verified'
  return buildAskHealthEvidencePacket({
    question:'Why has my weight loss stalled?',contextMode:'personalized',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start:'2026-10-01',end:today},generatedAt:today+'T22:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focused,
  })
}
describe('PIQ4 late current effective body/activity source check',()=>{
  it('uses bounded read of same activity row shape and excludes review-invalid weights',async()=>{
    const db=read()
    expect(await verify(db)).toBe('verified')
    expect(db.query).toHaveBeenCalledTimes(2)
    expect(db.query).toHaveBeenCalledWith(LATE_ACTIVITY_INTELLIGENCE_SQL,
      [tz,today,'2026-10-01'])
    expect(db.query).toHaveBeenCalledWith(LATE_WEIGHT_INTELLIGENCE_SQL,
      [today,tz,'2026-09-29'])
    expect(LATE_WEIGHT_INTELLIGENCE_SQL).toContain('excluded_from_analysis')
    expect(LATE_WEIGHT_INTELLIGENCE_SQL).toContain('body_measurement_session')
  })
  it('detects same-ID same-date corrected steps, HR or activity replacement',async()=>{
    for(const modified of [
      {...activity,steps_count:'6200'},
      {...activity,resting_heart_rate_bpm:'64'},
      {...activity,summary_id:'replacement'},
    ])expect(await verify(read([modified]))).toBe('changed_or_unavailable')
  })
  it('detects identical weight value with source replacement, condition or unit change',async()=>{
    for(const modified of [
      {...weight,metric_id:'replacement'},
      {...weight,comparability:'different_conditions'},
      {...weight,value:'84'},
      {...weight,unit:'lb',value:'83'},
    ])expect(await verify(read([activity],[modified]))).toBe('changed_or_unavailable')
  })
  it('rejects deleted, added, missing ID, and failed source reads',async()=>{
    expect(await verify(read([]))).toBe('changed_or_unavailable')
    expect(await verify(read([activity],[]))).toBe('changed_or_unavailable')
    expect(await verify(read([{...activity,summary_id:null}]))).toBe('changed_or_unavailable')
    expect(await verify({query:vi.fn(async()=>{throw Error('db unavailable')})} as unknown as Sql))
      .toBe('changed_or_unavailable')
    expect(await verify(read(),{start:'2025-01-01'})).toBe('changed_or_unavailable')
    expect(await verify(read(),{today:'2026-10-15'})).toBe('changed_or_unavailable')
  })
  it('ignores unrelated out-of-range rows but detects a replacement within the window',async()=>{
    const older={...activity,date:'2026-09-20',summary_id:'old'}
    expect(await verify(read([older,activity]))).toBe('verified')
    const added={...activity,date:'2026-10-14',summary_id:'new'}
    expect(await verify(read([added,activity]))).toBe('changed_or_unavailable')
  })
  it('withholds all focused cross-signal claims on changed body or activity data',()=>{
    const p=packet('changed_or_unavailable')
    expect(p.evidence.some(x=>x.id==='weight_energy.scale_context')).toBe(false)
    expect(p.evidence.some(x=>x.id==='weight_energy.observed_balance')).toBe(false)
    expect(p.evidence.some(x=>x.id==='weight_energy.canonical_goal_status')).toBe(false)
    const boundary=p.evidence.find(x=>x.id==='weight_energy.source_consistency')!
    expect(boundary).toMatchObject({substantive:false,value:null,
      coverage:{weightActivitySourceRecheck:'changed_or_unavailable',
        intervention:'not_authorized'}})
    expect(boundary.text).toContain('WITHHELD')
    expect(JSON.stringify(boundary)).not.toContain('activity-a')
    expect(JSON.stringify(boundary)).not.toContain('metric-a')
    expect(packetFingerprintMaterial(p)).not.toBe(packetFingerprintMaterial(packet('verified')))
  })
})
