import type {AskGoalInput} from './types.js'
import type {GoalRead} from '../../../server/ask-health/current-weight-goal.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'
import type {WeightGoalObservation} from './weight-goal-observation.js'
import type {PrimaryWeightGoalPriority} from './primary-weight-goal-intent.js'
import type {WeightPointSourceRead} from '../../../server/ask-health/current-weight-point-source.js'
import type {WeightProjectionSourceRead} from '../../../server/ask-health/current-weight-projection-source.js'

export type CanonicalGoalStatusReview={
  state:'not_checked'|'unavailable'|'primary_not_weight'|'version_mismatch'|
    'canonical_target_unknown'|'canonical_reported'|'measurement_disagreement'|
    'measurement_source_changed'|'measurement_source_unavailable'|
    'projection_source_changed'|'projection_source_unavailable'
  /** Goal Control's current read is a REPORT, not a separately locked measurement. */
  targetReport:'withheld'|'unknown'|'satisfied'|'above_target'|'below_target'|
    'outside_range_low'|'outside_range_high'
  deadlineAttention:'withheld'|'none_or_currently_satisfied'|'future_or_projection'|
    'due_today_reported_unmet'|'due_today_missing_measurement'|
    'past_reported_satisfied'|'past_reported_unmet'|'past_missing_measurement'
  measurementRevision:'not_attested'|'latest_point_rechecked'|'changed_or_unavailable'
  projectionRevision:'not_attested'|'complete_series_rechecked'|
    'empty_series_rechecked'|'changed_or_unavailable'
  intervention:'not_authorized'
}
export const UNCHECKED_CANONICAL_GOAL_STATUS:CanonicalGoalStatusReview={
  state:'not_checked',targetReport:'withheld',deadlineAttention:'withheld',
  measurementRevision:'not_attested',projectionRevision:'not_attested',
  intervention:'not_authorized',
}
const unknown:CanonicalGoalStatusReview={
  ...UNCHECKED_CANONICAL_GOAL_STATUS,state:'unavailable',
}
const targetCompatible=(mode:string,state:string)=>
  state==='unknown'||state==='satisfied'||
  (mode==='at_most'&&state==='above_target')||
  (mode==='at_least'&&state==='below_target')||
  (mode==='range'&&(state==='outside_range_low'||state==='outside_range_high'))

/**
 * Confirm the identity AND current version of the same goal across canonical
 * Goal Control and the maintenance decision view. Goal Control's point
 * measurements are not atomically revision-locked with that decision view.
 * Thus canonical target/deadline labels remain descriptive, never action-ready.
 */
export function reviewCanonicalSelectedGoal(input:{
  asOf:string;today:string;settings:WeightEnergyCurrentSettings
  priority:PrimaryWeightGoalPriority;read:GoalRead|null
  snapshots:readonly AskGoalInput[]
  observation:WeightGoalObservation
  /** Optional for old test fixtures; production always supplies recheck. */
  sourceRead?:WeightPointSourceRead|null
  /** Optional for earlier isolated tests; production always supplies both reads. */
  projectionSourceRead?:WeightProjectionSourceRead|null
}):CanonicalGoalStatusReview{
  if(input.asOf!==input.today)return {...unknown}
  if(input.settings.state==='not_checked')return {...UNCHECKED_CANONICAL_GOAL_STATUS}
  if(input.settings.state!=='consistent_read')return {...unknown}
  if(input.priority.state==='not_set'||input.priority.state==='explicitly_cleared'||
     input.priority.state==='selected_goal_not_active_weight')
    return {...UNCHECKED_CANONICAL_GOAL_STATUS,state:'primary_not_weight'}
  if(input.priority.state!=='selected_active_weight_goal'||input.read?.status!=='available')
    return {...unknown}
  if(input.read.rows.length!==1||!['at_most','at_least','range'].includes(
    input.read.rows[0]!.targetMode))return {...unknown}
  const goal=input.read.rows[0]!
  if(!goal.id?.trim()||!goal.versionId?.trim()||
     input.settings.weightGoalMode!==goal.targetMode)return {...unknown}
  const matches=input.snapshots.filter(x=>x.id===goal.id)
  if(matches.length!==1)return {...UNCHECKED_CANONICAL_GOAL_STATUS,state:'version_mismatch'}
  const canonical=matches[0]!
  if(canonical.kind!=='body_metric'||canonical.lifecycle!=='active'||
     !canonical.versionId||canonical.versionId!==goal.versionId)
    return {...UNCHECKED_CANONICAL_GOAL_STATUS,state:'version_mismatch'}
  if(!targetCompatible(goal.targetMode,canonical.targetState))return {...unknown}
  let sourceRevision:CanonicalGoalStatusReview['measurementRevision']='not_attested'
  if(input.sourceRead!==undefined){
    if(!input.sourceRead||input.sourceRead.status!=='available')
      return {...unknown,state:'measurement_source_unavailable',
        measurementRevision:'changed_or_unavailable'}
    const originally=canonical.bodyWeightSourceRevision
    if(originally&&input.sourceRead.hasPoint&&
       originally===input.sourceRead.revision)
      sourceRevision='latest_point_rechecked'
    else if(originally||input.sourceRead.hasPoint||canonical.targetState!=='unknown')
      return {...unknown,state:'measurement_source_changed',
        measurementRevision:'changed_or_unavailable'}
    // Missing point => unknown goal, never a confirmed unchanged weight.
  }
  let projectionRevision:CanonicalGoalStatusReview['projectionRevision']='not_attested'
  if(input.projectionSourceRead!==undefined){
    const check=input.projectionSourceRead
    const originally=canonical.bodyWeightProjectionRevision
    if(!check||check.status!=='available'||!originally)
      return {...unknown,state:'projection_source_unavailable',
        measurementRevision:sourceRevision,projectionRevision:'changed_or_unavailable'}
    if(check.revision!==originally||
       (check.rowCount===0&&canonical.targetState!=='unknown'))
      return {...unknown,state:'projection_source_changed',
        measurementRevision:sourceRevision,projectionRevision:'changed_or_unavailable'}
    projectionRevision=check.rowCount===0?
      'empty_series_rechecked':'complete_series_rechecked'
  }
  const target=canonical.targetState
  const deadline=canonical.deadlineState
  const attention:CanonicalGoalStatusReview['deadlineAttention']=
    deadline==='passed_satisfied'?'past_reported_satisfied':
    deadline==='passed_unmet'?target==='unknown'?
      'past_missing_measurement':'past_reported_unmet':
    deadline==='due_today'?target==='unknown'?
      'due_today_missing_measurement':'due_today_reported_unmet':
    deadline==='none'?'none_or_currently_satisfied':'future_or_projection'
  const observation=input.observation.state
  const observedOutOfRange=goal.targetMode==='at_most'
    ?observation==='all_recorded_above_boundary'
    :goal.targetMode==='at_least'
      ?observation==='all_recorded_below_boundary'
      :observation==='all_recorded_above_boundary'||
       observation==='all_recorded_below_boundary'
  const diverges=(target==='satisfied'&&observedOutOfRange)||
    (target!=='satisfied'&&target!=='unknown'&&
     observation==='all_recorded_within_boundary')
  return{
    state:diverges?'measurement_disagreement':
      target==='unknown'?'canonical_target_unknown':'canonical_reported',
    targetReport:target,deadlineAttention:attention,
    measurementRevision:sourceRevision,projectionRevision,
    intervention:'not_authorized',
  }
}
