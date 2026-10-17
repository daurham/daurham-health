import { describe,expect,it } from 'vitest'
import { buildHealthIntelligenceSnapshot,type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { focusWeightEnergyContext } from '../src/domain/ask-health/focused-weight-energy.js'
import { buildAskHealthEvidencePacket,packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16'
const start='2026-09-01'
const days=Array.from({length:28},(_,i)=>addCalendarDays('2026-09-18',i))
type Options={
  unverifiedRecent?:boolean
  wrongNutrientIds?:boolean
  noNutrients?:boolean
  earlyOnly?:boolean
  currentDayRise?:boolean
}
function item(key:IntelligenceObservation['key'],date:string,value:number,ids:string[]):IntelligenceObservation {
  return {key,date,value,
    unit:key==='body.weight_kg'?'kg':key==='nutrition.sodium_mg'?'mg':
      key==='nutrition.carbs_g'?'g':key==='hydration.ml'?'ml':key==='nutrition.calories'?'kcal':'count',
    provenance:'owner',sourceIds:ids,
    quality:key==='body.weight_kg'?'usual':'high_confidence'}
}
function build(opts:Options={}){
  const fullDays=opts.unverifiedRecent?days.slice(0,-3):days
  const data=days.flatMap((date,i)=>{
    const recent=i>=25
    const foodIds=['food:'+date]
    const nutrition=opts.earlyOnly && recent?[]:[item('nutrition.calories',date,2100,foodIds)]
    const nutrientIds=opts.wrongNutrientIds&&recent?['different-food:'+date]:foodIds
    if(!opts.noNutrients){
      nutrition.push(
        item('nutrition.sodium_mg',date,recent?2600:1700,nutrientIds),
        item('nutrition.carbs_g',date,recent?240:140,nutrientIds),
      )
    }
    return [
      ...nutrition,
      item('body.weight_kg',date,83+(i%3)*0.01,['weight:'+date]),
      item('hydration.ml',date,recent?2000:500,['water:'+date]),
      item('bowel.count',date,recent?0:2,recent?[]:['bowel:'+date]),
    ]
  })
  if(opts.currentDayRise){
    const ids=['today-food']
    data.push(item('nutrition.calories',today,2500,ids),
      item('nutrition.sodium_mg',today,7200,ids),
      item('nutrition.carbs_g',today,900,ids))
  }
  return buildHealthIntelligenceSnapshot({
    range:'90d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
    observations:data,nutritionVerifiedCompleteDates:new Set(fullDays),
    nutritionVerificationStatus:'available',
  })
}
function evaluate(opts:Options={},q='Why has my weight loss stalled?',mode:'personalized'|'deep'|'general_only'='personalized'){
 const snapshot=build(opts)
 const focusedWeightEnergy=mode==='general_only'?null:focusWeightEnergyContext({
   snapshot,question:q,today,includeBroadContext:mode==='deep',
 })
 const packet=buildAskHealthEvidencePacket({
   question:q,contextMode:mode,lens:'general',range:'90d',asOf:today,
   generatedAt:today+'T18:00:00Z',period:{start,end:today},
   overview:null,activity:null,sleep:null,goals:[],experiments:[],
   benchmarks:[],supplements:[],context:null,patterns:[],focusedWeightEnergy,
 } as AskHealthPacketInput)
 return {focus:focusedWeightEnergy,packet}
}
describe('PIQ-4.2 validated alternative scale-noise context, no causal authority',()=>{
 it('reports source-matched, verified sodium and carbohydrate changes as non-causal context',()=>{
   const x=evaluate()
   expect(x.focus?.qualifiedScaleContext.map(f=>f.kind))
     .toEqual(['sodium','carbohydrate'])
   const e=x.packet.evidence.find(e=>e.id==='weight_energy.scale_context')
   expect(e?.substantive).toBe(false)
   expect(e?.value).toBeNull()
   expect(e?.coverage).toMatchObject({
     status:'qualified_logging_context',verifiedNutrientShiftCount:2,
     recentWindowDays:3,baselineWindowDays:7,
   })
   expect(e?.text).toContain('owner-confirmed, source-reliable')
   expect(e?.text).toContain('NOT demonstrated causes')
   expect(e?.text).toContain('cannot establish whole-day completeness')
   expect(e?.text).not.toMatch(/you have retained|you gained fat|reduce your calories/i)
   expect(x.packet.evidence.some(e=>e.id==='weight_energy.calorie_adjustment')).toBe(false)
 })
 it('ignores logged-water and event-only bowel shifts regardless of their apparent magnitude',()=>{
   const x=evaluate({noNutrients:true})
   expect(x.focus?.qualifiedScaleContext).toEqual([])
   const evidence=x.packet.evidence.find(e=>e.id==='weight_energy.scale_context')
   expect(evidence?.text).toContain('does NOT establish stable')
   expect(evidence?.coverage).toMatchObject({status:'no_qualified_comparison',
     verifiedNutrientShiftCount:0})
   expect(JSON.stringify(evidence)).not.toContain('Logged water changed recently')
   expect(JSON.stringify(evidence)).not.toContain('Bowel frequency is lower')
 })
 it('rejects recent nutrient change without independently owner-complete days',()=>{
   const x=evaluate({unverifiedRecent:true})
   expect(x.focus?.qualifiedScaleContext).toEqual([])
   expect(x.packet.evidence.find(e=>e.id==='weight_energy.scale_context')?.coverage)
     .toMatchObject({status:'no_qualified_comparison'})
 })
 it('rejects nonmatching calorie-to-nutrient source IDs even when each daily value is high quality',()=>{
   const x=evaluate({wrongNutrientIds:true})
   expect(x.focus?.qualifiedScaleContext).toEqual([])
 })
 it('cannot use provisional today to satisfy a nutrient shift in an otherwise unqualified window',()=>{
   const x=evaluate({earlyOnly:true,currentDayRise:true})
   expect(x.focus?.qualifiedScaleContext).toEqual([])
 })
 it('history and General Only still cannot expose short-term nutrient comparisons',()=>{
   expect(evaluate({},'Why did my weight stall last week?').focus).toBeNull()
   expect(evaluate({},'Why did my weight stall on 2026-10-12?').focus).toBeNull()
   const g=evaluate({},'Why has my weight loss stalled?','general_only')
   expect(g.packet.evidence.some(e=>e.id.startsWith('weight_energy.'))).toBe(false)
 })
 it('evidence and cache fingerprint change with qualified recent sources',()=>{
   const qualified=evaluate()
   const missing=evaluate({wrongNutrientIds:true})
   expect(packetFingerprintMaterial(qualified.packet)).not.toBe(packetFingerprintMaterial(missing.packet))
 })
 it('does not describe same-day or earlier scale readings as a later response',()=>{
   const r=evaluate()
   const evidence=r.packet.evidence.find(x=>x.id==='weight_energy.scale_context')!
   expect(evidence.coverage).toMatchObject({
     sodiumScaleTiming:'no_later_scale_record',
     carbohydrateScaleTiming:'no_later_scale_record',
   })
   expect(evidence.text).toContain('no usual-condition scale record exists on a later calendar day')
   expect(evidence.text).toContain('Same-day food totals cannot be ordered')
   expect(evidence.text).not.toContain('you retained fluid')
 })
 it('keeps general-only and explicitly historical weight questions outside chronology',()=>{
   const historical=evaluate({},'Why did my scale stall last week?')
   expect(historical.focus).toBeNull()
   const general=evaluate({},'Why has my weight loss stalled?','general_only')
   expect(general.packet.evidence.some(x=>x.id==='weight_energy.scale_context')).toBe(false)
 })

})
