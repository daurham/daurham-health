import type {CurrentExperimentOutcomesRead} from '../../../server/ask-health/current-experiment-outcomes.js'
import type {CurrentExperimentWindowsRead} from '../../../server/ask-health/current-experiment-windows.js'
import type {WeightEnergyCurrentSettings} from './weight-energy-current-settings.js'
import type {ExperimentTimingReview} from './experiment-timing-review.js'

export type ExperimentOutcomeReview={
  state:'not_checked'|'unavailable'|'none'|'direct_outcome_recorded'|
    'other_outcomes_only'|'unclassified_protocols'|'mixed_protocols'
  directOutcomeExperiments:number|null
  directOutcomesActiveNow:number|null
  directOutcomesScheduledSoon:number|null
  noDirectOutcomeExperiments:number|null
  noDeclaredOutcomeExperiments:number|null
}
export const UNCHECKED_EXPERIMENT_OUTCOME:ExperimentOutcomeReview={
  state:'not_checked',directOutcomeExperiments:null,directOutcomesActiveNow:null,
  directOutcomesScheduledSoon:null,noDirectOutcomeExperiments:null,
  noDeclaredOutcomeExperiments:null,
}
export function screenExperimentOutcomeReview(input:{
  asOf:string;today:string
  settings:WeightEnergyCurrentSettings
  timing:ExperimentTimingReview
  windows:CurrentExperimentWindowsRead|null
  outcomes:CurrentExperimentOutcomesRead|null
}):ExperimentOutcomeReview{
  const unknown:ExperimentOutcomeReview={
    ...UNCHECKED_EXPERIMENT_OUTCOME,state:'unavailable',
  }
  if(input.asOf!==input.today)return unknown
  if(input.settings.state==='not_checked')return {...UNCHECKED_EXPERIMENT_OUTCOME}
  if(input.settings.state!=='consistent_read'||input.timing.state==='unavailable'||
     input.timing.state==='not_checked'||input.windows?.status!=='available'||
     input.outcomes?.status!=='available'||input.settings.relevantExperimentCount==null)
    return unknown
  const w=input.windows.rows,o=input.outcomes.rows
  if(w.length!==o.length||w.length!==input.settings.relevantExperimentCount)return unknown
  const indexed=new Map(o.map(x=>[x.id,x]))
  if(indexed.size!==o.length)return unknown
  let direct=0,activeNow=0,scheduled=0,other=0,unclassified=0
  for(const window of w){
    const row=indexed.get(window.id)
    if(!row)return unknown
    const n=Number(row.directWeightOrCalorieOutcome)+Number(row.otherOutcomeOnly)+
      Number(row.noOutcomeDeclared)
    if(n!==1)return unknown
    if(row.directWeightOrCalorieOutcome){
      direct++
      if(window.status==='active'&&window.start!=null&&window.end!=null&&
         window.start<=input.asOf&&window.end>=input.asOf)activeNow++
      if(window.status==='scheduled')scheduled++
    }else if(row.otherOutcomeOnly)other++
    else unclassified++
  }
  const state=direct>0?
    (other>0||unclassified>0?'mixed_protocols':'direct_outcome_recorded'):
    other>0?(unclassified>0?'mixed_protocols':'other_outcomes_only'):
    unclassified>0?'unclassified_protocols':'none'
  return{state,directOutcomeExperiments:direct,directOutcomesActiveNow:activeNow,
    directOutcomesScheduledSoon:scheduled,
    noDirectOutcomeExperiments:other,noDeclaredOutcomeExperiments:unclassified}
}
