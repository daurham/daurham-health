import {getSql,type Sql} from '../db.js'

/** Bounded canonical read within two matching maintenance decision revisions.
 * IDs never enter the AI evidence, and no goal/status is mutated.
 */
export const CURRENT_WEIGHT_GOAL_MODE_SQL=`
SELECT g.id::text AS id, v.id::text AS version_id, v.target_mode
FROM goals g LEFT JOIN goal_versions v ON v.goal_id=g.id AND v.is_current
WHERE g.status='active' AND g.goal_kind='body_metric' AND g.body_metric_key='weight'
ORDER BY g.id LIMIT 2
`
export type GoalRead =
  | {status:'available';rows:{id:string;versionId:string;targetMode:string}[]}
  | {status:'unavailable';rows:[]}
export async function readCurrentWeightGoalMode(sqlOverride?:Sql):Promise<GoalRead>{
  try{
    const sql=sqlOverride??await getSql()
    const fetched=await sql.query(CURRENT_WEIGHT_GOAL_MODE_SQL,[]) as unknown
    if(!Array.isArray(fetched)||fetched.length>2)return{status:'unavailable',rows:[]}
    const rows=fetched.map((item:unknown)=>{
      const r=item as Record<string,unknown>
      return {id:r?.id,versionId:r?.version_id,targetMode:r?.target_mode}
    })
    if(!rows.every(r=>typeof r.id==='string'&&r.id.length>0&&
      typeof r.versionId==='string'&&r.versionId.length>0&&
      ['at_most','at_least','range'].includes(r.targetMode as string))){
      return {status:'unavailable',rows:[]}
    }
    return{status:'available',rows:rows as {id:string;versionId:string;targetMode:string}[]}
  }catch{return{status:'unavailable',rows:[]}}
}
