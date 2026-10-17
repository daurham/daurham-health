import type {SleepNightlySummary} from '../sleep/summarize.js'
import type {HealthIntelligenceSnapshot,RoutedHealthIntelligence} from '../intelligence/shared.js'

/** Reconciles two ALREADY-LOADED Sleep sources without extra SQL.
 * This checks only the canonical eligible total duration used by shared
 * intelligence, not stage quality or a later database revision.
 */
export type SleepSnapshotConsistency='verified'|'changed_or_unavailable'

export function reconcileAskSleepSources(input:{
  nights:readonly SleepNightlySummary[]
  snapshot:HealthIntelligenceSnapshot
  start:string
  end:string
  today:string
}):SleepSnapshotConsistency{
  const {nights,snapshot,start,end,today}=input
  const date=/^\d{4}-\d{2}-\d{2}$/
  if(!date.test(today)||!date.test(start)||!date.test(end)||
    snapshot.asOf!==today||snapshot.period.start>start||
    snapshot.period.end<end||start>end||end>today||!snapshot.timezone)
    return 'changed_or_unavailable'
  const selected=nights.filter(n=>n.sleepDate>=start&&n.sleepDate<=end)
  const byDate=new Map<string,SleepNightlySummary>()
  for(const night of selected){
    if(!date.test(night.sleepDate)||night.timezone!==snapshot.timezone||
      byDate.has(night.sleepDate))return 'changed_or_unavailable'
    byDate.set(night.sleepDate,night)
  }
  for(const frame of snapshot.frame){
    if(frame.date<start||frame.date>end)continue
    const night=byDate.get(frame.date)
    const minutes=night?.analysisEligible===true&&
      night.observationStatus!=='partial_observation'&&
      night.observationStatus!=='in_bed_only'&&
      typeof night.totalSleepMinutes==='number'&&
      Number.isFinite(night.totalSleepMinutes)
      ?night.totalSleepMinutes:null
    const signal=frame.signals['sleep.total_minutes']
    if(minutes===null){
      if(signal!=null)return 'changed_or_unavailable'
    }else if(signal==null||signal.key!=='sleep.total_minutes'||
      signal.date!==frame.date||signal.value!==minutes||
      signal.unit!=='min'||signal.provenance!=='device'||
      signal.sourceIds.length!==1||
      typeof signal.sourceIds[0]!=='string'||signal.sourceIds[0].trim()==='')
      return 'changed_or_unavailable'
  }
  return 'verified'
}

/** Entire relation/experiment must disappear if either operand is a
 * conflicting Sleep signal, even when the other operand is well sourced.
 */
export function guardInconsistentSleepIntelligence(
  routed:RoutedHealthIntelligence|null|undefined,
  agreement:SleepSnapshotConsistency|'not_checked'|undefined,
):RoutedHealthIntelligence|null{
  if(!routed)return null
  if(agreement!=='changed_or_unavailable')return routed
  const sleep=(key:string)=>key.startsWith('sleep.')
  const relationships=new Set(routed.relationships.filter(
    item=>sleep(item.xKey)||sleep(item.yKey)).map(item=>item.id))
  const changes=new Set(routed.interventions.filter(
    item=>sleep(item.signalKey)).map(item=>item.id))
  const blockedContext=(key:string)=>sleep(key)||
    relationships.has(key)||changes.has(key)
  return {
    ...routed,
    selectedKeys:routed.selectedKeys.filter(key=>!sleep(key)),
    coverage:routed.coverage.filter(item=>!sleep(item.key)),
    baselines:routed.baselines.filter(item=>!sleep(item.key)),
    relationships:routed.relationships.filter(
      item=>!sleep(item.xKey)&&!sleep(item.yKey)),
    interventions:routed.interventions.filter(item=>!sleep(item.signalKey)),
    knows:routed.knows.filter(item=>!blockedContext(item.key)),
    missing:routed.missing.filter(item=>!blockedContext(item.key)),
  }
}
