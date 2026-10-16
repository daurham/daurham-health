import type {GoalRead} from '../../../server/ask-health/current-weight-goal.js'
import type {CurrentPrimaryIntentRead} from '../../../server/ask-health/current-primary-goal-intent.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'

/** A priority attestation, NOT goal target achievement or an intervention gate. */
export type PrimaryWeightGoalPriority = {
  state:'not_checked'|'unavailable'|'not_set'|'explicitly_cleared'|
    'selected_active_weight_goal'|'selected_goal_not_active_weight'
}
export const UNCHECKED_PRIMARY_WEIGHT_GOAL_PRIORITY:PrimaryWeightGoalPriority={
  state:'not_checked',
}

/** Current revision must bind the explicit intent AND the active weight-goal
 * version together; never promote guessed priorities or absent SQL to a choice.
 */
export function screenPrimaryWeightGoalPriority(input:{
  asOf:string
  settings:WeightEnergyCurrentSettings
  goal:GoalRead|null
  primary:CurrentPrimaryIntentRead|null
}):PrimaryWeightGoalPriority{
  const missing:PrimaryWeightGoalPriority={state:'unavailable'}
  if(input.settings.state==='not_checked')return{state:'not_checked'}
  if(input.settings.state!=='consistent_read'||
     input.goal?.status!=='available'||input.primary?.status!=='available')
    return missing
  const rows=input.goal.rows
  if(rows.length>1)return missing
  const choice=input.primary.intent
  if(choice.source==='unset'){
    return choice.version===0 && choice.primaryGoalId==null && choice.effectiveFrom==null
      ?{state:'not_set'}:missing
  }
  if(choice.source!=='owner'||!Number.isSafeInteger(choice.version)||
    choice.version<=0||!choice.effectiveFrom||
    choice.effectiveFrom>input.asOf)return missing
  if(choice.primaryGoalId===null)return{state:'explicitly_cleared'}
  if(typeof choice.primaryGoalId!=='string'||!choice.primaryGoalId.trim())return missing
  const activeWeight=rows[0]
  if(activeWeight && (!activeWeight.id?.trim()||!activeWeight.versionId?.trim()))
    return missing
  return {
    state:activeWeight?.id===choice.primaryGoalId
      ?'selected_active_weight_goal'
      :'selected_goal_not_active_weight',
  }
}
