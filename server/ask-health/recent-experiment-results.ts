import {getSql,type Sql} from '../db.js'
import {EXPERIMENT_RESULT_CLASSIFICATIONS,PROTOCOL_ATTESTATIONS} from '../../src/domain/experiment-results.js'

export const RECENT_EXPERIMENT_RESULTS_SQL=`
SELECT r.id::text AS result_id,r.experiment_id::text AS experiment_id,
 r.protocol_version_id::text AS protocol_version_id,
 e.protocol_version_id::text AS pinned_protocol_version_id,
 e.status AS experiment_status,
 r.classification,r.status,r.protocol_attestation,r.stopped_for_safety,
 r.window_start::text AS window_start,
 r.planned_window_end::text AS planned_window_end,
 r.effective_end_date::text AS effective_end_date,
 EXISTS (SELECT 1 FROM lab_protocol_requirements p
   WHERE p.protocol_version_id=r.protocol_version_id
   AND p.role IN ('primary_outcome','secondary_outcome')
   AND ((p.domain='body' AND p.requirement_kind='body_metric'
         AND p.selector->>'metricKey'='weight')
     OR (p.domain='nutrition' AND p.requirement_kind='nutrition_metric'
         AND p.selector->>'metricKey'='calories'))
 ) AS direct_metric_declared,
 EXISTS (SELECT 1 FROM lab_protocol_requirements p
   JOIN experiment_result_requirements q
     ON q.requirement_id=p.id AND q.experiment_result_id=r.id
   WHERE p.protocol_version_id=r.protocol_version_id
   AND p.role IN ('primary_outcome','secondary_outcome')
   AND q.evaluation_status='available'
   AND ((p.domain='body' AND p.requirement_kind='body_metric'
         AND p.selector->>'metricKey'='weight')
     OR (p.domain='nutrition' AND p.requirement_kind='nutrition_metric'
         AND p.selector->>'metricKey'='calories'))
 ) AS direct_metric_observed
 FROM experiment_results r JOIN experiments e ON e.id=r.experiment_id
 WHERE r.effective_end_date BETWEEN $1::date - 27 AND $1::date
 ORDER BY r.id::text
 LIMIT 101
`

export type RecentResultRead={
 status:'available'
 rows:Array<{id:string;experimentId:string;classification:string;
   resultStatus:'valid'|'invalidated';directMetricDeclared:boolean;
   directMetricObserved:boolean;protocolFollowed:'followed'|'not_followed'|'uncertain';
   stoppedForSafety:boolean;effectiveEndDate:string}>
}|{status:'unavailable';rows:[]}

function date(x:unknown):x is string{
 if(typeof x!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(x))return false
 const d=new Date(x+'T00:00:00Z')
 return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===x
}
export async function readRecentExperimentResults(
 asOf:string,sqlOverride?:Sql,
):Promise<RecentResultRead>{
 const missing:RecentResultRead={status:'unavailable',rows:[]}
 if(!date(asOf))return missing
 const earliest=new Date(asOf+'T00:00:00Z')
 earliest.setUTCDate(earliest.getUTCDate()-27)
 const start=earliest.toISOString().slice(0,10)
 try{
  const sql=sqlOverride??await getSql()
  const items=await sql.query(RECENT_EXPERIMENT_RESULTS_SQL,[asOf]) as unknown
  if(!Array.isArray(items)||items.length>100)return missing
  const ids=new Set<string>(),validExperiments=new Set<string>()
  const rows:Extract<RecentResultRead,{status:'available'}>['rows']=[]
  for(const item of items){
   if(!item||typeof item!=='object'||Array.isArray(item))return missing
   const r=item as Record<string,unknown>
   if(typeof r.result_id!=='string'||!r.result_id.trim()||
      typeof r.experiment_id!=='string'||!r.experiment_id.trim()||
      ids.has(r.result_id)||
      typeof r.protocol_version_id!=='string'||!r.protocol_version_id.trim()||
      r.protocol_version_id!==r.pinned_protocol_version_id||
      !EXPERIMENT_RESULT_CLASSIFICATIONS.includes(r.classification as
        (typeof EXPERIMENT_RESULT_CLASSIFICATIONS)[number])||
      (r.status!=='valid'&&r.status!=='invalidated')||
      !PROTOCOL_ATTESTATIONS.includes(r.protocol_attestation as
        (typeof PROTOCOL_ATTESTATIONS)[number])||
      typeof r.stopped_for_safety!=='boolean'||
      typeof r.direct_metric_declared!=='boolean'||
      typeof r.direct_metric_observed!=='boolean'||
      (r.direct_metric_observed===true&&r.direct_metric_declared!==true)||
      !date(r.window_start)||!date(r.planned_window_end)||
      !date(r.effective_end_date)||r.window_start>r.effective_end_date||
      r.effective_end_date>r.planned_window_end||
      r.effective_end_date<start||r.effective_end_date>asOf)return missing
   if(r.status==='valid'){
    if(validExperiments.has(r.experiment_id))return missing
    validExperiments.add(r.experiment_id)
    const status=r.classification==='completed_interpretable'||
      r.classification==='completed_low_adherence'?'completed':'inconclusive'
    if(r.experiment_status!==status)return missing
   }
   ids.add(r.result_id)
   rows.push({id:r.result_id,experimentId:r.experiment_id,
    classification:r.classification as string,resultStatus:r.status,
    directMetricDeclared:r.direct_metric_declared as boolean,
    directMetricObserved:r.direct_metric_observed as boolean,
    protocolFollowed:r.protocol_attestation as 'followed'|'not_followed'|'uncertain',
    stoppedForSafety:r.stopped_for_safety as boolean,
    effectiveEndDate:r.effective_end_date as string})
  }
  return{status:'available',rows}
 }catch{return missing}
}
