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

// A *qualified* sodium/carbohydrate daily-log increase is not a dated
// intervention. This chronological screen makes no causal claim: even a
// later recorded weigh-in cannot link food, hydration and scale outcomes.
export type ScaleShiftTimingState=
  'not_checked'|'source_dates_unverified'|'weight_window_insufficient'|
  'no_later_scale_record'|'later_scale_recorded'
export type ScaleShiftTiming={
  sodium:ScaleShiftTimingState
  carbohydrate:ScaleShiftTimingState
}

export function screenScaleShiftTiming(input:{
  snapshot:HealthIntelligenceSnapshot
  completeThrough:string
  today:string
  coverage:ScaleWindowSignalCoverage
  shifts:readonly {kind:string;dates:readonly string[]}[]
}):ScaleShiftTiming{
  const recentStart=addCalendarDays(input.completeThrough,-2)
  const start=addCalendarDays(input.completeThrough,-9)
  const availableWindow=input.snapshot.period.start<=start&&
    input.snapshot.period.end>=input.completeThrough&&
    input.snapshot.asOf>=input.completeThrough&&
    input.completeThrough<input.today
  const recentWeights=input.snapshot.frame.flatMap(day=>{
    const weight=day.signals['body.weight_kg']
    if(day.date<recentStart||day.date>input.completeThrough||
       day.date>=input.today||!identified(weight,day.date,'kg')||
       weight!.quality!=='usual')return []
    return [day.date]
  })
  const inspect=(kind:'sodium'|'carbohydrate'):ScaleShiftTimingState=>{
    const selected=input.shifts.filter(shift=>shift.kind===kind)
    if(selected.length===0)return 'not_checked'
    if(selected.length!==1||!availableWindow)return 'source_dates_unverified'
    const dates=selected[0]!.dates
    if(dates.length<2||dates.length>3||
       new Set(dates).size!==dates.length||
       dates.some(date=>!/^\d{4}-\d{2}-\d{2}$/.test(date)||
         date<recentStart||date>input.completeThrough||
         date>=input.today||!input.snapshot.frame.some(day=>day.date===date)))
      return 'source_dates_unverified'
    if(input.coverage.weightSampling!=='sampled_both_windows')
      return 'weight_window_insufficient'
    const latestFoodDay=[...dates].sort().at(-1)!
    // A same-day weight is NOT evidence it followed a daily food total.
    return recentWeights.some(day=>day>latestFoodDay)
      ?'later_scale_recorded':'no_later_scale_record'
  }
  return {sodium:inspect('sodium'),carbohydrate:inspect('carbohydrate')}
}
