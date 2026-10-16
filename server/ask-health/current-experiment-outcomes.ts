import {getSql, type Sql} from '../db.js'
import type {CurrentExperimentWindowsRead} from './current-experiment-windows.js'

/** Bounded protocol outcome read tied to the same experiment IDs and
 * a matching before/after Maintenance Decision Revision. The revision
 * includes the frozen protocol requirement content for those experiments.
 */
export const CURRENT_EXPERIMENT_OUTCOMES_SQL = `
SELECT e.id::text AS experiment_id,
       e.protocol_version_id::text AS protocol_version_id,
       r.id::text AS requirement_id,
       r.role, r.domain, r.requirement_kind, r.selector
  FROM experiments e
  LEFT JOIN lab_protocol_requirements r
    ON r.protocol_version_id = e.protocol_version_id
 WHERE e.id = ANY($1::uuid[])
 ORDER BY e.id::text, r.id::text
 LIMIT 401
`
export type OutcomeReadRow = {
  id:string
  /** No outcomes => no explicit primary/secondary outcome configured, not no effect. */
  directWeightOrCalorieOutcome:boolean
  otherOutcomeOnly:boolean
  noOutcomeDeclared:boolean
}
export type CurrentExperimentOutcomesRead =
  | {status:'available';rows:OutcomeReadRow[]}
  | {status:'unavailable';rows:[]}

const roles = new Set(['primary_outcome','secondary_outcome','adherence','context','safety'])
const domains = new Set(['training','body','nutrition','activity','sleep','supplements','context','benchmark'])
const kinds = new Set(['training_measure','body_metric','nutrition_metric','activity_metric',
  'sleep_metric','supplement_adherence','context_tag','benchmark_definition'])

export async function readCurrentExperimentOutcomes(
  windows:CurrentExperimentWindowsRead|null,
  sqlOverride?:Sql,
):Promise<CurrentExperimentOutcomesRead>{
  const missing:CurrentExperimentOutcomesRead={status:'unavailable',rows:[]}
  if(windows?.status!=='available')return missing
  if(windows.rows.length===0)return{status:'available',rows:[]}
  const ids=windows.rows.map(row=>row.id)
  if(ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!x.trim()))return missing
  try{
    const sql=sqlOverride??await getSql()
    const raw=await sql.query(CURRENT_EXPERIMENT_OUTCOMES_SQL,[ids]) as unknown
    if(!Array.isArray(raw)||raw.length>400||raw.length<ids.length)return missing
    const allowed=new Set(ids)
    const summaries=new Map<string,{protocol:string;seen:Set<string>;noRequirement:boolean;
      direct:boolean;other:boolean}>()
    for(const x of raw){
      if(!x||typeof x!=='object'||Array.isArray(x))return missing
      const r=x as Record<string,unknown>
      const id=r.experiment_id,protocol=r.protocol_version_id
      if(typeof id!=='string'||!allowed.has(id)||
         typeof protocol!=='string'||!protocol.trim())return missing
      const found=summaries.get(id)
      if(found&&found.protocol!==protocol)return missing
      const entry=found??{protocol,seen:new Set<string>(),noRequirement:false,
        direct:false,other:false}
      const rid=r.requirement_id
      if(rid===null){
        if(found||r.role!==null||r.domain!==null||r.requirement_kind!==null||
           r.selector!==null)return missing
        entry.noRequirement=true
      }else{
        if(typeof rid!=='string'||!rid.trim()||entry.seen.has(rid)||entry.noRequirement||
           !roles.has(String(r.role))||!domains.has(String(r.domain))||
           !kinds.has(String(r.requirement_kind))||
           !r.selector||typeof r.selector!=='object'||Array.isArray(r.selector))
          return missing
        entry.seen.add(rid)
        const role=r.role==='primary_outcome'||r.role==='secondary_outcome'
        if(role){
          const shape=(r.domain==='body'&&r.requirement_kind==='body_metric')||
            (r.domain==='nutrition'&&r.requirement_kind==='nutrition_metric')
          const fields=r.selector as Record<string,unknown>
          if(shape&&(Object.keys(fields).length!==1||
             typeof fields.metricKey!=='string'||!fields.metricKey.trim()))return missing
          if(shape&&(
            (r.domain==='body'&&fields.metricKey==='weight')||
            (r.domain==='nutrition'&&fields.metricKey==='calories')))
            entry.direct=true
          else entry.other=true
        }
      }
      summaries.set(id,entry)
    }
    if(summaries.size!==ids.length)return missing
    return{status:'available',rows:ids.map(id=>{
      const s=summaries.get(id)!
      return {id,directWeightOrCalorieOutcome:s.direct,
        otherOutcomeOnly:!s.direct&&s.other,
        noOutcomeDeclared:!s.direct&&!s.other}
    })}
  }catch{return missing}
}
