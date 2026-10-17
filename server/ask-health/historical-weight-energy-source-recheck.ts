import {getSql,type Sql} from '../db.js'
import type {HealthIntelligenceSnapshot} from '../../src/domain/intelligence/shared.js'
import {addCalendarDays} from '../../src/domain/training-plan.js'
import {verifiedNutritionDaysFromRows} from '../nutrition/maintenance-eligibility.js'
import {
  CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL,nutritionNutrientsStillMatch,
} from './current-weight-nutrition-recheck.js'
import {
  LATE_WEIGHT_INTELLIGENCE_SQL,historicalWeightObservationsAgree,
} from './current-weight-activity-recheck.js'

export type HistoricalSourceRecheck='verified'|'changed_or_unavailable'
type Candidate={date:string;calories:number|string;source_ids:unknown;
  protein?:number|string|null;carbs?:number|string|null;sodium?:number|string|null}

/** Revalidate ONLY the explicitly selected past date/window. This is not a
 * historical version of current Goals or an atomic multi-source snapshot.
 * The canonical food eligibility query already checks owner confirmation,
 * evidence quality, revision digest, and exclusions; this check additionally
 * compares source IDs, daily nutrient values, and selected weight conditions.
 */
export async function recheckHistoricalWeightEnergySources(input:{
  snapshot:HealthIntelligenceSnapshot;today:string;start:string;end:string;
  sqlOverride?:Sql
}):Promise<HistoricalSourceRecheck>{
  const {snapshot,today,start,end}=input
  if(!/^\d{4}-\d{2}-\d{2}$/.test(today)||
    !/^\d{4}-\d{2}-\d{2}$/.test(start)||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)||
    start<snapshot.period.start||end>snapshot.period.end||
    end>snapshot.asOf||end>=today||start>end||
    addCalendarDays(start,89)<end||!snapshot.timezone||
    snapshot.coverage.find(c=>c.key==='nutrition.calories')?.completenessCheck!=='available')
    return 'changed_or_unavailable'
  try{
    const sql=input.sqlOverride??await getSql()
    const [nutritionRows,weightRows]=await Promise.all([
      sql.query(CURRENT_WEIGHT_NUTRIENT_RECHECK_SQL,[start,end,today]),
      sql.query(LATE_WEIGHT_INTELLIGENCE_SQL,
        [end,snapshot.timezone,addCalendarDays(start,-2)]),
    ]) as [Candidate[],Record<string,unknown>[]]
    if(!Array.isArray(nutritionRows)||!Array.isArray(weightRows))
      return 'changed_or_unavailable'
    const initial=snapshot.frame.flatMap(day=>{
      if(day.date<start||day.date>end)return []
      const calories=day.signals['nutrition.calories']
      return calories?.dayCompleteness==='verified_complete'&&
        calories.quality==='high_confidence'&&calories.value>0&&
        Number.isFinite(calories.value)&&calories.sourceIds.length>0&&
        new Set(calories.sourceIds).size===calories.sourceIds.length
        ?[day.date]:[]
    })
    const verified=verifiedNutritionDaysFromRows(nutritionRows,snapshot)
    // A newly confirmed eligible day must not remain invisible just because
    // the first snapshot had no owner confirmation for it.
    const foodMatches=nutritionRows.length===verified.size&&
      initial.length===verified.size&&initial.every(date=>verified.has(date))&&
      nutritionNutrientsStillMatch(snapshot,nutritionRows,verified)
    const weightsMatch=historicalWeightObservationsAgree(snapshot,weightRows,start,end)
    return foodMatches&&weightsMatch?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
