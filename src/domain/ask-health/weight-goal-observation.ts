import { addCalendarDays } from '../training-plan.js'
import type { HealthIntelligenceSnapshot } from '../intelligence/shared.js'
import type { GoalRead } from '../../../server/ask-health/current-weight-goal.js'
import type { WeightEnergyCurrentSettings } from './weight-energy-current-settings.js'

/**
 * PIQ-4.2. A *descriptive* comparison of three recent, provenance-identifiable,
 * usual-condition weight records against one revision-attested goal boundary.
 * It does NOT evaluate canonical Goal Control status, establish a plateau, or
 * determine whether calorie reduction is safe. The body records themselves
 * are not independently revision-locked and may subsequently change.
 */
export type WeightGoalObservation = {
  state: 'not_checked' | 'unavailable' | 'no_active_goal' |
    'insufficient_comparable_weights' | 'mixed_recorded_sides' |
    'all_recorded_above_boundary' | 'all_recorded_below_boundary' |
    'all_recorded_within_boundary'
  comparableWeightDays: number | null
  sampledSpanDays: number | null
}
export const UNCHECKED_WEIGHT_GOAL_OBSERVATION:WeightGoalObservation={
  state:'not_checked',comparableWeightDays:null,sampledSpanDays:null,
}
const diff=(start:string,end:string)=>Math.round(
  (Date.parse(end+'T00:00:00Z')-Date.parse(start+'T00:00:00Z'))/86400000)

export function screenWeightGoalObservation(input:{
  asOf:string;today:string;snapshot:HealthIntelligenceSnapshot
  read:GoalRead|null;settings:WeightEnergyCurrentSettings
}):WeightGoalObservation{
  const unavailable:WeightGoalObservation={
    state:'unavailable',comparableWeightDays:null,sampledSpanDays:null,
  }
  if(input.asOf!==input.today || input.snapshot.asOf!==input.asOf ||
     input.settings.state!=='consistent_read'||input.read?.status!=='available')
    return unavailable
  if(input.read.rows.length===0)return{
    state:'no_active_goal',comparableWeightDays:null,sampledSpanDays:null,
  }
  if(input.read.rows.length!==1)return unavailable
  const goal=input.read.rows[0]!
  const boundOk=(x:number|null)=>x!=null&&Number.isFinite(x)&&x>0
  if(!goal.id?.trim()||!goal.versionId?.trim()||
    !(goal.targetMode==='at_most'&&boundOk(goal.targetMaxKg)||
      goal.targetMode==='at_least'&&boundOk(goal.targetMinKg)||
      goal.targetMode==='range'&&boundOk(goal.targetMinKg)&&boundOk(goal.targetMaxKg)&&
        goal.targetMinKg!<=goal.targetMaxKg!))
    return unavailable
  const from=addCalendarDays(input.asOf,-20)
  const weights=input.snapshot.frame.flatMap(day=>{
    const row=day.signals['body.weight_kg']
    if(!row||day.date<from||day.date>input.asOf||
       day.date<input.snapshot.period.start||day.date>input.snapshot.period.end||
       row.date!==day.date||row.unit!=='kg'||row.quality!=='usual'||
       (row.provenance!=='owner'&&row.provenance!=='device')||
       !Number.isFinite(row.value)||row.value<=0||
       row.sourceIds.length===0||
       row.sourceIds.some(id=>typeof id!=='string'||!id.trim())||
       new Set(row.sourceIds).size!==row.sourceIds.length)
       return []
    return [{date:day.date,weightKg:row.value}]
  }).sort((a,b)=>a.date.localeCompare(b.date)).slice(-3)
  const start=weights[0]?.date,end=weights[weights.length-1]?.date
  const span=start&&end?diff(start,end):0
  if(weights.length<3||span<6||!end||diff(end,input.asOf)>7)
    return{state:'insufficient_comparable_weights',
      comparableWeightDays:weights.length,sampledSpanDays:span}
  const states=weights.map(({weightKg})=>{
    if(goal.targetMode==='at_most')
      return weightKg>goal.targetMaxKg!?'above':'within'
    if(goal.targetMode==='at_least')
      return weightKg<goal.targetMinKg!?'below':'within'
    return weightKg<goal.targetMinKg!?'below':weightKg>goal.targetMaxKg!?'above':'within'
  })
  const same=states.every(x=>x===states[0])
  return{
    state:!same?'mixed_recorded_sides':
      states[0]==='above'?'all_recorded_above_boundary':
      states[0]==='below'?'all_recorded_below_boundary':
      'all_recorded_within_boundary',
    comparableWeightDays:weights.length,sampledSpanDays:span,
  }
}
