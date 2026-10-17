import {getSql,type Sql} from '../db.js'
import {mapProgressSetRow} from '../progress/queries.js'
import type {CanonicalSetRecord} from '../../src/domain/progress/types.js'

/** Exact canonical rows, bounded to the Health-selected date window and,
 * for a focused exercise, its saved definition ID. No PHI enters output.
 * This mirrors the original Progress set SELECT; not a transaction.
 */
export const RECHECK_WORKING_SETS_SQL =
  'SELECT sets.id AS set_id, sessions.id AS session_id, '+
  'exercises.id AS session_exercise_id, '+
  'exercises.exercise_definition_id AS exercise_id, '+
  'sessions.workout_date AS session_date, '+
  'sessions.created_at AS session_created_at, '+
  'exercises.position AS session_exercise_position, '+
  'sets.set_number, sets.set_type, sets.load_state, sets.weight_kg, '+
  'sets.reps, sets.duration_sec, sets.left_reps, sets.right_reps, '+
  'sets.left_duration_sec, sets.right_duration_sec '+
  'FROM workout_sets AS sets '+
  'JOIN workout_session_exercises AS exercises '+
  'ON exercises.id = sets.workout_session_exercise_id '+
  'JOIN workout_sessions AS sessions '+
  'ON sessions.id = exercises.workout_session_id '+
  'WHERE sessions.workout_date >= $1::date '+
  'AND sessions.workout_date <= $2::date '+
  'AND ($3::text IS NULL OR exercises.exercise_definition_id::text = $3::text) '+
  'ORDER BY sessions.workout_date ASC, sessions.created_at ASC, '+
  'sessions.id ASC, exercises.position ASC, sets.set_number ASC, sets.id ASC'

const date=(s:string)=>/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(s)
const stringId=(s:string)=>typeof s==='string'&&s.trim()!==''&&s!=='undefined'&&s!=='null'

/** Compares ALL selected canonical sets, including warmups, bad/incomplete
 * sets and sets not currently chosen for the estimated-strength sample.
 * Identity alone cannot catch a changed value under an unchanged set ID.
 */
export function canonicalWorkingSetsAgree(input:{
  initial:readonly CanonicalSetRecord[]
  late:readonly CanonicalSetRecord[]
  start:string
  end:string
  exerciseId:string|null
}):boolean{
  const {start,end,exerciseId}=input
  if(!date(start)||!date(end)||start>end||
    (exerciseId!=null&&!stringId(exerciseId)))return false
  const selected=(items:readonly CanonicalSetRecord[])=>{
    const seen=new Set<string>()
    const result:CanonicalSetRecord[]=[]
    for(const row of items){
      if(row.sessionDate<start||row.sessionDate>end||
         (exerciseId!=null&&row.exerciseId!==exerciseId))continue
      if(!stringId(row.setId)||!stringId(row.sessionId)||
         !stringId(row.sessionExerciseId)||!stringId(row.exerciseId)||
         !date(row.sessionDate)||
         typeof row.sessionCreatedAt!=='string'||
         !Number.isFinite(Date.parse(row.sessionCreatedAt))||
         !Number.isInteger(row.sessionExercisePosition)||
         row.sessionExercisePosition<1||
         !Number.isInteger(row.setNumber)||row.setNumber<1||
         !stringId(row.setType)||!stringId(row.loadState)||
         seen.has(row.setId))return null
      seen.add(row.setId)
      result.push(row)
    }
    result.sort((a,b)=>a.setId.localeCompare(b.setId))
    return JSON.stringify(result)
  }
  const a=selected(input.initial),b=selected(input.late)
  return a!==null&&b!==null&&a===b
}
export type WorkingSetSourceRecheck='verified'|'changed_or_unavailable'

/** One late, local read. A correction, deletion, insert, record move, read
 * failure or changed numerical field fails closed, including when the
 * original selected window contained NO sets.
 */
export async function recheckCurrentWorkingSets(input:{
  initial:readonly CanonicalSetRecord[]
  start:string
  end:string
  today:string
  exerciseId:string|null
  sqlOverride?:Sql
}):Promise<WorkingSetSourceRecheck>{
  const {initial,start,end,today,exerciseId}=input
  if(!date(today)||!date(start)||!date(end)||start>end||end>today||
     (exerciseId!=null&&!stringId(exerciseId)))
    return 'changed_or_unavailable'
  try{
    const sql=input.sqlOverride??await getSql()
    const rows=await sql.query(RECHECK_WORKING_SETS_SQL,[start,end,exerciseId])
      as Array<Record<string,unknown>>
    const late=rows.map(mapProgressSetRow)
    return canonicalWorkingSetsAgree({initial,late,start,end,exerciseId})
      ?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
