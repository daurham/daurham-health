import type {TodaySupplementInput} from '../../src/domain/supplements/types.js'
import {listSupplementRangeInputs} from '../supplements/queries.js'

export type SupplementSourceRecheck='verified'|'changed_or_unavailable'
const validDate=(value:string)=>typeof value==='string'&&
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value)
const hasId=(value:string)=>typeof value==='string'&&value.trim()!==''
const validAmount=(value:number)=>typeof value==='number'&&Number.isFinite(value)&&value>=0
const statuses=new Set(['active','paused','discontinued'])
const adherenceStatuses=new Set(['taken','skipped'])

export function currentSupplementInputsAgree(input:{
  initial:readonly TodaySupplementInput[]
  late:readonly TodaySupplementInput[]
  start:string
  end:string
}):boolean{
  const {start,end}=input
  if(!validDate(start)||!validDate(end)||start>end)return false
  const canonical=(records:readonly TodaySupplementInput[]):string|null=>{
    const ids=new Set<string>()
    const out:TodaySupplementInput[]=[]
    for(const supplement of records){
      if(!hasId(supplement.id)||!hasId(supplement.name)||
         !Number.isInteger(supplement.sortOrder)||ids.has(supplement.id)||
         !Array.isArray(supplement.schedules)||
         !Array.isArray(supplement.events)||!Array.isArray(supplement.adherence))
        return null
      ids.add(supplement.id)
      const slots=new Set<string>()
      for(const slot of supplement.schedules){
        if(!hasId(slot.id)||slots.has(slot.id)||
          slot.supplementId!==supplement.id||
          !Number.isInteger(slot.sortOrder)||
          !validAmount(slot.doseAmount)||!hasId(slot.doseUnit)||
          !Number.isInteger(slot.weekdayMask)||slot.weekdayMask<0||
          slot.weekdayMask>127||
          !validDate(slot.effectiveFrom)||
          (slot.effectiveThrough!=null&&
            (!validDate(slot.effectiveThrough)||
             slot.effectiveThrough<slot.effectiveFrom))||
          (slot.slotLabel!=null&&typeof slot.slotLabel!=='string'))
          return null
        slots.add(slot.id)
      }
      for(const event of supplement.events){
        if(!validDate(event.effectiveDate)||
           !statuses.has(event.status)||event.effectiveDate>end)return null
      }
      const pairs=new Set<string>()
      for(const adherence of supplement.adherence){
        const key=adherence.scheduleId+'|'+adherence.scheduledDate
        if(!slots.has(adherence.scheduleId)||
           !validDate(adherence.scheduledDate)||
           adherence.scheduledDate<start||adherence.scheduledDate>end||
           !adherenceStatuses.has(adherence.status)||pairs.has(key)||
           (adherence.actualDoseAmount!=null&&!validAmount(adherence.actualDoseAmount))||
           (adherence.actualDoseUnit!=null&&typeof adherence.actualDoseUnit!=='string'))
          return null
        pairs.add(key)
      }
      out.push({
        id:supplement.id,name:supplement.name,sortOrder:supplement.sortOrder,
        schedules:[...supplement.schedules].sort((a,b)=>a.id.localeCompare(b.id)),
        // Status rows already have explicit event chronology from source SQL;
        // same-day tie order is meaningful in lifecycleStatusOnDate.
        events:[...supplement.events],
        adherence:[...supplement.adherence].sort((a,b)=>
          a.scheduleId.localeCompare(b.scheduleId)||
          a.scheduledDate.localeCompare(b.scheduledDate)),
      })
    }
    out.sort((a,b)=>a.id.localeCompare(b.id))
    return JSON.stringify(out)
  }
  const first=canonical(input.initial),late=canonical(input.late)
  return first!==null&&late!==null&&first===late
}

/** Requery the same canonical supplement service at the tail of Ask Health
 * retrieval. That service uses four local read-only SQL queries. It does NOT
 * independently attest raw adherence row IDs or provide transaction locking.
 */
export async function recheckCurrentSupplementInputs(input:{
  initial:readonly TodaySupplementInput[]
  start:string
  end:string
  today:string
  read?:typeof listSupplementRangeInputs
}):Promise<SupplementSourceRecheck>{
  if(!validDate(input.start)||!validDate(input.end)||
    !validDate(input.today)||input.start>input.end||input.end>input.today)
    return 'changed_or_unavailable'
  try{
    const late=await(input.read??listSupplementRangeInputs)(input.start,input.end)
    return currentSupplementInputsAgree({
      initial:input.initial,late,start:input.start,end:input.end,
    })?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
