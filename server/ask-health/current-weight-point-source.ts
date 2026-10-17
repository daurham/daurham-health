import {getSql,type Sql} from '../db.js'
import {loadBodyGoalPointAsOf,BODY_GOAL_AS_OF_SQL} from '../goals/as-of-point-evidence.js'

/** Uses the exact canonical latest weight as-of query for a bounded recheck. */
export {BODY_GOAL_AS_OF_SQL as CANONICAL_WEIGHT_POINT_SOURCE_SQL}
export type WeightPointSourceRead=
  |{status:'available';hasPoint:boolean;revision:string|null;
    comparability:'usual'|'different_conditions'|'unknown'|null}
  |{status:'unavailable';hasPoint:null;revision:null}
export async function readCurrentWeightPointSource(
  asOf:string,timezone:string,sqlOverride?:Sql,
):Promise<WeightPointSourceRead>{
  const missing:WeightPointSourceRead={status:'unavailable',hasPoint:null,revision:null}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||!timezone.trim())return missing
  try{
    const sql=sqlOverride??await getSql()
    const point=await loadBodyGoalPointAsOf(sql,'weight',timezone,asOf)
    // The canonical SQL always selects comparability. Missing metadata in
    // an inconsistent/mocked read is not evidence of usual conditions.
    if(point&&(!point.sourceRevision||point.comparability===undefined))
      return missing
    return{status:'available',hasPoint:point!=null,
      revision:point?.sourceRevision??null,
      comparability:point?.comparability??null}
  }catch{return missing}
}
