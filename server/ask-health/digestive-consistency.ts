import { VERIFIED_NUTRITION_DAYS_SQL } from '../nutrition/maintenance-eligibility.js'
import { digestivePairingSourcesAgree, type DigestiveExpectedContext, type DigestiveVerifiedFiberAudit, type DigestiveWaterAudit, type DigestiveContextTagAudit } from '../../src/domain/ask-health/digestive-consistency.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import type { DigestiveBowelWindowScope } from '../../src/domain/ask-health/digestive-window.js'
import { getSql } from '../db.js'

/** Read-only and max-90-day: avoid fetching unbounded raw notes and IDs
 * into Ask Health. The pure validator receives the rows server-side only.
 * Any SQL/query failure returns false and withholds mixed-domain pairing.
 */
export async function recheckDigestivePairingSources(input:{
  snapshot: HealthIntelligenceSnapshot
  scope: DigestiveBowelWindowScope
  today: string
  contexts: readonly DigestiveExpectedContext[]
}):Promise<boolean>{
  const {scope,today}=input
  if (scope.start < input.snapshot.period.start || scope.end > input.snapshot.period.end ||
      scope.end > input.snapshot.asOf || scope.end > today ||
      scope.calendarDays < 1 || scope.calendarDays > 90) return false
  try {
    const sql=await getSql()
    const [fiberRows,waterRows,tagRows]=await Promise.all([
      sql.query(
        `SELECT verified.date, verified.source_ids, verified.calories,
                SUM(n.fiber)::text AS fiber,
                count(*) FILTER (WHERE n.fiber IS NULL)::int AS missing_fiber
           FROM (${VERIFIED_NUTRITION_DAYS_SQL}) verified
           JOIN nutrition_entries n ON n.log_date = verified.date::date
           GROUP BY verified.date, verified.source_ids, verified.calories`,
        [scope.start,scope.end,today],
      ),
      sql.query(
        `SELECT hydration_date::text AS date,
                array_agg(id::text ORDER BY id) AS source_ids,
                SUM(amount_ml)::text AS amount_ml
           FROM hydration_events
           WHERE hydration_date >= $1::date AND hydration_date <= $2::date AND hydration_date < $3::date
           GROUP BY hydration_date`,
        [scope.start,scope.end,today],
      ),
      sql.query(
        `SELECT c.context_date::text AS date,t.tag_key
           FROM daily_context c
           JOIN daily_context_tags t ON t.context_id = c.id
           WHERE c.context_date >= $1::date AND c.context_date <= $2::date AND c.context_date < $3::date
           ORDER BY c.context_date,t.tag_key`,
        [scope.start,scope.end,today],
      ),
    ])
    return digestivePairingSourcesAgree({
      snapshot:input.snapshot,scope,today,expectedContexts:input.contexts,
      verifiedFiberRows:fiberRows as DigestiveVerifiedFiberAudit[],
      waterRows:waterRows as DigestiveWaterAudit[],
      contextTagRows:tagRows as DigestiveContextTagAudit[],
    })
  }catch{
    return false
  }
}
