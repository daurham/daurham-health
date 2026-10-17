import {createHash} from 'node:crypto'
import type {Sql} from '../db.js'

/** Shared SQL is used BOTH by Goal Control's projection calculation and by
 * Ask Health's late-stage revision check. The returned rows are not capped:
 * preserving canonical projection behavior takes precedence over attestation.
 * A fingerprint is unavailable when more than MAX_HISTORY_ROWS are returned.
 */
export const BODY_GOAL_PROJECTION_SOURCE_SQL=`
SELECT metrics.id::text AS measurement_id,
       metrics.measurement_session_id::text AS measurement_session_id,
       metrics.metric_key,
       metrics.value::text AS value,
       metrics.unit,
       metrics.value_kind,
       sessions.measured_at::text AS measured_at,
       sessions.timezone,
       sessions.comparability,
       metrics.updated_at::text AS metric_updated_at,
       sessions.updated_at::text AS session_updated_at
  FROM body_metrics metrics
  JOIN body_measurement_sessions sessions
    ON sessions.id = metrics.measurement_session_id
 WHERE metrics.metric_key = $1
 ORDER BY metrics.id::text
`

export const MAX_HISTORY_ROWS=3000
export type BodyProjectionRead={
  rows:Array<Record<string,unknown>>
  revision:string|null
  total:number
}

/** Deterministic, private fingerprint of exactly the source rows Goal
 * Control projects from. No raw measurements or hashes enter AI evidence.
 * Includes update timestamps so a same-value correction is detectable.
 */
export function fingerprintBodyProjectionRows(
  metricKey:string,rows:readonly Record<string,unknown>[],
):string|null{
  if(!metricKey.trim()||rows.length>MAX_HISTORY_ROWS)return null
  const seen=new Set<string>()
  const parts:unknown[][]=[]
  for(const r of rows){
    const id=r.measurement_id
    if(typeof id!=='string'||!id.trim()||seen.has(id)||
      typeof r.measurement_session_id!=='string'||!r.measurement_session_id.trim()||
      r.metric_key!==metricKey||
      typeof r.value!=='string'||r.value.trim()===''||
      !Number.isFinite(Number(r.value))||
      typeof r.unit!=='string'||!r.unit.trim()||
      typeof r.value_kind!=='string'||!r.value_kind.trim()||
      typeof r.measured_at!=='string'||!Number.isFinite(new Date(r.measured_at).getTime())||
      (r.timezone!==null&&(typeof r.timezone!=='string'))||
      !['usual','different_conditions','unknown',null].includes(
        r.comparability as string|null)||
      typeof r.metric_updated_at!=='string'||!r.metric_updated_at.trim()||
      typeof r.session_updated_at!=='string'||!r.session_updated_at.trim())
      return null
    seen.add(id)
    parts.push([id,r.measurement_session_id,metricKey,r.value,r.unit,
      r.value_kind,r.measured_at,r.timezone,r.comparability,
      r.metric_updated_at,r.session_updated_at])
  }
  parts.sort((a,b)=>String(a[0]).localeCompare(String(b[0]),'en'))
  return createHash('sha256').update(JSON.stringify([metricKey,parts])).digest('hex')
}

export async function loadBodyProjectionSource(
  sql:Sql,metricKey:string,
):Promise<BodyProjectionRead>{
  const rows=await sql.query(BODY_GOAL_PROJECTION_SOURCE_SQL,[metricKey]) as
    Array<Record<string,unknown>>
  return{rows,revision:fingerprintBodyProjectionRows(metricKey,rows),total:rows.length}
}
