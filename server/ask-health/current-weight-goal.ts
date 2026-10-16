import {getSql,type Sql} from '../db.js'

/** Bounded canonical read within two matching maintenance decision revisions.
 * IDs never enter the AI evidence, and no goal/status is mutated.
 */
export const CURRENT_WEIGHT_GOAL_MODE_SQL=`
SELECT g.id::text AS id, v.id::text AS version_id, v.target_mode,
       v.target_min::text AS target_min, v.target_max::text AS target_max,
       v.target_unit
FROM goals g LEFT JOIN goal_versions v ON v.goal_id=g.id AND v.is_current
WHERE g.status='active' AND g.goal_kind='body_metric' AND g.body_metric_key='weight'
  AND g.started_on <= $1::date
ORDER BY g.id LIMIT 2
`
export type GoalRead =
  | {status:'available';rows:{
      id:string;versionId:string;targetMode:string
      /** Only used in a version-matched private computation; never exported to AI evidence. */
      targetMinKg:number|null;targetMaxKg:number|null
    }[]}
  | {status:'unavailable';rows:[]}
export async function readCurrentWeightGoalMode(asOf:string,sqlOverride?:Sql):Promise<GoalRead>{
  try{
    const sql=sqlOverride??await getSql()
    const fetched=await sql.query(CURRENT_WEIGHT_GOAL_MODE_SQL,[asOf]) as unknown
    if(!Array.isArray(fetched)||fetched.length>2)return{status:'unavailable',rows:[]}
    const rows=fetched.map((item:unknown)=>{
      const r=item as Record<string,unknown>
      const unit=r?.target_unit
      const rawMin=r?.target_min
      const rawMax=r?.target_max
      const min=rawMin==null?null:Number(rawMin)
      const max=rawMax==null?null:Number(rawMax)
      const multiplier=unit==='lb'?0.45359237:1
      return {id:r?.id,versionId:r?.version_id,targetMode:r?.target_mode,
        targetMinKg:min==null?null:min*multiplier,
        targetMaxKg:max==null?null:max*multiplier,
        unit,rawMin,rawMax}

    })
    if(!rows.every(r=>typeof r.id==='string'&&r.id.length>0&&
      typeof r.versionId==='string'&&r.versionId.length>0&&
      ['at_most','at_least','range'].includes(r.targetMode as string)&&
      (r.unit==='kg'||r.unit==='lb') &&
      (r.rawMin==null || (typeof r.rawMin==='string'||typeof r.rawMin==='number')) &&
      (r.rawMax==null || (typeof r.rawMax==='string'||typeof r.rawMax==='number')) &&
      (r.targetMinKg==null||(Number.isFinite(r.targetMinKg)&&r.targetMinKg>0))&&
      (r.targetMaxKg==null||(Number.isFinite(r.targetMaxKg)&&r.targetMaxKg>0))&&
      (r.targetMode==='at_most'?r.targetMinKg==null&&r.targetMaxKg!=null:
       r.targetMode==='at_least'?r.targetMinKg!=null&&r.targetMaxKg==null:
       r.targetMinKg!=null&&r.targetMaxKg!=null&&r.targetMinKg<=r.targetMaxKg))){
      return {status:'unavailable',rows:[]}
    }
    return{status:'available',rows:rows.map(r=>({id:r.id as string,versionId:r.versionId as string,
      targetMode:r.targetMode as string,targetMinKg:r.targetMinKg,targetMaxKg:r.targetMaxKg}))}
  }catch{return{status:'unavailable',rows:[]}}
}
