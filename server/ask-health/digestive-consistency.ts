import { VERIFIED_NUTRITION_DAYS_SQL } from '../nutrition/maintenance-eligibility.js'
import { digestivePairingSourcesAgree, type DigestiveExpectedContext, type DigestiveVerifiedFiberAudit, type DigestiveWaterAudit, type DigestiveContextTagAudit } from '../../src/domain/ask-health/digestive-consistency.js'
import { MAX_BOWEL_WINDOW_DAYS, type DigestiveBowelWindowScope } from '../../src/domain/ask-health/digestive-window.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import { getSql, type Sql } from '../db.js'

/**
 * One read-only PostgreSQL statement means the three rechecked source sets
 * share ONE statement-level MVCC snapshot. The earlier canonical owner reads
 * remain independent: this does not form a request-wide transaction.
 *
 * Never select notes, bowel details, unbounded owner history or raw source
 * records into an AI packet. The entire 90-day result is processed server-only.
 */
export const DIGESTIVE_PAIRING_SOURCE_RECHECK_SQL = `
WITH verified_nutrition AS (
  ${VERIFIED_NUTRITION_DAYS_SQL}
),
fiber_rows AS (
  SELECT v.date, v.source_ids, v.calories,
         SUM(n.fiber)::text AS fiber,
         count(*) FILTER (WHERE n.fiber IS NULL)::int AS missing_fiber
    FROM verified_nutrition v
    JOIN nutrition_entries n ON n.log_date = v.date::date
   GROUP BY v.date, v.source_ids, v.calories
),
water_rows AS (
  SELECT hydration_date::text AS date,
         array_agg(id::text ORDER BY id) AS source_ids,
         SUM(amount_ml)::text AS amount_ml
    FROM hydration_events
   WHERE hydration_date >= $1::date
     AND hydration_date <= $2::date
     AND hydration_date < $3::date
   GROUP BY hydration_date
),
context_tag_rows AS (
  SELECT c.context_date::text AS date, t.tag_key
    FROM daily_context c
    JOIN daily_context_tags t ON t.context_id = c.id
   WHERE c.context_date >= $1::date
     AND c.context_date <= $2::date
     AND c.context_date < $3::date
)
SELECT COALESCE((SELECT jsonb_agg(to_jsonb(f)) FROM fiber_rows f), '[]'::jsonb) AS fiber_rows,
       COALESCE((SELECT jsonb_agg(to_jsonb(w)) FROM water_rows w), '[]'::jsonb) AS water_rows,
       COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM context_tag_rows c), '[]'::jsonb) AS context_tag_rows
`

type AggregateResult = {
  fiber_rows: unknown
  water_rows: unknown
  context_tag_rows: unknown
}

/**
 * Strict JSON array shapes. SQL/transport errors, partial/malformed responses
 * and schema mismatch must NEVER be interpreted as no source records.
 */
function verifiedResult(value: unknown): value is AggregateResult {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const row = value as Record<string, unknown>
  return ['fiber_rows', 'water_rows', 'context_tag_rows'].every(key =>
    Array.isArray(row[key]) &&
    (row[key] as unknown[]).every(item => item != null && typeof item === 'object' && !Array.isArray(item))
  )
}

/** Read-only, one-statement optimistic recheck. No owner data mutation. */
export async function recheckDigestivePairingSources(input: {
  snapshot: HealthIntelligenceSnapshot
  scope: DigestiveBowelWindowScope
  today: string
  contexts: readonly DigestiveExpectedContext[]
  /** Tests inject an inert mock; production resolves the existing guarded DB. */
  sqlOverride?: Sql
}): Promise<boolean> {
  const { scope, today } = input
  if (scope.start < input.snapshot.period.start || scope.end > input.snapshot.period.end ||
      scope.start > scope.end || scope.end > input.snapshot.asOf ||
      scope.end > today || scope.calendarDays < 1 || scope.calendarDays > MAX_BOWEL_WINDOW_DAYS) return false
  try {
    const sql = input.sqlOverride ?? await getSql()
    const rows = await sql.query(DIGESTIVE_PAIRING_SOURCE_RECHECK_SQL, [
      scope.start, scope.end, today,
    ]) as unknown[]
    if (!Array.isArray(rows) || rows.length !== 1 || !verifiedResult(rows[0])) return false
    const row = rows[0]
    return digestivePairingSourcesAgree({
      snapshot: input.snapshot, scope, today, expectedContexts: input.contexts,
      verifiedFiberRows: row.fiber_rows as DigestiveVerifiedFiberAudit[],
      waterRows: row.water_rows as DigestiveWaterAudit[],
      contextTagRows: row.context_tag_rows as DigestiveContextTagAudit[],
    })
  } catch {
    return false
  }
}
