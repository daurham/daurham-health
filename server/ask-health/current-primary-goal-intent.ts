import {getSql, type Sql} from '../db.js'
import {readPrimaryGoalIntent} from '../goals/primary-intent.js'
import type {PrimaryGoalIntent} from '../../src/domain/primary-goal-intent.js'

/** Reuse Goal Control's effective-dated owner intent, not a guessed goal ranking.
 * The enclosing maintenance revision fingerprints that same as-of declaration.
 * SQL failure (including a missing migration) must not be mistaken for unset.
 */
export type CurrentPrimaryIntentRead =
  | {status:'available';intent:PrimaryGoalIntent}
  | {status:'unavailable';intent:null}

export async function readCurrentPrimaryGoalIntent(
  asOf:string,sqlOverride?:Sql,
):Promise<CurrentPrimaryIntentRead>{
  try{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf))return{status:'unavailable',intent:null}
    const sql=sqlOverride??await getSql()
    const intent=await readPrimaryGoalIntent(sql,asOf)
    if(intent.source==='unset'){
      return intent.version===0&&intent.primaryGoalId==null&&intent.effectiveFrom==null
        ? {status:'available',intent}:{status:'unavailable',intent:null}
    }
    if(intent.source!=='owner'||!Number.isSafeInteger(intent.version)||
       intent.version<=0||typeof intent.effectiveFrom!=='string'||
       intent.effectiveFrom>asOf||
       (intent.primaryGoalId!=null&&
         (typeof intent.primaryGoalId!=='string'||!intent.primaryGoalId.trim())))
      return{status:'unavailable',intent:null}
    return{status:'available',intent}
  }catch{
    return{status:'unavailable',intent:null}
  }
}
