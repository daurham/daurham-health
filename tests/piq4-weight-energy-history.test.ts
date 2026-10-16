import { describe,expect,it } from 'vitest'
import { buildHealthIntelligenceSnapshot,type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { focusHistoricalWeightEnergyDay } from '../src/domain/ask-health/focused-weight-energy-history.js'
import { focusWeightEnergyContext } from '../src/domain/ask-health/focused-weight-energy.js'
import { buildAskHealthEvidencePacket,packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-10-01',date='2026-10-03'
const row=(key:'body.weight_kg'|'nutrition.calories',day:string,value:number,quality:string,
  sourceIds=[key+day]):IntelligenceObservation=>({
    key,date:day,value,unit:key==='body.weight_kg'?'kg':'kcal',
    quality,provenance:'owner',sourceIds,
  })
function make(options:{unverified?:boolean,changedCalories?:number,missingWeight?:boolean,
  badIds?:boolean,conditions?:boolean,asOf?:string}={}){
  const observations:IntelligenceObservation[]=[
    ...(options.missingWeight?[]:[row('body.weight_kg',date,82.3,
      options.conditions?'different_conditions':'usual')]),
    row('nutrition.calories',date,options.changedCalories??2150,'high_confidence',
      options.badIds?['food1','food1']:['food1','food2']),
    row('body.weight_kg','2026-10-12',81.1,'usual'),
    row('nutrition.calories','2026-10-12',1900,'high_confidence'),
  ]
  return buildHealthIntelligenceSnapshot({range:'30d',start,
    end:options.asOf??today,asOf:options.asOf??today,today,timezone:'America/Phoenix',
    observations,nutritionVerifiedCompleteDates:
      options.unverified?new Set<string>():new Set([date,'2026-10-12']),
    nutritionVerificationStatus:'available'})
}
function render(question:string,options:Parameters<typeof make>[0]={},
  mode:'personalized'|'general_only'|'deep'='personalized'){
  const snapshot=make(options)
  const focusedWeightEnergyDay=mode==='general_only'?null:focusHistoricalWeightEnergyDay({question,snapshot,today})
  const focusedWeightEnergy=mode==='general_only'?null:focusWeightEnergyContext({
    question,snapshot,today,includeBroadContext:mode==='deep'})
  const input:AskHealthPacketInput={question,contextMode:mode,lens:'general',range:'30d',
    asOf:options.asOf??today,period:{start,end:options.asOf??today},
    generatedAt:today+'T18:00:00Z',overview:null,activity:null,sleep:null,
    goals:[],experiments:[],benchmarks:[],supplements:[],context:null,patterns:[],
    focusedWeightEnergy,focusedWeightEnergyDay}
  return {day:focusedWeightEnergyDay,packet:buildAskHealthEvidencePacket(input)}
}
describe('PIQ-4.2 historical one-day source boundary',()=>{
  it('cites exactly the requested source date, never later samples or inferred deficit',()=>{
    const r=render('What was my scale weight and calorie intake on 2026-10-03?')
    expect(r.day).toMatchObject({date,scope:'in_range',weightKg:82.3,
      weightConditions:'usual',verifiedCaloriesKcal:2150})
    const byId=(id:string)=>r.packet.evidence.find(x=>x.id===id)
    expect(byId('weight_energy.historical_day.weight')?.value).toBe(82.3)
    expect(byId('weight_energy.historical_day.calories')?.value).toBe(2150)
    expect(byId('weight_energy.historical_day.calories')?.period).toEqual({start:date,end:date})
    expect(r.packet.evidence.some(x=>x.id==='weight_energy.observed_balance')).toBe(false)
    expect(JSON.stringify(r.packet)).not.toContain('1900 kcal')
    expect(JSON.stringify(r.packet)).not.toContain('food1')
  })
  it('withholds unsupported calorie number on unverified days or inconsistent source IDs',()=>{
    for(const o of [{unverified:true},{badIds:true}]){
      const r=render('Was I in a calorie deficit on 2026-10-03?',o)
      expect(r.day?.verifiedCaloriesKcal).toBeNull()
      expect(r.packet.evidence.some(x=>x.id==='weight_energy.historical_day.calories')).toBe(false)
      expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_day.coverage')?.coverage)
        .toMatchObject({verifiedCompleteCalories:false})
    }
  })
  it('never substitutes later weight and identifies noncomparable conditions',()=>{
    expect(render('What did I weigh on 2026-10-03?',{missingWeight:true}).day?.weightKg)
      .toBeNull()
    const r=render('How much did I weigh on 2026-10-03?',{conditions:true})
    expect(r.day?.weightConditions).toBe('different_conditions')
    expect(r.packet.evidence.find(x=>x.id==='weight_energy.historical_day.weight')?.text)
      .toContain('conditions differed')
  })
  it('does not expose observations for out-of-range, future as-of or provisional today',()=>{
    for(const q of ['What was my weight on 2026-09-30?',
      'How many calories on 2026-10-20?','What was my weight today?']){
      const r=render(q)
      expect(r.day).not.toBeNull()
      expect(r.day?.scope).not.toBe('in_range')
      expect(r.packet.evidence.some(x=>x.id==='weight_energy.historical_day.weight'||
        x.id==='weight_energy.historical_day.calories')).toBe(false)
    }
    expect(render('How much did I weigh yesterday?',{asOf:'2026-10-10'}).day?.scope)
      .toBe('out_of_range')
  })
  it('never converts unsupported historical windows or two dates into one date',()=>{
    for(const q of ['How did my weight change last week?',
      'Was I in a calorie deficit last month?',
      'What did I weigh on 2026-10-03 and 2026-10-12?',
      'How much weight did I lose on 10/03/2026?',
      'What was my weight on 2026-02-30?']){
      const r=render(q)
      expect(r.day).toBeNull()
      expect(r.packet.evidence.some(x=>x.id.startsWith('weight_energy.historical_day.')))
        .toBe(false)
    }
  })
  it('keeps General Only and non-weight questions free of personal weight history',()=>{
    expect(render('What did I weigh on 2026-10-03?',{},'general_only').day).toBeNull()
    expect(render('How much water did I drink yesterday?').day).toBeNull()
    expect(render('What did I weigh on 2026-10-03?',{},'general_only').packet.evidence
      .some(x=>x.id.startsWith('weight_energy.historical_day.'))).toBe(false)
  })
  it('source correction changes the selected answer fingerprint',()=>{
    const before=render('How many calories on 2026-10-03?')
    const after=render('How many calories on 2026-10-03?',{changedCalories:2330})
    expect(packetFingerprintMaterial(before.packet)).not.toBe(packetFingerprintMaterial(after.packet))
    expect(after.day?.verifiedCaloriesKcal).toBe(2330)
  })
})
