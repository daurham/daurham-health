import type {Sql} from '../db.js'
import {loadVerifiedNutritionDays} from '../nutrition/maintenance-eligibility.js'
import type {HealthIntelligenceSnapshot} from '../../src/domain/intelligence/shared.js'

export type CurrentWeightNutritionRecheck='verified'|'changed_or_unavailable'

/** Second, bounded revision-confirmed Nutrition read after cross-domain
 * retrieval. Compare the original *exact set* of owner-complete dates, not
 * just calories or the number of days. A missing/changed confirmation is
 * unknown, never proof of stable intake or a calibrated energy estimate.
 */
export async function recheckCurrentWeightNutrition(
  snapshot:HealthIntelligenceSnapshot,sqlOverride?:Sql,
):Promise<CurrentWeightNutritionRecheck>{
  if(!snapshot.today||snapshot.asOf!==snapshot.today||
     snapshot.coverage.find(c=>c.key==='nutrition.calories')?.completenessCheck!=='available')
    return 'changed_or_unavailable'
  const expected=snapshot.frame.flatMap(day=>{
    const o=day.signals['nutrition.calories']
    return day.date>=snapshot.period.start&&day.date<=snapshot.asOf&&
      day.date<snapshot.today!&&o?.dayCompleteness==='verified_complete'&&
      o.quality==='high_confidence'&&o.value>0&&Number.isFinite(o.value)&&
      o.sourceIds.length>0&&new Set(o.sourceIds).size===o.sourceIds.length
      ?[day.date]:[]
  })
  try{
    const current=await loadVerifiedNutritionDays({
      snapshot,asOf:snapshot.asOf,today:snapshot.today,
      startDate:snapshot.period.start,sqlOverride,
    })
    return expected.length===current.size&&expected.every(day=>current.has(day))
      ?'verified':'changed_or_unavailable'
  }catch{return 'changed_or_unavailable'}
}
