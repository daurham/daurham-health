import {addCalendarDays} from '../training-plan.js'
import type {HealthIntelligenceSnapshot,IntelligenceObservation} from '../intelligence/shared.js'

/** Sampling coverage for the maintenance engine's 3-day and preceding
 * 7-day food-log comparison; NOT nutrient/weight association or causality.
 * Water and step counts mean recorded observations, not complete-day totals.
 */
export type ScaleWindowSignalCoverage={
  weightSampling:'no_qualified_weight'|'sparse_or_mixed'|'sampled_both_windows'
  recentUsualWeightDays:number
  baselineUsualWeightDays:number
  nonUsualWeightDays:number
  recordedWaterDays:number
  recordedStepDays:number
  comparisonDays:10
}
const identified=(row:IntelligenceObservation|undefined,date:string,unit:string,allowZero=false)=>
  row!=null&&row.date===date&&row.unit===unit&&
  Number.isFinite(row.value)&&(allowZero?row.value>=0:row.value>0)&&
  (row.provenance==='owner'||row.provenance==='device')&&
  row.sourceIds.length>0&&row.sourceIds.every(id=>typeof id==='string'&&id.trim())&&
  new Set(row.sourceIds).size===row.sourceIds.length

export function screenScaleWindowSignalCoverage(input:{
  snapshot:HealthIntelligenceSnapshot
  completeThrough:string
  today:string
}):ScaleWindowSignalCoverage{
  const start=addCalendarDays(input.completeThrough,-9)
  const recent=addCalendarDays(input.completeThrough,-2)
  const selected=input.snapshot.frame.filter(day=>
    day.date>=start&&day.date<=input.completeThrough&&
    day.date>=input.snapshot.period.start&&day.date<=input.snapshot.period.end&&
    day.date<input.today&&day.date<=input.snapshot.asOf)
  let recentUsualWeightDays=0,baselineUsualWeightDays=0
  let nonUsualWeightDays=0,recordedWaterDays=0,recordedStepDays=0
  for(const day of selected){
    const weight=day.signals['body.weight_kg']
    if(identified(weight,day.date,'kg')){
      if(weight!.quality==='usual'){
        if(day.date>=recent)recentUsualWeightDays++
        else baselineUsualWeightDays++
      }else nonUsualWeightDays++
    }
    if(identified(day.signals['hydration.ml'],day.date,'ml'))recordedWaterDays++
    if(identified(day.signals['activity.steps'],day.date,'steps',true))recordedStepDays++
  }
  const weightSampling:ScaleWindowSignalCoverage['weightSampling']=
    recentUsualWeightDays+baselineUsualWeightDays===0?'no_qualified_weight':
      nonUsualWeightDays===0&&recentUsualWeightDays>=2&&
      baselineUsualWeightDays>=3&&start>=input.snapshot.period.start
        ?'sampled_both_windows':'sparse_or_mixed'
  return{weightSampling,recentUsualWeightDays,baselineUsualWeightDays,
    nonUsualWeightDays,recordedWaterDays,recordedStepDays,comparisonDays:10}
}
