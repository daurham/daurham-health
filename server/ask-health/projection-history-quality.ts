import {calendarDateFromInstant,calendarDaysBetween,addCalendarDays} from '../../src/domain/progress/dates.js'
import {observationToGoalUnit} from '../../src/domain/goals.js'
import {PROGRESS_ANALYTICS_CONFIG} from '../../src/domain/progress/config.js'

/** A conservative temporal-sampling screen, NOT measurement comparability,
 * trend direction, a clinical judgment, or permission to act on a projection.
 * Called only on rows already covered by the identical private revision.
 */
export type WeightProjectionHistoryQuality =
  'date_spread_sufficient'|'date_spread_limited'|
  'measurement_conditions_unverified'|'unavailable'

export function assessWeightProjectionHistory(
  rows:readonly Record<string,unknown>[],asOf:string,
):WeightProjectionHistoryQuality{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(asOf)||rows.length>3000)
    return 'unavailable'
  const dates=new Set<string>()
  let unsupportedConditions=false
  const windowStart=addCalendarDays(asOf,-90)
  for(const row of rows){
    if(row.metric_key!=='weight'||typeof row.measured_at!=='string'||
       typeof row.unit!=='string'||typeof row.value!=='string'||
       !Number.isFinite(Number(row.value))||Number(row.value)<=0)
      return 'unavailable'
    const value=observationToGoalUnit(Number(row.value),row.unit,'lb')
    if(value===null||!Number.isFinite(value)||value<=0)return 'unavailable'
    const instant=new Date(row.measured_at)
    if(!Number.isFinite(instant.getTime()))return 'unavailable'
    if(row.timezone!=null){
      if(typeof row.timezone!=='string'||!row.timezone.trim())
        return 'unavailable'
      try{new Intl.DateTimeFormat('en-US',{timeZone:row.timezone}).format(instant)}
      catch{return 'unavailable'}
    }
    const day=calendarDateFromInstant(instant,row.timezone as string|null)
    // Canonical Goal projections use no future points and only 90-day
    // evidence. Multiple sessions on one day count once.
    if(day<=asOf&&day>=windowStart){
      dates.add(day)
      // The same full source series feeds the canonical slope, so five
      // "usual" points do not make an estimate comparable if another
      // included point came from unknown or different conditions.
      if(row.comparability!=='usual')unsupportedConditions=true
    }
  }
  const sorted=[...dates].sort()
  const first=sorted[0],last=sorted[sorted.length-1]
  if(!first||!last||sorted.length<
    PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumMeasurements)
    return 'date_spread_limited'
  const span=calendarDaysBetween(first,last)
  if(span<PROGRESS_ANALYTICS_CONFIG.bodyWeightTrend.minimumSpanDays||
     calendarDaysBetween(last,asOf)>14)
    return 'date_spread_limited'
  // A count of five does not mean five independently distributed weigh-in
  // dates. Require coverage of both halves of the observed span and no
  // unobserved gap over three weeks. This is a heuristic, not a guarantee.
  const mid=addCalendarDays(first,Math.floor(span/2))
  if(sorted.filter(d=>d<=mid).length<2||
     sorted.filter(d=>d>mid).length<2)
    return 'date_spread_limited'
  for(let i=1;i<sorted.length;i++)
    if(calendarDaysBetween(sorted[i-1]!,sorted[i]!)>21)
      return 'date_spread_limited'
  return unsupportedConditions?'measurement_conditions_unverified':
    'date_spread_sufficient'
}
