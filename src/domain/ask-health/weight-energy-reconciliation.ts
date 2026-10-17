import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'
import type {WeightGoalObservation} from './weight-goal-observation.js'
import type {PrimaryWeightGoalPriority} from './primary-weight-goal-intent.js'
import type {ExercisePreservationReview} from './exercise-preservation-review.js'
import type {ExperimentTimingReview} from './experiment-timing-review.js'
import type {ExperimentOutcomeReview} from './experiment-outcome-review.js'
import type {RecentExperimentResultReview} from './recent-experiment-result-review.js'
import type {ProteinTrainingContext} from './protein-training-context.js'
import type {CanonicalGoalStatusReview} from './canonical-goal-status-review.js'

export type ReconciliationReason=
  'settings_unverified'|'goal_priority_unverified'|'weight_not_selected_primary'|
  'current_goal_sources_conflict'|'goal_status_not_verified'|
  'performance_decline_attention'|'strength_preservation_not_verified'|
  'experiment_timing_attention'|'experiment_source_unknown'|
  'recent_result_not_linked_to_current_goal'|'calorie_adequacy_not_verified'|
  'weight_measurement_coverage_unverified'|'protein_record_coverage_unverified'|
  'canonical_version_mismatch'|'canonical_measurements_disagree'|
  'canonical_measurement_source_unverified'|
  'canonical_measurement_conditions_unverified'|
  'canonical_projection_source_unverified'|
  'canonical_goal_status_unverified'|'canonical_deadline_attention'|
  'canonical_projection_quality_limited'|
  'canonical_projection_conditions_unverified'

export type WeightEnergyReconciliation={
  state:'not_checked'|'source_inconsistent'|'goal_source_conflict'|
    'primary_not_weight'|'performance_attention'|'experiment_review'|'descriptive_only'
  /** Always BLOCKED here. Never a backdoor into the maintenance intervention engine. */
  calorieAdjustment:'not_authorized'
  plateauClassification:'not_authorized'
  strengthPreservation:'not_verified'
  reasons:ReconciliationReason[]
}
export const UNCHECKED_WEIGHT_ENERGY_RECONCILIATION:WeightEnergyReconciliation={
  state:'not_checked',calorieAdjustment:'not_authorized',
  plateauClassification:'not_authorized',strengthPreservation:'not_verified',
  reasons:[],
}

/** Cross-checks already attested, non-actionable screens. No new SQL or
 * clinical thresholds, no inference of past goal or intervention causality.
 */
export function reconcileWeightEnergyEvidence(input:{
  asOf:string;today:string
  settings:WeightEnergyCurrentSettings
  goalObservation:WeightGoalObservation
  primaryGoal:PrimaryWeightGoalPriority
  performance:ExercisePreservationReview
  timing:ExperimentTimingReview
  outcomes:ExperimentOutcomeReview
  recentResults:RecentExperimentResultReview
  proteinTraining:ProteinTrainingContext
  /** Optional for legacy synthetic fixtures; production loader always supplies. */
  canonicalGoal?:CanonicalGoalStatusReview
}):WeightEnergyReconciliation{
  const reasons:ReconciliationReason[]=[]
  const add=(item:ReconciliationReason)=>{if(!reasons.includes(item))reasons.push(item)}
  const sameDay=input.asOf===input.today
  const consistent=sameDay&&input.settings.state==='consistent_read'
  if(!sameDay||input.settings.state==='not_checked')
    return {...UNCHECKED_WEIGHT_ENERGY_RECONCILIATION,
      state:!sameDay?'source_inconsistent':'not_checked',
      reasons:!sameDay?['settings_unverified']:[]}
  if(!consistent)add('settings_unverified')
  const primary=input.primaryGoal.state
  const selected=primary==='selected_active_weight_goal'
  const notWeight=primary==='selected_goal_not_active_weight'||
    primary==='explicitly_cleared'||primary==='not_set'
  if(!selected&&!notWeight)add('goal_priority_unverified')
  if(notWeight)add('weight_not_selected_primary')
  const conflict=selected&&(
    input.settings.weightGoalMode==='none'||
    input.settings.weightGoalMode==='ambiguous'||
    input.settings.weightGoalMode==='unavailable'||
    input.goalObservation.state==='no_active_goal')
  if(conflict)add('current_goal_sources_conflict')
  if(input.canonicalGoal){
    if(input.canonicalGoal.state==='version_mismatch')add('canonical_version_mismatch')
    if(input.canonicalGoal.state==='measurement_disagreement')
      add('canonical_measurements_disagree')
    if(input.canonicalGoal.state==='measurement_source_changed'||
       input.canonicalGoal.state==='measurement_source_unavailable')
      add('canonical_measurement_source_unverified')
    if(input.canonicalGoal.state==='measurement_conditions_unverified')
      add('canonical_measurement_conditions_unverified')
    if(input.canonicalGoal.state==='projection_conditions_unverified')
      add('canonical_projection_conditions_unverified')
    if(input.canonicalGoal.state==='projection_quality_limited')
      add('canonical_projection_quality_limited')
    if(input.canonicalGoal.state==='projection_source_changed'||
       input.canonicalGoal.state==='projection_source_unavailable')
      add('canonical_projection_source_unverified')
    if(['unavailable','not_checked','canonical_target_unknown'].includes(
      input.canonicalGoal.state))add('canonical_goal_status_unverified')
    if(input.canonicalGoal.deadlineAttention==='past_reported_unmet'||
       input.canonicalGoal.deadlineAttention==='past_missing_measurement'||
       input.canonicalGoal.deadlineAttention==='due_today_reported_unmet'||
       input.canonicalGoal.deadlineAttention==='due_today_missing_measurement')
       add('canonical_deadline_attention')
  }
  // Even with comparable measurements and a matched version, canonical Goal
  // status/urgency and effective historical target are not attested here.
  add('goal_status_not_verified')
  if(['not_checked','unavailable','insufficient_comparable_weights'].includes(
    input.goalObservation.state))add('weight_measurement_coverage_unverified')
  if(input.proteinTraining.proteinCoverage!=='descriptive_window')
    add('protein_record_coverage_unverified')
  if(input.performance.state==='possible_decline_for_review')
    add('performance_decline_attention')
  // A lack of decline flags is NOT proof of maintained strength/muscle.
  add('strength_preservation_not_verified')
  const unknownExperiment=['unavailable','not_checked'].includes(input.timing.state)||
    ['unavailable','not_checked'].includes(input.outcomes.state)||
    ['unavailable','not_checked'].includes(input.recentResults.state)
  if(unknownExperiment)add('experiment_source_unknown')
  const activeOrSoon=['active_now','scheduled_soon','active_and_scheduled',
    'active_timing_unclear'].includes(input.timing.state)
  if(activeOrSoon)add('experiment_timing_attention')
  if(input.recentResults.interpretableDirectMetricResults != null&&
     input.recentResults.interpretableDirectMetricResults>0)
    add('recent_result_not_linked_to_current_goal')
  // A target configuration or descriptive protein average cannot establish
  // sufficient energy, nutrient adequacy or intervention safety.
  add('calorie_adequacy_not_verified')

  const canonicalConflict=input.canonicalGoal?.state==='version_mismatch'||
    input.canonicalGoal?.state==='measurement_disagreement'||
    input.canonicalGoal?.state==='measurement_source_changed'||
    input.canonicalGoal?.state==='projection_source_changed'
  const canonicalUnknown=input.canonicalGoal!=null&&
    ['unavailable','not_checked','canonical_target_unknown',
      'measurement_source_unavailable',
      'projection_source_unavailable','projection_quality_limited',
      'measurement_conditions_unverified',
      'projection_conditions_unverified']
      .includes(input.canonicalGoal.state)
  const incompleteSource=unknownExperiment||canonicalUnknown||
    ['unavailable','not_checked'].includes(input.performance.state)||
    ['unavailable','not_checked'].includes(input.goalObservation.state)||
    ['none','ambiguous','unavailable','not_checked'].includes(
      input.settings.weightGoalMode??'not_checked')
  const state:WeightEnergyReconciliation['state']=!consistent||
    (incompleteSource&&!conflict&&!canonicalConflict&&!notWeight&&
      input.performance.state!=='possible_decline_for_review'&&!activeOrSoon)||
    ['unavailable','not_checked'].includes(primary)
      ?'source_inconsistent'
      :conflict||canonicalConflict?'goal_source_conflict'
      :notWeight?'primary_not_weight'
      :input.performance.state==='possible_decline_for_review'?'performance_attention'
      :activeOrSoon||input.recentResults.interpretableDirectMetricResults!=null&&
         input.recentResults.interpretableDirectMetricResults>0?'experiment_review'
      :'descriptive_only'
  return{state,calorieAdjustment:'not_authorized',
    plateauClassification:'not_authorized',strengthPreservation:'not_verified',reasons}
}
