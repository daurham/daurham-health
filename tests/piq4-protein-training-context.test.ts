import { describe,expect,it } from 'vitest'
import { buildHealthIntelligenceSnapshot,type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { screenProteinTrainingContext } from '../src/domain/ask-health/protein-training-context.js'
import { focusWeightEnergyContext } from '../src/domain/ask-health/focused-weight-energy.js'
import { buildAskHealthEvidencePacket,packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const today='2026-10-16',start='2026-09-01'
const days=Array.from({length:28},(_,i)=>addCalendarDays('2026-09-18',i))
type Options={badProteinIds?:boolean,duplicateProteinIds?:boolean,
  unverifiedProtein?:boolean,scatteredProtein?:boolean,
  noTrainingIds?:boolean,missingCalories?:boolean,todayFake?:boolean}
function data(opts:Options={}){
 const records:IntelligenceObservation[]=days.flatMap((date,i)=>{
  const foodIds=['food:'+date]
  const calories:IntelligenceObservation={key:'nutrition.calories',date,value:2200,unit:'kcal',
    provenance:'owner',quality:'high_confidence',sourceIds:foodIds}
  const protein:IntelligenceObservation={key:'nutrition.protein_g',date,value:130,unit:'g',
    provenance:'owner',quality:'high_confidence',sourceIds:opts.badProteinIds?['other:'+date]:
      opts.duplicateProteinIds?['food:'+date,'food:'+date]:foodIds}
  const training:IntelligenceObservation={key:'training.sessions',date,value:1,unit:'sessions',
    provenance:'owner',sourceIds:opts.noTrainingIds?[]:['session:'+date]}
  const weight:IntelligenceObservation={key:'body.weight_kg',date,value:82+(i%3)*0.01,
    unit:'kg',provenance:'owner',quality:'usual',sourceIds:['weight:'+date]}
  return [...(opts.missingCalories?[]:[calories]),
    ...(!opts.scatteredProtein||i<3?[protein]:[]),
    ...(i%3===0?[training]:[]),weight]
 })
 if(opts.todayFake){
  records.push({key:'nutrition.calories',date:today,value:5500,unit:'kcal',
    provenance:'owner',quality:'high_confidence',sourceIds:['today-food']},
    {key:'nutrition.protein_g',date:today,value:999,unit:'g',
      provenance:'owner',quality:'high_confidence',sourceIds:['today-food']},
    {key:'training.sessions',date:today,value:10,unit:'sessions',
      provenance:'owner',sourceIds:['today-session']})
 }
 const verified=new Set(opts.missingCalories?[]:
  opts.unverifiedProtein?days.slice(0,3):days)
 if(opts.todayFake)verified.add(today)
 const snapshot=buildHealthIntelligenceSnapshot({
  range:'90d',start,end:today,asOf:today,today,timezone:'America/Phoenix',
  observations:records,nutritionVerifiedCompleteDates:verified,
  nutritionVerificationStatus:'available',
 })
 return {snapshot,verified}
}
function inspect(opts:Options={},question='Why has my weight loss stalled?',
  contextMode:'personalized'|'deep'|'general_only'='personalized'){
 const x=data(opts)
 const focus=contextMode==='general_only'?null:focusWeightEnergyContext({
  question,snapshot:x.snapshot,today,includeBroadContext:contextMode==='deep',
 })
 const input:AskHealthPacketInput={question,contextMode,lens:'general',range:'90d',
  asOf:today,period:{start,end:today},generatedAt:today+'T18:00:00Z',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],benchmarks:[],
  supplements:[],context:null,patterns:[],focusedWeightEnergy:focus}
 return {focus,packet:buildAskHealthEvidencePacket(input)}
}
describe('PIQ-4.2 recorded protein and training context is NOT strength preservation',()=>{
 it('shows matched owner-confirmed protein days only as non-substantive descriptive coverage',()=>{
  const result=inspect()
  expect(result.focus?.proteinTrainingContext).toMatchObject({
   verifiedProteinDays:28,verifiedMeanProteinG:130,
   verifiedCalorieDaysInWindow:28,sourceIdentifiedTrainingDays:10,
   trainingDaysWithoutSourceIdentity:0,strengthOutcome:'not_verified',
  })
  const item=result.packet.evidence.find(e=>e.id==='weight_energy.protein_training_context')
  expect(item?.substantive).toBe(false)
  expect(item?.value).toBeNull()
  expect(item?.coverage).toMatchObject({
   verifiedWholeDayProteinDates:28,observedSourceIdentifiedTrainingDates:10,
   proteinContextStatus:'descriptive_window',
  })
  expect(item?.text).toContain('not a mean across every calendar date')
  const bound=result.packet.evidence.find(e=>e.id==='weight_energy.training_preservation_boundary')
  expect(bound?.text).toContain('does NOT establish comparable')
  expect(bound?.text).toContain('calorie-cut recommendation remains unauthorized')
  expect(result.packet.evidence.find(e=>e.id==='weight_energy.decision_boundary')?.coverage)
   .toMatchObject({goalVerification:'not_checked',strengthPreservation:'not_verified'})
 })
 it('fails closed for mismatched or duplicate protein entry IDs',()=>{
  for(const opts of [{badProteinIds:true},{duplicateProteinIds:true}]){
   const x=inspect(opts)
   expect(x.focus?.proteinTrainingContext).toMatchObject({
    verifiedProteinDays:0,verifiedMeanProteinG:null,
    proteinCoverage:'insufficient_or_unverified',
   })
   expect(x.packet.evidence.find(e=>e.id==='weight_energy.protein_training_context')?.text)
    .toContain('UNKNOWN, not zero')
  }
 })
 it('cannot convert 3 unverified or sparse dates into a reliable protein average',()=>{
  for(const opts of [{unverifiedProtein:true},{scatteredProtein:true}]){
   const x=inspect(opts)
   expect(x.focus?.proteinTrainingContext).toMatchObject({
    verifiedProteinDays:3,verifiedMeanProteinG:null,
   })
  }
 })
 it('rejects a nutrient without a matching verified calorie source even if high confidence',()=>{
  const x=inspect({missingCalories:true})
  expect(x.focus?.proteinTrainingContext).toMatchObject({
   verifiedProteinDays:0,verifiedCalorieDaysInWindow:0,verifiedMeanProteinG:null,
  })
 })
 it('source-unattributed training dates cannot support a counted participation claim',()=>{
  const x=inspect({noTrainingIds:true})
  expect(x.focus?.proteinTrainingContext).toMatchObject({
   sourceIdentifiedTrainingDays:0,trainingDaysWithoutSourceIdentity:10,
   strengthOutcome:'not_verified',
  })
  const context=x.packet.evidence.find(e=>e.id==='weight_energy.training_preservation_boundary')
  expect(context?.coverage).toMatchObject({
   sourceIdentifiedTrainingDays:0,unattributedPositiveTrainingSignalDays:10,
  })
 })
 it('current-day provisional protein and training do not inflate completed-window context',()=>{
  const x=inspect({todayFake:true})
  expect(x.focus?.proteinTrainingContext).toMatchObject({
   verifiedProteinDays:28,verifiedMeanProteinG:130,sourceIdentifiedTrainingDays:10,
  })
  expect(JSON.stringify(x.packet.evidence.filter(e=>e.id.startsWith('weight_energy.'))))
   .not.toContain('999 g')
 })
 it('never leaks current protein context into historical questions or General Only',()=>{
  for(const q of ['How much protein and weight yesterday?',
   'Why did my scale stall last week?']){
   const x=inspect({},q)
   expect(x.focus).toBeNull()
   expect(x.packet.evidence.some(e=>e.id==='weight_energy.protein_training_context'))
    .toBe(false)
  }
  expect(inspect({},'Why has my weight stalled?','general_only')
   .packet.evidence.some(e=>e.id.startsWith('weight_energy.'))).toBe(false)
 })
 it('cache fingerprint tracks a change in verified recorded protein identity/quality',()=>{
  const a=inspect()
  const b=inspect({badProteinIds:true})
  expect(packetFingerprintMaterial(a.packet)).not.toBe(packetFingerprintMaterial(b.packet))
 })
 it('standalone source gate cannot claim a strength outcome without a strength series',()=>{
  const x=data()
  const f=screenProteinTrainingContext({
   snapshot:x.snapshot,start:'2026-09-18',end:'2026-10-15',
   today,verifiedCalorieDates:x.verified,
  })
  expect(f.strengthOutcome).toBe('not_verified')
 })
})
