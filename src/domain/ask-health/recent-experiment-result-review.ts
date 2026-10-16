import type {RecentResultRead} from '../../../server/ask-health/recent-experiment-results.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'

export type RecentExperimentResultReview={
 state:'not_checked'|'unavailable'|'none_recent'|'recent_direct_observation'|
   'recent_non_direct_or_limited'|'mixed_recent_results'
 recentFinalizations:number|null
 interpretableDirectMetricResults:number|null
 interpretableOtherResults:number|null
 limitedOrInconclusiveResults:number|null
 invalidatedResults:number|null
}
export const UNCHECKED_RECENT_RESULT:RecentExperimentResultReview={
 state:'not_checked',recentFinalizations:null,interpretableDirectMetricResults:null,
 interpretableOtherResults:null,limitedOrInconclusiveResults:null,invalidatedResults:null,
}
/** Describes result classification and observations, NEVER outcome causality. */
export function screenRecentExperimentResults(input:{
 asOf:string;today:string;settings:WeightEnergyCurrentSettings;read:RecentResultRead|null
}):RecentExperimentResultReview{
 const missing:RecentExperimentResultReview={...UNCHECKED_RECENT_RESULT,state:'unavailable'}
 if(input.asOf!==input.today)return missing
 if(input.settings.state==='not_checked')return{...UNCHECKED_RECENT_RESULT}
 if(input.settings.state!=='consistent_read'||input.read?.status!=='available')return missing
 let direct=0,other=0,limited=0,invalidated=0
 for(const r of input.read.rows){
  if(r.resultStatus==='invalidated'){invalidated++;continue}
  const interpretable=r.classification==='completed_interpretable'&&
    r.protocolFollowed==='followed'&&!r.stoppedForSafety
  if(!interpretable){limited++;continue}
  if(r.directMetricDeclared&&r.directMetricObserved)direct++
  else if(r.directMetricDeclared)limited++
  else other++
 }
 const n=input.read.rows.length
 const state=n===0?'none_recent':
   direct>0&&(other>0||limited>0||invalidated>0)?'mixed_recent_results':
   direct>0?'recent_direct_observation':
   other>0&&(limited>0||invalidated>0)?'mixed_recent_results':
   'recent_non_direct_or_limited'
 return{state,recentFinalizations:n,interpretableDirectMetricResults:direct,
  interpretableOtherResults:other,limitedOrInconclusiveResults:limited,
  invalidatedResults:invalidated}
}
