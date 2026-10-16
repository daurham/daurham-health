import { describe, it, expect } from 'vitest'
import { buildHealthIntelligenceSnapshot,type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { screenWeightGoalObservation } from '../src/domain/ask-health/weight-goal-observation.js'
import { focusWeightEnergyContext } from '../src/domain/ask-health/focused-weight-energy.js'
import { buildAskHealthEvidencePacket,packetFingerprintMaterial } from '../src/domain/ask-health/packet.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'
import type { WeightEnergyCurrentSettings } from '../src/domain/ask-health/weight-energy-current-settings.js'
import type { GoalRead } from '../server/ask-health/current-weight-goal.js'

const today='2026-10-16'
const settings:WeightEnergyCurrentSettings={
 state:'consistent_read',calorieTargetState:'configured',relevantExperimentCount:0,
 weightGoalMode:'at_most',
}
const weightGoal:GoalRead={status:'available',rows:[{
 id:'private-goal',versionId:'private-version',targetMode:'at_most',
 targetMinKg:null,targetMaxKg:80,
}]}
const recentDates=['2026-10-02','2026-10-08','2026-10-15']
function snapshot(values=[83,82,81],days=recentDates,quality='usual',provenance:'owner'|'unknown'='owner'){
 const rows:IntelligenceObservation[]=values.map((value,i)=>({
  key:'body.weight_kg',date:days[i]!,value,unit:'kg',provenance,quality,
  sourceIds:['private-weight-'+i],
 }))
 return buildHealthIntelligenceSnapshot({
  range:'90d',start:'2026-09-01',end:today,asOf:today,today,
  timezone:'America/Phoenix',observations:rows,
 })
}
function get(values=[83,82,81],opts?:{
  days?:string[];quality?:string;provenance?:'owner'|'unknown';
  read?:GoalRead|null;settings?:WeightEnergyCurrentSettings;asOf?:string
}){
 const records=snapshot(values,opts?.days,opts?.quality,opts?.provenance)
 return screenWeightGoalObservation({
  asOf:opts?.asOf??today,today,snapshot:records,
  read:opts?.read===undefined?weightGoal:opts.read,
  settings:opts?.settings??settings,
 })
}
function packet(values=[83,82,81]){
 const snap=snapshot(values)
 const focus=focusWeightEnergyContext({question:'Why has my weight loss stalled?',snapshot:snap,today})
 expect(focus).not.toBeNull()
 focus!.weightGoalObservation=get(values)
 const args:AskHealthPacketInput={
  question:'Why has my weight loss stalled?',contextMode:'personalized',
  lens:'general',range:'90d',asOf:today,
  period:{start:'2026-09-01',end:today},generatedAt:today+'T17:00:00Z',
  overview:null,activity:null,sleep:null,goals:[],experiments:[],
  benchmarks:[],supplements:[],context:null,patterns:[],
  focusedWeightEnergy:focus,
 }
 return buildAskHealthEvidencePacket(args)
}
describe('PIQ-4.2 evidence-bounded goal-weight observation (synthetic)',()=>{
 it('describes 3 usual source-identified measurements above an at-most boundary',()=>{
  const r=get()
  expect(r).toEqual({state:'all_recorded_above_boundary',comparableWeightDays:3,sampledSpanDays:13})
  const f=packet().evidence.find(x=>x.id==='weight_energy.goal_observation')
  expect(f?.substantive).toBe(false)
  expect(f?.text).toContain('above the current goal boundary')
  expect(f?.text).toContain('not a determination of Goal Control')
  expect(JSON.stringify(f)).not.toContain('private-goal')
  expect(JSON.stringify(f)).not.toContain('private-weight')
  expect(JSON.stringify(f)).not.toContain('83')
  expect(JSON.stringify(f)).not.toContain('80')
 })
 it('does not infer stable goal achievement from mixed or all-within observations',()=>{
  expect(get([79,81,79]).state).toBe('mixed_recorded_sides')
  expect(get([78,79,79]).state).toBe('all_recorded_within_boundary')
  const msg=packet([78,79,79]).evidence.find(x=>x.id==='weight_energy.goal_observation')?.text
  expect(msg).toContain('not a determination of Goal Control target status')
  expect(msg).toContain('not independently revision-attested')
 })
 it('supports at-least and range boundaries without misclassifying opposite direction',()=>{
  const atLeast:GoalRead={status:'available',rows:[{
   ...weightGoal.rows[0]!,targetMode:'at_least',targetMinKg:85,targetMaxKg:null,
  }]}
  const range:GoalRead={status:'available',rows:[{
   ...weightGoal.rows[0]!,targetMode:'range',targetMinKg:78,targetMaxKg:80,
  }]}
  expect(get([81,82,83],{read:atLeast}).state).toBe('all_recorded_below_boundary')
  expect(get([81,82,83],{read:range}).state).toBe('all_recorded_above_boundary')
 })
 it('withholds a relation for stale, partial, unknown or unreliable measurements',()=>{
  expect(get([81,82],{days:recentDates.slice(0,2)}).state).toBe('insufficient_comparable_weights')
  expect(get([81,82,83],{days:['2026-09-30','2026-10-01','2026-10-02']}).state)
    .toBe('insufficient_comparable_weights')
  expect(get([81,82,83],{days:['2026-10-14','2026-10-15','2026-10-16']}).state)
    .toBe('insufficient_comparable_weights')
  expect(get([81,82,83],{quality:'different_conditions'}).state)
    .toBe('insufficient_comparable_weights')
  expect(get([81,82,83],{provenance:'unknown'}).state)
    .toBe('insufficient_comparable_weights')
  expect(get([81,82,83],{settings:{...settings,state:'changed_during_read'}}).state)
    .toBe('unavailable')
  expect(get([81,82,83],{asOf:'2026-10-10'}).state).toBe('unavailable')
 })
 it('does not infer goal status when no or multiple active goals are verified',()=>{
  expect(get([81,82,83],{read:{status:'available',rows:[]}}).state).toBe('no_active_goal')
  expect(get([81,82,83],{read:{status:'available',rows:[
   weightGoal.rows[0]!,weightGoal.rows[0]!,
  ]}}).state).toBe('unavailable')
  expect(get([81,82,83],{read:null}).state).toBe('unavailable')
  expect(get([81,82,83],{read:{status:'unavailable',rows:[]}}).state).toBe('unavailable')
 })
 it('changes deterministic packet fingerprint when qualified relation changes',()=>{
  expect(packetFingerprintMaterial(packet([83,82,81])))
   .not.toBe(packetFingerprintMaterial(packet([78,79,79])))
 })
})
