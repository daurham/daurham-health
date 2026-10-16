import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {readCurrentExperimentWindows,CURRENT_EXPERIMENT_WINDOWS_SQL,
  type CurrentExperimentWindowsRead} from '../server/ask-health/current-experiment-windows.js'
import {screenExperimentTimingReview} from '../src/domain/ask-health/experiment-timing-review.js'
import type {WeightEnergyCurrentSettings} from '../src/domain/ask-health/weight-energy-current-settings.js'
import {buildHealthIntelligenceSnapshot} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'
import type {AskHealthPacketInput} from '../src/domain/ask-health/types.js'
import {MAINTENANCE_DECISION_REVISION_SQL} from '../server/intelligence/maintenance-revision.js'

const today='2026-10-16'
const privateId='11111111-1111-4111-8111-111111111111'
const base={id:privateId,status:'active',window_start:'2026-10-11',
  window_end:'2026-10-23'}
const db=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql & {
  query:ReturnType<typeof vi.fn>
})
function settings(count:number):WeightEnergyCurrentSettings{
  return {state:'consistent_read',calorieTargetState:'configured',
    relevantExperimentCount:count}
}
function check(read:CurrentExperimentWindowsRead|null,count:number,asOf=today,
  setting=settings(count)){
  return screenExperimentTimingReview({asOf,today,settings:setting,read})
}
function packet(state:ReturnType<typeof check>){
  const snap=buildHealthIntelligenceSnapshot({
    range:'30d',start:'2026-09-17',end:today,asOf:today,today,
    timezone:'America/Phoenix',observations:[],
  })
  const focus=focusWeightEnergyContext({
    question:'Why is my weight loss stalled?',snapshot:snap,today,
  })
  expect(focus).not.toBeNull()
  focus!.currentSettings=settings(1)
  focus!.experimentTimingReview=state
  const input:AskHealthPacketInput={
    question:'Why is my weight loss stalled?',contextMode:'personalized',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    period:{start:'2026-09-17',end:today},generatedAt:today+'T18:00:00Z',
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focus,
  }
  return buildAskHealthEvidencePacket(input)
}
describe('PIQ-4.2 Personal Lab window timing is a review, not calorie advice',()=>{
  it('queries the EXACT same active and next-14d statuses as revision and is bounded',async()=>{
    const sql=db([base])
    const result=await readCurrentExperimentWindows(today,sql)
    expect(result).toEqual({status:'available',rows:[{
      id:privateId,status:'active',start:'2026-10-11',end:'2026-10-23',
    }]})
    expect(sql.query).toHaveBeenCalledWith(CURRENT_EXPERIMENT_WINDOWS_SQL,[today])
    expect(CURRENT_EXPERIMENT_WINDOWS_SQL).toContain("e.status = 'active'")
    expect(CURRENT_EXPERIMENT_WINDOWS_SQL).toContain("e.status = 'scheduled'")
    expect(CURRENT_EXPERIMENT_WINDOWS_SQL).toContain("e.window_start <= $1::date + 14")
    expect(CURRENT_EXPERIMENT_WINDOWS_SQL).toContain("e.window_end >= $1::date")
    expect(CURRENT_EXPERIMENT_WINDOWS_SQL).toContain('LIMIT 101')
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain("e.window_start <= $1::date + 14")
    expect(MAINTENANCE_DECISION_REVISION_SQL).toContain("e.window_end >= $1::date")
  })
  it('classifies current active, imminent scheduled and mixed windows',async()=>{
    const now=await readCurrentExperimentWindows(today,db([base]))
    expect(check(now,1)).toMatchObject({state:'active_now',activeWithinWindow:1,
      upcomingScheduled:0,activeOutsideOrUndated:0})
    const soon={id:'private-scheduled',status:'scheduled',
      window_start:'2026-10-28',window_end:'2026-11-08'}
    const scheduled=await readCurrentExperimentWindows(today,db([soon]))
    expect(check(scheduled,1).state).toBe('scheduled_soon')
    const both=await readCurrentExperimentWindows(today,db([base,soon]))
    expect(check(both,2).state).toBe('active_and_scheduled')
    const empty=await readCurrentExperimentWindows(today,db([]))
    expect(check(empty,0).state).toBe('none')
    // Explicitly not a global assertion that no other experiment exists.
    expect(packet(check(empty,0)).evidence.find(x=>x.id==='weight_energy.experiment_timing')?.text)
      .toContain('in this specific window')
  })
  it('does not treat stale or undated ACTIVE statuses as current interventions',async()=>{
    for(const row of [
      {...base,window_start:'2026-09-01',window_end:'2026-09-15'},
      {...base,window_start:'2026-10-25',window_end:'2026-11-10'},
      {...base,window_start:null,window_end:null},
    ]){
      const read=await readCurrentExperimentWindows(today,db([row]))
      expect(check(read,1)).toMatchObject({
        state:'active_timing_unclear',activeWithinWindow:0,activeOutsideOrUndated:1,
      })
    }
  })
  it('refuses mismatched count, changed revision, history, malformed, duplicates and truncation',async()=>{
    const current=await readCurrentExperimentWindows(today,db([base]))
    expect(check(current,0).state).toBe('unavailable')
    expect(check(current,1,'2026-10-15').state).toBe('unavailable')
    expect(check(current,1,today,{
      state:'changed_during_read',calorieTargetState:'unknown',
      relevantExperimentCount:null,
    }).state).toBe('unavailable')
    expect(check(null,1).state).toBe('unavailable')
    for(const rows of [
      [base,base],
      [{...base,window_end:'2026-10-01'}],
      [{...base,window_start:null,window_end:'2026-10-21'}],
      [{...base,status:'completed'}],
      [{...base,id:''}],
      [{...base,window_start:'2026-10-40'}],
      [{...base,status:'scheduled',window_start:'2026-12-01',window_end:'2026-12-12'}],
      [{...base,status:'scheduled',window_start:'2026-10-01',window_end:'2026-10-02'}],
      Array.from({length:101},(_,i)=>({...base,id:'private-'+i})),
    ]){
      expect((await readCurrentExperimentWindows(today,db(rows))).status).toBe('unavailable')
    }
    expect((await readCurrentExperimentWindows(today,db(undefined))).status).toBe('unavailable')
    expect((await readCurrentExperimentWindows('invalid-date',db([]))).status).toBe('unavailable')
    expect((await readCurrentExperimentWindows(today,{
      query:vi.fn(async()=>{throw new Error('network')}),
    } as unknown as Sql)).status).toBe('unavailable')
  })
  it('packet contains only private-free aggregates and cannot claim a causal result',async()=>{
    const state=check(await readCurrentExperimentWindows(today,db([base])),1)
    const p=packet(state)
    const row=p.evidence.find(x=>x.id==='weight_energy.experiment_timing')
    expect(row?.substantive).toBe(false)
    expect(row?.text).toContain('not a causal result')
    expect(row?.coverage).toMatchObject({timingState:'active_now',activeWithinWindow:1})
    expect(JSON.stringify(p)).not.toContain(privateId)
    expect(JSON.stringify(p)).not.toContain('2026-10-11')
    expect(JSON.stringify(p)).not.toContain('2026-10-23')
    expect(p.evidence.find(x=>x.id==='weight_energy.decision_boundary')?.text)
      .toContain('CANNOT classify an owner-specific weight-loss plateau')
    expect(packetFingerprintMaterial(p)).not.toBe(
      packetFingerprintMaterial(packet(check({
        status:'available',rows:[],
      },0))))
  })
})
