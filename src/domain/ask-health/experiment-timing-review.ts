import type {CurrentExperimentWindowsRead} from '../../../server/ask-health/current-experiment-windows.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'

export type ExperimentTimingReview={
  state:'not_checked'|'unavailable'|'none'|'active_now'|
    'scheduled_soon'|'active_and_scheduled'|'active_timing_unclear'
  activeWithinWindow:number|null
  upcomingScheduled:number|null
  activeOutsideOrUndated:number|null
}
export const UNCHECKED_EXPERIMENT_TIMING:ExperimentTimingReview={
  state:'not_checked',activeWithinWindow:null,upcomingScheduled:null,
  activeOutsideOrUndated:null,
}
/** Pure, review-only reconciliation inside matching decision snapshots.
 * Even a clean "none" is not permission to adjust a calorie target.
 */
export function screenExperimentTimingReview(input:{
  asOf:string;today:string
  settings:WeightEnergyCurrentSettings
  read:CurrentExperimentWindowsRead|null
}):ExperimentTimingReview{
  const unknown:ExperimentTimingReview={
    state:'unavailable',activeWithinWindow:null,upcomingScheduled:null,
    activeOutsideOrUndated:null,
  }
  if(input.asOf!==input.today)return unknown
  if(input.settings.state==='not_checked')return{...UNCHECKED_EXPERIMENT_TIMING}
  if(input.settings.state!=='consistent_read'||
     input.read?.status!=='available')return unknown
  const n=input.settings.relevantExperimentCount
  if(!Number.isSafeInteger(n)||n==null||n<0||n!==input.read.rows.length)
    return unknown
  let activeWithinWindow=0,upcomingScheduled=0,activeOutsideOrUndated=0
  for(const row of input.read.rows){
    if(row.status==='scheduled')upcomingScheduled++
    else if(row.start!=null&&row.end!=null&&row.start<=input.asOf&&row.end>=input.asOf)
      activeWithinWindow++
    else activeOutsideOrUndated++
  }
  const state=activeOutsideOrUndated>0?'active_timing_unclear':
    activeWithinWindow>0&&upcomingScheduled>0?'active_and_scheduled':
    activeWithinWindow>0?'active_now':
    upcomingScheduled>0?'scheduled_soon':'none'
  return{state,activeWithinWindow,upcomingScheduled,activeOutsideOrUndated}
}
