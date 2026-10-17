import {isDailyContextTagKey,type DailyContext} from '../../src/domain/context.js'
import {listDailyContexts} from '../context/service.js'

export type CurrentContextSourceRecheck='verified'|'changed_or_unavailable'

/** Exact saved records incl. revision timestamps; order-independent, but
 * missing, duplicated or malformed identities fail closed.
 */
export function currentDailyContextsAgree(first:readonly DailyContext[],
  late:readonly DailyContext[],start:string,end:string):boolean{
  const canonical=(rows:readonly DailyContext[])=>{
    const dates=new Set<string>(),ids=new Set<string>()
    const out:Array<{id:string;date:string;note:string|null;tags:string[];
      createdAt:string;updatedAt:string}>=[]
    for(const row of rows){
      if(typeof row.id!=='string'||row.id.trim()===''||
         typeof row.contextDate!=='string'||
         !/^\d{4}-\d{2}-\d{2}$/.test(row.contextDate)||
         row.contextDate<start||row.contextDate>end||
         ids.has(row.id)||dates.has(row.contextDate)||
         row.note!==null&&typeof row.note!=='string'||
         typeof row.createdAt!=='string'||!Number.isFinite(Date.parse(row.createdAt))||
         typeof row.updatedAt!=='string'||!Number.isFinite(Date.parse(row.updatedAt))||
         !Array.isArray(row.tags)||
         row.tags.some(tag=>!isDailyContextTagKey(tag))||
         new Set(row.tags).size!==row.tags.length)return null
      dates.add(row.contextDate);ids.add(row.id)
      out.push({id:row.id,date:row.contextDate,note:row.note,
        tags:[...row.tags].sort(),createdAt:row.createdAt,updatedAt:row.updatedAt})
    }
    out.sort((a,b)=>a.date.localeCompare(b.date))
    return JSON.stringify(out)
  }
  const left=canonical(first),right=canonical(late)
  return left!=null&&right!=null&&left===right
}

/** A late bounded Context service read (rows and tags if present).
 * Neither raw notes nor source identities enter the AI evidence packet.
 */
export async function recheckCurrentDailyContexts(input:{
  first:readonly DailyContext[];start:string;end:string;today:string
  read?:typeof listDailyContexts
}):Promise<CurrentContextSourceRecheck>{
  const {first,start,end,today}=input
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||
    !/^\d{4}-\d{2}-\d{2}$/.test(start)||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)||
    start>end||end>today)return 'changed_or_unavailable'
  try{
    const late=await (input.read??listDailyContexts)(start,end)
    return currentDailyContextsAgree(first,late,start,end)
      ?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
