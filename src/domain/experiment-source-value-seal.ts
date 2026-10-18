import { isCalendarDate } from './training.js'
import { addCalendarDays } from './progress/dates.js'
import { experimentEvidenceFingerprint, type DailyMetricPoint } from './experiment-results.js'
import type { ExperimentComparisonReview } from './experiment-comparison.js'

/** SHA-256 of only prespecified eligible daily values, no health notes/PHI.
 * New result snapshots carry this seal; older v1 snapshots remain readable
 * but cannot establish that observed values stayed unchanged.
 */
const limits:Record<string,number>={
  'nutrition_metric:calories':10000,
  'nutrition_metric:protein':1000,
  'nutrition_metric:carbs':1500,
  'nutrition_metric:fat':500,
  'sleep_metric:total_sleep_minutes':1440,
}
export async function computeExperimentSourceValueSeal(input:{
  review:ExperimentComparisonReview
  nutrition:readonly DailyMetricPoint[]
  sleep:readonly DailyMetricPoint[]
}):Promise<string|null>{
  const {review}=input
  const before=review.baselineWindow,after=review.followUpWindow
  if(review.state!=='descriptive_coverage'||!before||!after||
     review.metrics.length<1||review.metrics.length>8||
     !isCalendarDate(before.start)||!isCalendarDate(before.end)||
     !isCalendarDate(after.start)||!isCalendarDate(after.end)||
     before.end!==addCalendarDays(before.start,6)||
     after.start!==addCalendarDays(before.end,1)||
     after.end!==addCalendarDays(after.start,6)) return null
  const ids=new Set<string>()
  const records:Array<{
    requirementId:string;outcomeKind:string;metricKey:string;
    days:Array<{date:string;value:number;sourceKey:string|null}>
  }>=[]
  for(const metric of review.metrics) {
    const max=limits[metric.outcomeKind+':'+metric.metricKey]
    if(max===undefined||!metric.requirementId||ids.has(metric.requirementId)||
       metric.beforeExpected!==7||metric.afterExpected!==7||
       metric.beforeDays<4||metric.afterDays<4)return null
    ids.add(metric.requirementId)
    const points=(metric.outcomeKind==='sleep_metric'?input.sleep:input.nutrition)
      .filter(p=>p.metricKey===metric.metricKey&&p.date>=before.start&&p.date<=after.end)
    const dates=new Set<string>(),sources=new Set<string>()
    const days:Array<{date:string;value:number;sourceKey:string|null}>=[]
    for(const p of points){
      if(!isCalendarDate(p.date)||dates.has(p.date)||p.eligible===false||
         p.value===null||!Number.isFinite(p.value)||p.value<0||p.value>max)return null
      dates.add(p.date)
      if(metric.outcomeKind==='sleep_metric'){
        if(!p.sourceKey||!p.sourceKey.trim())return null
        sources.add(p.sourceKey)
      }
      days.push({date:p.date,value:p.value,
        sourceKey:metric.outcomeKind==='sleep_metric'?p.sourceKey!:null})
    }
    if(metric.outcomeKind==='sleep_metric'&&sources.size!==1)return null
    if(days.filter(d=>d.date<=before.end).length!==metric.beforeDays||
       days.filter(d=>d.date>=after.start).length!==metric.afterDays)return null
    days.sort((a,b)=>a.date.localeCompare(b.date))
    records.push({requirementId:metric.requirementId,
      outcomeKind:metric.outcomeKind,metricKey:metric.metricKey,days})
  }
  records.sort((a,b)=>a.requirementId.localeCompare(b.requirementId))
  return experimentEvidenceFingerprint({domain:'experiment-source-value-seal-v1',before,after,records})
}
