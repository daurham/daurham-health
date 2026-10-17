import type {ActivityDailyRow} from '../activity/analytics.js'
import type {
  HealthIntelligenceSnapshot,IntelligenceSignalKey,RoutedHealthIntelligence,
} from '../intelligence/shared.js'

/** One cheap, deterministic comparison of TWO ALREADY-LOADED canonical
 * Activity views. Neither view is inherently the later/final authority.
 * This is not a new database request or a true source revision check.
 */
export type ActivitySnapshotConsistency='verified'|'changed_or_unavailable'

const SIGNALS=[
  ['activity.steps','stepsCount'],
  ['activity.active_energy_kcal','activeEnergyKcal'],
  ['activity.exercise_minutes','exerciseMinutes'],
  ['activity.resting_heart_rate_bpm','restingHeartRateBpm'],
] as const satisfies ReadonlyArray<readonly [IntelligenceSignalKey,keyof ActivityDailyRow]>

export function reconcileAskActivitySources(input:{
  rows:readonly ActivityDailyRow[]
  snapshot:HealthIntelligenceSnapshot
  start:string
  end:string
  today:string
}):ActivitySnapshotConsistency{
  const {rows,snapshot,start,end,today}=input
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||
    !/^\d{4}-\d{2}-\d{2}$/.test(start)||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)||
    snapshot.asOf!==today||snapshot.period.end<end||
    start<snapshot.period.start||end>today||start>end||
    !snapshot.timezone)return 'changed_or_unavailable'

  const visible=rows.filter(row=>row.date>=start&&row.date<=end)
  const dates=new Set<string>()
  for(const row of visible){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(row.date)||
       dates.has(row.date)||row.timezone!==snapshot.timezone)
      return 'changed_or_unavailable'
    dates.add(row.date)
  }
  const view=new Map(visible.map(row=>[row.date,row]))
  for(const day of snapshot.frame){
    if(day.date<start||day.date>end)continue
    const raw=view.get(day.date)
    for(const [key,field] of SIGNALS){
      const a=raw?.[field]
      const observed=typeof a==='number'&&Number.isFinite(a)?a:null
      const b=day.signals[key]
      if(observed==null){
        if(b!=null)return 'changed_or_unavailable'
      }else if(b==null||b.value!==observed||b.date!==day.date||
        b.key!==key||b.sourceIds.length!==1||
        typeof b.sourceIds[0]!=='string'||b.sourceIds[0].trim()===''||
        b.provenance!=='device')return 'changed_or_unavailable'
    }
  }
  return 'verified'
}

/** Only the Activity components conflict; do not erase independently sourced
 * sleep, wellness, nutrition or training facts from the generic packet.
 * A relationship involving Activity must be wholly removed, not just its
 * Activity side or its confidence field.
 */
export function guardInconsistentActivityIntelligence(
  routed:RoutedHealthIntelligence|null|undefined,
  agreement:ActivitySnapshotConsistency|'not_checked'|undefined,
):RoutedHealthIntelligence|null{
  if(!routed)return null
  if(agreement!=='changed_or_unavailable')return routed
  const activity=(key:string)=>key.startsWith('activity.')
  const excludedRelations=new Set(routed.relationships.filter(
    item=>activity(item.xKey)||activity(item.yKey)).map(item=>item.id))
  const excludedChanges=new Set(routed.interventions.filter(
    item=>activity(item.signalKey)).map(item=>item.id))
  const excludedContext=(key:string)=>activity(key)||
    excludedRelations.has(key)||excludedChanges.has(key)
  return {
    ...routed,
    selectedKeys:routed.selectedKeys.filter(key=>!activity(key)),
    coverage:routed.coverage.filter(item=>!activity(item.key)),
    baselines:routed.baselines.filter(item=>!activity(item.key)),
    relationships:routed.relationships.filter(
      item=>!activity(item.xKey)&&!activity(item.yKey)),
    interventions:routed.interventions.filter(item=>!activity(item.signalKey)),
    knows:routed.knows.filter(item=>!excludedContext(item.key)),
    missing:routed.missing.filter(item=>!excludedContext(item.key)),
  }
}
