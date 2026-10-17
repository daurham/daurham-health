import {getSql,type Sql} from '../db.js'
import {loadBodyProjectionSource} from '../goals/body-projection-source.js'

/** Current-day read-only confirmation that the full history fetched during
 * Goal Control's projection evaluation has not changed by packet completion.
 * No values, identities or fingerprints leave the server for AI evidence.
 */
export type WeightProjectionSourceRead=
  | {status:'available';revision:string;rowCount:number}
  | {status:'unavailable';revision:null;rowCount:null}

export async function readCurrentWeightProjectionSource(
  sqlOverride?:Sql,
):Promise<WeightProjectionSourceRead>{
  const missing:WeightProjectionSourceRead={status:'unavailable',
    revision:null,rowCount:null}
  try{
    const sql=sqlOverride??await getSql()
    const read=await loadBodyProjectionSource(sql,'weight')
    if(!read.revision)return missing
    return{status:'available',revision:read.revision,rowCount:read.total}
  }catch{return missing}
}
