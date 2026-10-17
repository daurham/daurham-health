import {describe,expect,it,vi} from 'vitest'
import type {Sql} from '../server/db.js'
import {ACTIVITY_INTELLIGENCE_SQL,activitySummaryObservations} from '../server/intelligence/snapshot.js'
import {recheckCurrentWeightNutrition} from '../server/ask-health/current-weight-nutrition-recheck.js'
import {VERIFIED_NUTRITION_DAYS_SQL} from '../server/nutrition/maintenance-eligibility.js'
import {buildHealthIntelligenceSnapshot,type IntelligenceObservation} from '../src/domain/intelligence/shared.js'
import {focusWeightEnergyContext} from '../src/domain/ask-health/focused-weight-energy.js'
import {buildAskHealthEvidencePacket,packetFingerprintMaterial} from '../src/domain/ask-health/packet.js'

const today='2026-10-16'
const date='2026-10-15'
const sql=(rows:unknown)=>({query:vi.fn(async()=>rows)} as unknown as Sql &{
  query:ReturnType<typeof vi.fn>
})
const observations:IntelligenceObservation[]=[
  {key:'nutrition.calories',date,value:2100,unit:'kcal',
    provenance:'owner',quality:'high_confidence',sourceIds:['entry-a']},
  {key:'nutrition.sodium_mg',date,value:1700,unit:'mg',
    provenance:'owner',quality:'high_confidence',sourceIds:['entry-a']},
  {key:'body.weight_kg',date,value:80,unit:'kg',
    provenance:'owner',quality:'usual',sourceIds:['metric-a']},
]
const snapshot=()=>buildHealthIntelligenceSnapshot({
  range:'30d',start:'2026-10-01',end:today,
  asOf:today,today,timezone:'America/Phoenix',observations,
  nutritionVerifiedCompleteDates:new Set([date]),
  nutritionVerificationStatus:'available',
})
const packet=(check:'verified'|'changed_or_unavailable'|'not_checked')=>{
  const focused=focusWeightEnergyContext({
    question:'Why did my scale stop moving?',snapshot:snapshot(),today,
  })!
  focused.nutritionSourceRecheck=check
  return buildAskHealthEvidencePacket({
    question:'Why did my scale stop moving?',contextMode:'personalized',
    lens:'general',range:'30d',asOf:today,healthToday:today,
    generatedAt:'2026-10-16T22:00:00Z',
    period:{start:'2026-10-01',end:today},
    overview:null,activity:null,sleep:null,goals:[],experiments:[],
    benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy:focused,
  })
}
describe('PIQ-4.2 activity attribution and late Nutrition corrections',()=>{
  it('preserves stable activity-summary identity on every metric, never invents one',()=>{
    expect(ACTIVITY_INTELLIGENCE_SQL).toContain('id::text AS summary_id')
    const rows=[{summary_id:'summary-123',date:'2026-10-15',
      steps_count:'5100',active_energy_kcal:'322',exercise_minutes:'30',
      resting_heart_rate_bpm:'63'}]
    const items=activitySummaryObservations(rows)
    expect(items.map(x=>x.key)).toEqual(['activity.steps','activity.active_energy_kcal',
      'activity.exercise_minutes','activity.resting_heart_rate_bpm'])
    for(const item of items){
      expect(item.sourceIds).toEqual(['summary-123'])
      expect(item.provenance).toBe('device')
    }
    expect(activitySummaryObservations([{...rows[0],summary_id:null}])
      .every(row=>row.sourceIds.length===0)).toBe(true)
  })
  it('rechecks the exact original verified date set against revision-gated canonical rows',async()=>{
    const snapshotValue=snapshot()
    const db=sql([{date,calories:'2100',source_ids:['entry-a']}])
    expect(await recheckCurrentWeightNutrition(snapshotValue,today,db)).toBe('verified')
    expect(db.query).toHaveBeenCalledTimes(1)
    expect(db.query).toHaveBeenCalledWith(VERIFIED_NUTRITION_DAYS_SQL,
      ['2026-10-01',today,today])
    expect(await recheckCurrentWeightNutrition(snapshotValue,today,
      sql([{date,calories:'2100',source_ids:['entry-b']}]))).toBe('changed_or_unavailable')
    expect(await recheckCurrentWeightNutrition(snapshotValue,today,
      sql([{date,calories:'1900',source_ids:['entry-a']}]))).toBe('changed_or_unavailable')
    expect(await recheckCurrentWeightNutrition(snapshotValue,today,sql([])))
      .toBe('changed_or_unavailable')
  })
  it('withholds estimates if correction/delete, lack of revision, or DB error occurs',async()=>{
    expect(await recheckCurrentWeightNutrition(snapshot(),today,{
      query:vi.fn(async()=>{throw Error('DB down')}),
    } as unknown as Sql)).toBe('changed_or_unavailable')
    const missing=buildHealthIntelligenceSnapshot({
      range:'30d',start:'2026-10-01',end:today,asOf:today,today,
      timezone:'America/Phoenix',observations,
      nutritionVerifiedCompleteDates:new Set([date]),nutritionVerificationStatus:'unavailable',
    })
    expect(await recheckCurrentWeightNutrition(missing,today,sql([])))
      .toBe('changed_or_unavailable')
    const p=packet('changed_or_unavailable')
    expect(p.evidence.some(x=>x.id==='weight_energy.observed_balance')).toBe(false)
    expect(p.evidence.some(x=>x.id==='weight_energy.scale_context')).toBe(false)
    expect(p.evidence.some(x=>x.id==='weight_energy.protein_training_context')).toBe(false)
    const boundary=p.evidence.find(x=>x.id==='weight_energy.source_consistency')!
    expect(boundary).toMatchObject({substantive:false,value:null,
      coverage:{nutritionSourceRecheck:'changed_or_unavailable',
        intervention:'not_authorized'}})
    expect(boundary.text).toContain('WITHHELD')
    expect(JSON.stringify(boundary)).not.toContain('entry-a')
    expect(JSON.stringify(boundary)).not.toContain('2100')
    expect(packetFingerprintMaterial(p)).not.toBe(packetFingerprintMaterial(packet('verified')))
  })
  it('preserves independent status when verified or synthetic fixtures were not rechecked',()=>{
    for(const state of ['verified','not_checked'] as const){
      const p=packet(state)
      expect(p.evidence.some(x=>x.id==='weight_energy.source_consistency')).toBe(false)
      expect(p.evidence.some(x=>x.id==='weight_energy.scale_context')).toBe(true)
    }
  })
})
