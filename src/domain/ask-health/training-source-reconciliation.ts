import type {ProgressWorkoutSummary} from '../progress/types.js'
import type {HealthIntelligenceSnapshot,RoutedHealthIntelligence} from '../intelligence/shared.js'

/** Compare two previously loaded canonical session views, not a late revision. */
export type TrainingSnapshotConsistency='verified'|'changed_or_unavailable'
const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)
const sameIds=(actual:readonly string[],expected:readonly string[]):boolean=>{
  if(actual.length!==expected.length ||
     actual.some(id=>typeof id!=='string'||id.trim()==='') ||
     new Set(actual).size!==actual.length)return false
  const left=[...actual].sort(),right=[...expected].sort()
  return left.every((id,i)=>id===right[i])
}

/** Intelligence synthesizes zero completed-day sessions if no sessions exist;
 * no-session today remains missing, never a verified zero.
 */
export function reconcileAskTrainingSources(input:{
  workouts:readonly ProgressWorkoutSummary[]
  snapshot:HealthIntelligenceSnapshot
  start:string
  end:string
  today:string
}):TrainingSnapshotConsistency{
  const {workouts,snapshot,start,end,today}=input
  if(!isDate(start)||!isDate(end)||!isDate(today)||
     snapshot.asOf!==today||snapshot.period.start>start||
     snapshot.period.end<end||start>end||end>today||!snapshot.timezone)
    return 'changed_or_unavailable'
  const byDate=new Map<string,ProgressWorkoutSummary[]>()
  const ids=new Set<string>()
  for(const workout of workouts){
    if(workout.sessionDate<start||workout.sessionDate>end)continue
    if(!isDate(workout.sessionDate)||typeof workout.sessionId!=='string'||
       workout.sessionId.trim()===''||ids.has(workout.sessionId)||
       (workout.effort!=null&&(!Number.isInteger(workout.effort)||
         workout.effort<1||workout.effort>5)))
      return 'changed_or_unavailable'
    ids.add(workout.sessionId)
    const current=byDate.get(workout.sessionDate)??[]
    current.push(workout)
    byDate.set(workout.sessionDate,current)
  }
  const seen=new Set<string>()
  for(const day of snapshot.frame){
    if(day.date<start||day.date>end)continue
    if(!isDate(day.date)||seen.has(day.date))return 'changed_or_unavailable'
    seen.add(day.date)
    const sessions=byDate.get(day.date)??[]
    const count=day.signals['training.sessions']
    const effort=day.signals['training.effort']
    if(sessions.length===0){
      if(day.date===today){
        if(count!=null||effort!=null)return 'changed_or_unavailable'
      }else if(count==null||count.key!=='training.sessions'||
        count.date!==day.date||count.unit!=='sessions'||
        count.value!==0||count.provenance!=='derived'||
        count.sourceIds.length!==0||effort!=null)
        return 'changed_or_unavailable'
      continue
    }
    if(count==null||count.key!=='training.sessions'||
      count.date!==day.date||count.unit!=='sessions'||
      count.provenance!=='owner'||count.value!==sessions.length||
      !sameIds(count.sourceIds,sessions.map(item=>item.sessionId)))
      return 'changed_or_unavailable'
    const withEffort=sessions.filter(item=>item.effort!=null)
    if(withEffort.length===0){
      if(effort!=null)return 'changed_or_unavailable'
    }else{
      const mean=withEffort.reduce((sum,item)=>sum+item.effort!,0)/withEffort.length
      if(effort==null||effort.key!=='training.effort'||
        effort.date!==day.date||effort.unit!=='1–5'||
        effort.provenance!=='owner'||effort.value!==mean||
        !sameIds(effort.sourceIds,withEffort.map(item=>item.sessionId)))
        return 'changed_or_unavailable'
    }
  }
  if([...byDate.keys()].some(date=>!seen.has(date)))return 'changed_or_unavailable'
  return 'verified'
}

export function guardInconsistentTrainingIntelligence(
  routed:RoutedHealthIntelligence|null|undefined,
  agreement:TrainingSnapshotConsistency|'not_checked'|undefined,
):RoutedHealthIntelligence|null{
  if(!routed)return null
  if(agreement!=='changed_or_unavailable')return routed
  const training=(key:string)=>key.startsWith('training.')
  const relations=new Set(routed.relationships.filter(item=>
    training(item.xKey)||training(item.yKey)).map(item=>item.id))
  const changes=new Set(routed.interventions.filter(item=>
    training(item.signalKey)).map(item=>item.id))
  const excluded=(key:string)=>training(key)||relations.has(key)||changes.has(key)
  return {
    ...routed,
    selectedKeys:routed.selectedKeys.filter(key=>!training(key)),
    coverage:routed.coverage.filter(item=>!training(item.key)),
    baselines:routed.baselines.filter(item=>!training(item.key)),
    relationships:routed.relationships.filter(item=>
      !training(item.xKey)&&!training(item.yKey)),
    interventions:routed.interventions.filter(item=>!training(item.signalKey)),
    knows:routed.knows.filter(item=>!excluded(item.key)),
    missing:routed.missing.filter(item=>!excluded(item.key)),
  }
}
