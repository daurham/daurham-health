import { getSql, type Sql } from '../db.js'

/**
 * Exact same membership predicate as maintenance decision revision.
 * A <=100 row bound avoids silently treating truncated evidence as complete.
 * Raw IDs and window dates remain private to this in-memory consistency check.
 */
export const CURRENT_EXPERIMENT_WINDOWS_SQL = `
SELECT e.id::text AS id, e.status,
       e.window_start::text AS window_start, e.window_end::text AS window_end
FROM experiments e
WHERE e.status = 'active'
   OR (e.status = 'scheduled' AND e.window_start <= $1::date + 14
       AND e.window_end >= $1::date)
ORDER BY e.id::text
LIMIT 101
`
export type CurrentExperimentWindowsRead =
  | {status:'available';rows:Array<{
    id:string;status:'active'|'scheduled';start:string|null;end:string|null
  }>}
  | {status:'unavailable';rows:[]}

function calendarDate(value:unknown):value is string{
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false
  const d=new Date(value+'T00:00:00Z')
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value
}
export async function readCurrentExperimentWindows(
  asOf:string,sqlOverride?:Sql,
):Promise<CurrentExperimentWindowsRead>{
  if(!calendarDate(asOf))return {status:'unavailable',rows:[]}
  try{
    const sql=sqlOverride??await getSql()
    const records=await sql.query(CURRENT_EXPERIMENT_WINDOWS_SQL,[asOf]) as unknown
    if(!Array.isArray(records)||records.length>100)return{status:'unavailable',rows:[]}
    const ids=new Set<string>()
    const rows:Array<{id:string;status:'active'|'scheduled';start:string|null;end:string|null}>=[]
    for(const raw of records){
      if(!raw||typeof raw!=='object')return{status:'unavailable',rows:[]}
      const r=raw as Record<string,unknown>
      if(typeof r.id!=='string'||!r.id.trim()||ids.has(r.id)||
         (r.status!=='active'&&r.status!=='scheduled')||
         (r.window_start!==null&&!calendarDate(r.window_start))||
         (r.window_end!==null&&!calendarDate(r.window_end))||
         (r.window_start===null)!==(r.window_end===null)||
         (typeof r.window_start==='string'&&typeof r.window_end==='string'&&
           r.window_start>r.window_end))
        return {status:'unavailable',rows:[]}
      // Scheduled membership requires a dated window in the next 14 days.
      const endOfHorizon=new Date(asOf+'T00:00:00Z')
      endOfHorizon.setUTCDate(endOfHorizon.getUTCDate()+14)
      const horizon=endOfHorizon.toISOString().slice(0,10)
      if(r.status==='scheduled' && (
        r.window_start===null || r.window_end===null ||
        (r.window_start as string)>horizon ||
        (r.window_end as string)<asOf))return {status:'unavailable',rows:[]}
      ids.add(r.id)
      rows.push({id:r.id,status:r.status,start:r.window_start as string|null,
        end:r.window_end as string|null})
    }
    return{status:'available',rows}
  }catch{return{status:'unavailable',rows:[]}}
}
