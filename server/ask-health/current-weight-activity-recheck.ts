import {getSql,type Sql} from '../db.js'
import {addCalendarDays} from '../../src/domain/training-plan.js'
import type {HealthIntelligenceSnapshot,IntelligenceObservation} from '../../src/domain/intelligence/shared.js'
import {ACTIVITY_INTELLIGENCE_SQL,BODY_WEIGHT_INTELLIGENCE_SQL,
  activitySummaryObservations,bodyWeightObservations} from '../intelligence/snapshot.js'

/** Two bounded, final source reads. Do not treat source identity alone as
 * a revision; match the actual selected value, date, quality, provenance,
 * unit and ID. Not a transaction and not a physiology claim.
 */
export const LATE_ACTIVITY_INTELLIGENCE_SQL=ACTIVITY_INTELLIGENCE_SQL.replace(
  ' ORDER BY summary_date',' AND summary_date >= $3::date ORDER BY summary_date',
)
export const LATE_WEIGHT_INTELLIGENCE_SQL=BODY_WEIGHT_INTELLIGENCE_SQL.replace(
  " WHERE metrics.metric_key = 'weight'",
  " WHERE metrics.metric_key = 'weight'"+
  " AND NOT EXISTS (SELECT 1 FROM data_quality_reviews r"+
  " WHERE r.review_status = 'excluded_from_analysis' AND ("+
  " (r.entity_kind = 'body_metric' AND r.entity_id = metrics.id::text) OR"+
  " (r.entity_kind = 'body_measurement_session' AND r.entity_id = sessions.id::text)))",
).replace(
  ' ORDER BY sessions.measured_at, metrics.id',
  ' AND (sessions.measured_at AT TIME ZONE $2)::date >= $3::date ORDER BY sessions.measured_at, metrics.id',
)
const activityKeys=[
  'activity.steps','activity.active_energy_kcal','activity.exercise_minutes',
  'activity.resting_heart_rate_bpm',
] as const
const signalKeys:[...typeof activityKeys,'body.weight_kg']=[
  ...activityKeys,'body.weight_kg',
]
const valid=(o:IntelligenceObservation)=>
  Number.isFinite(o.value)&&o.sourceIds.length===1&&
  typeof o.sourceIds[0]==='string'&&o.sourceIds[0].trim()!==''

/** Last read wins within each calendar date: identical semantics to the
 * intelligence frame builder, which reduces repeated metrics to one day.
 */
function effective(observations:readonly IntelligenceObservation[],start:string,end:string){
  const map=new Map<string,IntelligenceObservation>()
  for(const o of observations){
    if(o.date>=start&&o.date<=end&&
       signalKeys.some(key=>key===o.key))map.set(o.date+'|'+o.key,o)
  }
  return map
}
function matches(
  prior:ReadonlyMap<string,IntelligenceObservation>,
  late:ReadonlyMap<string,IntelligenceObservation>,
):boolean{
  if(prior.size!==late.size)return false
  for(const [key,a] of prior){
    const b=late.get(key)
    if(!b||!valid(a)||!valid(b)||a.value!==b.value||a.date!==b.date||
      a.key!==b.key||a.unit!==b.unit||a.provenance!==b.provenance||
      (a.quality??null)!==(b.quality??null)||
      a.sourceIds[0]!==b.sourceIds[0])return false
  }
  return true
}
/** Same last-effective-kg-per-date logic as the original intelligence frame.
 * This does not expose metric IDs to the AI packet.
 */
export function historicalWeightObservationsAgree(
  snapshot:HealthIntelligenceSnapshot,lateRows:readonly Record<string,unknown>[],
  start:string,end:string,
):boolean{
  const first=snapshot.frame.flatMap(day=>{
    const o=day.signals['body.weight_kg']
    return o?[o]:[]
  })
  return matches(effective(first,start,end),
    effective(bodyWeightObservations(lateRows,snapshot.timezone),start,end))
}

export type WeightActivitySourceRecheck='verified'|'changed_or_unavailable'

export async function recheckCurrentWeightActivity(input:{
  snapshot:HealthIntelligenceSnapshot;today:string;start:string;end:string
  sqlOverride?:Sql
}):Promise<WeightActivitySourceRecheck>{
  const {snapshot,today,start,end}=input
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||snapshot.asOf!==today||
     start<snapshot.period.start||end>snapshot.asOf||end>=today||
     start>end||addCalendarDays(start,35)<end||!snapshot.timezone)
    return 'changed_or_unavailable'
  try{
    const sql=input.sqlOverride??await getSql()
    // Two days of left padding covers cross-timezone date boundaries.
    // Compare exclusively by normalized Health-calendar dates afterward.
    const [activityRows,bodyRows]=await Promise.all([
      sql.query(LATE_ACTIVITY_INTELLIGENCE_SQL,[snapshot.timezone,today,start]),
      sql.query(LATE_WEIGHT_INTELLIGENCE_SQL,
        [today,snapshot.timezone,addCalendarDays(start,-2)]),
    ]) as [Record<string,unknown>[],Record<string,unknown>[]]
    const previous=effective(snapshot.frame.flatMap(d=>
      signalKeys.flatMap(key=>d.signals[key]?[d.signals[key]!]:[])),start,end)
    const current=effective([
      ...activitySummaryObservations(activityRows),
      ...bodyWeightObservations(bodyRows,snapshot.timezone),
    ],start,end)
    return matches(previous,current)?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
