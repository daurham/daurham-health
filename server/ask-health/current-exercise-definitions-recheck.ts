import {getSql,type Sql} from '../db.js'
import {mapProgressExerciseDefinitionRow} from '../progress/queries.js'
import {ANALYTICS_LOAD_TYPES,ANALYTICS_REP_MODES,PERFORMANCE_TYPES,
  type ProgressExerciseDefinition} from '../../src/domain/progress/types.js'

/** Bounded to one small local canonical definition table, with no provider calls.
 * Training trends and loaded-strength math depend on these effective fields.
 */
export const RECHECK_EXERCISE_DEFINITIONS_SQL =
  'SELECT id, external_id, name, measurement_kind, unilateral, '+
  'performance_type, analytics_load_type, analytics_rep_mode '+
  'FROM exercise_definitions ORDER BY name, id'

const valid=(e:ProgressExerciseDefinition)=>(
  typeof e.id==='string'&&e.id.trim()!==''&&
  typeof e.name==='string'&&e.name.trim()!==''&&
  typeof e.measurementKind==='string'&&e.measurementKind.trim()!==''&&
  (e.externalId===null||typeof e.externalId==='string')&&
  typeof e.unilateral==='boolean'&&
  PERFORMANCE_TYPES.includes(e.performanceType)&&
  ANALYTICS_LOAD_TYPES.includes(e.analyticsLoadType)&&
  ANALYTICS_REP_MODES.includes(e.analyticsRepMode)
)

/** Canonical effective fields (not raw row timestamps) must match exactly.
 * Includes unused saved definitions: they can become visible as general
 * exercise labels/matches, even when they have no working sets yet.
 */
export function canonicalExerciseDefinitionsAgree(
  initial:readonly ProgressExerciseDefinition[],
  late:readonly ProgressExerciseDefinition[],
):boolean{
  const serialize=(rows:readonly ProgressExerciseDefinition[])=>{
    const ids=new Set<string>()
    for(const e of rows){
      if(!valid(e)||ids.has(e.id))return null
      ids.add(e.id)
    }
    return JSON.stringify([...rows].sort((a,b)=>a.id.localeCompare(b.id)))
  }
  const before=serialize(initial),after=serialize(late)
  return before!==null&&after!==null&&before===after
}

export type ExerciseDefinitionSourceRecheck='verified'|'changed_or_unavailable'

/** One final local read for eligible current personalized Training evidence.
 * Fail closed if names, strength semantics, aliases or classification change.
 */
export async function recheckCurrentExerciseDefinitions(input:{
  initial:readonly ProgressExerciseDefinition[]
  start:string
  end:string
  today:string
  sqlOverride?:Sql
}):Promise<ExerciseDefinitionSourceRecheck>{
  const date=/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/
  if(!date.test(input.start)||!date.test(input.end)||!date.test(input.today)||
    input.start>input.end||input.end>input.today)
    return 'changed_or_unavailable'
  try{
    const sql=input.sqlOverride??await getSql()
    const rows=(await sql.query(RECHECK_EXERCISE_DEFINITIONS_SQL)) as Record<string,unknown>[]
    const late=rows.map(mapProgressExerciseDefinitionRow)
    return canonicalExerciseDefinitionsAgree(input.initial,late)
      ?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
