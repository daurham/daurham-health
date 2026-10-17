import {getSql,type Sql} from '../db.js'
import {VERIFIED_NUTRITION_DAYS_SQL,verifiedNutritionDaysFromRows} from '../nutrition/maintenance-eligibility.js'
import type {HealthIntelligenceSnapshot} from '../../src/domain/intelligence/shared.js'

export type CurrentWeightNutritionRecheck='verified'|'changed_or_unavailable'

/** Existing revision-/exclusion-gated complete-day candidates, with the
 * same-entry nutrient totals used by this specific cross-domain screen.
 * NULL is distinct from 0 when any food entry omits a nutrient.
 */
export const CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL=
  VERIFIED_NUTRITION_DAYS_SQL.replace(
    '  array_agg(e.id::text ORDER BY e.id) AS source_ids',
    [
      '  array_agg(e.id::text ORDER BY e.id) AS source_ids,',
      '  CASE WHEN count(e.protein) = count(*) THEN sum(e.protein)::text ELSE NULL END AS protein,',
      '  CASE WHEN count(e.carbs) = count(*) THEN sum(e.carbs)::text ELSE NULL END AS carbs,',
      '  CASE WHEN count(e.sodium) = count(*) THEN sum(e.sodium)::text ELSE NULL END AS sodium',
    ].join('\n'),
  )
type RecheckedDay={
  date:string;calories:string|number;source_ids:unknown
  protein?:string|number|null;carbs?:string|number|null;sodium?:string|number|null
}
const nutrientKeys=[
  ['nutrition.protein_g','protein'],['nutrition.carbs_g','carbs'],
  ['nutrition.sodium_mg','sodium'],
] as const

/** Validate the full relevant macro/nutrient values, not only calories/IDs.
 * A same-ID, same-kcal backdated macro correction must fail closed.
 */
export function nutritionNutrientsStillMatch(
  snapshot:HealthIntelligenceSnapshot,rows:readonly RecheckedDay[],
  days:ReadonlySet<string>,
):boolean{
  const byDate=new Map(snapshot.frame.map(day=>[day.date,day]))
  for(const date of days){
    const source=rows.find(row=>row.date===date)
    const frame=byDate.get(date)
    if(!source||!frame)return false
    for(const [key,column] of nutrientKeys){
      const original=frame.signals[key]
      const current=source[column]
      if(original==null&&current==null)continue
      if(!original||current==null||typeof current!=='string'&&
         typeof current!=='number')return false
      const value=Number(current)
      if(!Number.isFinite(value)||Math.abs(original.value-value)>0.00001)
        return false
    }
  }
  return true
}

/** Second, bounded revision-confirmed Nutrition read after cross-domain
 * retrieval. Compare the original *exact set* of owner-complete dates, not
 * just calories or the number of days. A missing/changed confirmation is
 * unknown, never proof of stable intake or a calibrated energy estimate.
 */
export async function recheckCurrentWeightNutrition(
  snapshot:HealthIntelligenceSnapshot,today:string,sqlOverride?:Sql,
):Promise<CurrentWeightNutritionRecheck>{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||snapshot.asOf!==today||
     snapshot.coverage.find(c=>c.key==='nutrition.calories')?.completenessCheck!=='available')
    return 'changed_or_unavailable'
  const expected=snapshot.frame.flatMap(day=>{
    const o=day.signals['nutrition.calories']
    return day.date>=snapshot.period.start&&day.date<=snapshot.asOf&&
      day.date<today&&o?.dayCompleteness==='verified_complete'&&
      o.quality==='high_confidence'&&o.value>0&&Number.isFinite(o.value)&&
      o.sourceIds.length>0&&new Set(o.sourceIds).size===o.sourceIds.length
      ?[day.date]:[]
  })
  try{
    // Identical canonical source/revision/eligibility SQL; this extension
    // additionally returns nutrition components from the same matched entries.
    const sql=sqlOverride??await getSql()
    const rows=await sql.query(CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL,
      [snapshot.period.start,snapshot.asOf,today]) as RecheckedDay[]
    const current=verifiedNutritionDaysFromRows(rows,snapshot)
    return expected.length===current.size&&expected.every(day=>current.has(day))&&
      nutritionNutrientsStillMatch(snapshot,rows,current)
      ?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
