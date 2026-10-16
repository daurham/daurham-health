import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot,type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { focusWeightEnergyContext } from '../src/domain/ask-health/focused-weight-energy.js'
import { buildAskHealthEvidencePacket,packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-09-01'
const dates=Array.from({length:28},(_,i)=>addCalendarDays('2026-09-18',i))
function sample(key:IntelligenceObservation['key'],date:string,value:number,quality?:string):IntelligenceObservation{
 const unit=key==='body.weight_kg'?'kg':key==='nutrition.calories'?'kcal':'count'
 return {key,date,value,unit,quality,provenance:'owner',sourceIds:[key+':'+date]}
}
function snapshot(opts:{missingFood?:boolean,unevenFood?:boolean,missingWeights?:boolean,changedConditions?:boolean,unknownVerification?:boolean,noise?:boolean}={}){
 const rows:IntelligenceObservation[]=dates.flatMap((day,i)=>{
   const items:IntelligenceObservation[]=[]
   if(!opts.missingFood && (!opts.unevenFood || i<14))
     items.push(sample('nutrition.calories',day,2300,'high_confidence'))
   if(!opts.missingWeights && (!opts.changedConditions || i>=22))
     items.push(sample('body.weight_kg',day,82+(i%3)*0.01,opts.changedConditions?'different_conditions':'usual'))
   if(i%3===0)items.push(sample('training.sessions',day,1))
   return items
 })
 return buildHealthIntelligenceSnapshot({
   range:'90d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
   observations:rows,
   nutritionVerifiedCompleteDates:opts.unknownVerification?undefined:
     new Set(opts.missingFood?[]:opts.unevenFood?dates.slice(0,14):dates),
   nutritionVerificationStatus:opts.unknownVerification?'unavailable':'available',
 })
}
function packet(question:string,opts:Parameters<typeof snapshot>[0]={},mode:'personalized'|'deep'|'general_only'='personalized'){
 const frame=snapshot(opts)
 const focusedWeightEnergy=mode==='general_only'?null:focusWeightEnergyContext({
   question,snapshot:frame,today,includeBroadContext:mode==='deep',
 })
 const input:AskHealthPacketInput={
   question,contextMode:mode,lens:'general',range:'90d',
   asOf:today,period:{start,end:today},generatedAt:today+'T18:00:00Z',
   overview:null,activity:null,sleep:null,goals:[],experiments:[],
   benchmarks:[],supplements:[],context:null,patterns:[],focusedWeightEnergy,
 }
 return {focusedWeightEnergy,packet:buildAskHealthEvidencePacket(input)}
}
describe('PIQ-4.2 verified weight/intake descriptive evidence (synthetic)',()=>{
 it('reuses aligned and revision-verified complete days for a bounded estimate; never issues a calorie target',()=>{
   const f=packet('Why has my weight loss stalled?')
   expect(f.focusedWeightEnergy?.estimate).toMatchObject({
     state:'available',period:{days:28},quality:{nutrition:{reliableDays:28}},
   })
   const id=f.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')
   expect(id?.value).toBeGreaterThan(0)
   expect(id?.coverage).toMatchObject({verifiedCompleteCalorieDays:28,selectedWindowDays:28})
   expect(id?.text).toContain('NOT a measured TDEE')
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.decision_boundary')?.text)
     .toContain('CANNOT classify an owner-specific weight-loss plateau')
   expect(f.packet.evidence.some(e=>e.id.startsWith('weight_energy.calorie_adjustment'))).toBe(false)
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.decision_boundary')?.coverage)
     .toMatchObject({goalVerification:'not_checked',strengthPreservation:'not_verified'})
 })
 it('withholds the computed value when independent whole-day confirmation is unavailable',()=>{
   const f=packet('Am I in a calorie deficit?',{unknownVerification:true})
   expect(f.focusedWeightEnergy?.estimate.state).toBe('insufficient_evidence')
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')).toBeUndefined()
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.quality')?.substantive).toBe(false)
   expect(JSON.stringify(f.packet)).not.toContain('estimated kcal/day')
 })
 it('does not hide obsolete early-only calorie coverage behind a sufficient total row count',()=>{
   const f=packet('Am I plateauing?',{unevenFood:true})
   expect(f.focusedWeightEnergy?.estimate.state).toBe('insufficient_evidence')
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')).toBeUndefined()
   expect(f.packet.evidence.find(e=>e.id==='weight_energy.quality')?.text)
     .toContain('withheld')
 })
 it('preserves a legitimate shorter eligible observation window rather than requiring all 28 days',()=>{
   const base=snapshot()
   const freshOnly=buildHealthIntelligenceSnapshot({
     range:'90d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
     observations:base.frame.flatMap(day=>Object.values(day.signals).filter((o):o is IntelligenceObservation=>
       o!=null && (o.key!=='nutrition.calories' || o.date>=dates[14]!))),
     nutritionVerifiedCompleteDates:new Set(dates.slice(14)),
     nutritionVerificationStatus:'available',
   })
   const focus=focusWeightEnergyContext({
     question:'Why has my weight loss stalled?',snapshot:freshOnly,today,
   })
   expect(focus?.estimate.state).toBe('available')
   expect(focus?.estimate.period?.days).toBe(14)
   expect(focus?.qualifiedWholeDayCalories).toBe(14)
 })
 it('rejects absent and incomparable weigh-ins rather than assuming stable weight',()=>{
   for(const options of [{missingWeights:true},{changedConditions:true}]){
     const f=packet('Is my scale weight stalling?',options)
     expect(f.focusedWeightEnergy?.estimate.state).toBe('insufficient_evidence')
     expect(f.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')).toBeUndefined()
   }
 })
 it('never leaks a trailing estimate into a historical-day or last-week question',()=>{
   for(const q of ['What was my weight loss on 2026-09-25?',
     'Why did my scale stall last week?', 'Did I have a deficit yesterday?']){
     expect(packet(q).focusedWeightEnergy).toBeNull()
     expect(packet(q).packet.evidence.some(e=>e.id.startsWith('weight_energy.'))).toBe(false)
   }
 })
 it('minimum-necessary and explicit broad mode preserve question relevance and general privacy',()=>{
   expect(packet('How much did I weigh?',{}).focusedWeightEnergy).toBeNull()
   expect(packet('What should I know about my health?',{},'personalized').focusedWeightEnergy).toBeNull()
   expect(packet('What should I know about my health?',{},'deep').focusedWeightEnergy).not.toBeNull()
   const general=packet('Is my weight loss plateauing?',{},'general_only')
   expect(general.packet.evidence.some(e=>e.id.startsWith('weight_energy.'))).toBe(false)
 })
 it('packet fingerprint changes on new verified evidence, without another model or DB query',()=>{
   const a=packet('Why is my weight loss stalled?')
   const b=packet('Why is my weight loss stalled?',{missingFood:true})
   expect(packetFingerprintMaterial(a.packet)).not.toBe(packetFingerprintMaterial(b.packet))
   expect(a.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')).toBeDefined()
   expect(b.packet.evidence.find(e=>e.id==='weight_energy.observed_balance')).toBeUndefined()
 })
})
