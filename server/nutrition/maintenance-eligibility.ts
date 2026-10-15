import type { NutritionEntry } from '../../src/domain/nutrition/types.js'
import type { HealthIntelligenceSnapshot } from '../../src/domain/intelligence/shared.js'
import { addCalendarDays } from '../../src/domain/training-plan.js'
import { getSql, type Sql } from '../db.js'
import { SOURCE_REVISION_SQL } from './day-completeness.js'

type Candidate = {
  date: string
  calories: number | string
  source_ids: unknown
}

/**
 * Evaluate all potentially confirmed days with ONE round trip.
 * The correlated revision query reuses the same digest as day confirmation.
 * No old day, absent confirmation, stale digest, fast, analysis-excluded row,
 * or unknown/AI-only food source is silently promoted to maintenance evidence.
 */
const currentRevision = SOURCE_REVISION_SQL
  .replaceAll('$1::date', 'c.health_date')
  .replaceAll('$1::text', 'c.health_date::text')

export const VERIFIED_NUTRITION_DAYS_SQL = [
  'SELECT c.health_date::text AS date, SUM(e.calories)::text AS calories,',
  '  array_agg(e.id::text ORDER BY e.id) AS source_ids',
  'FROM nutrition_day_completeness c',
  'CROSS JOIN LATERAL (' + currentRevision + ') current_source',
  'JOIN nutrition_entries e ON e.log_date = c.health_date',
  "WHERE c.health_date >= $1::date AND c.health_date <= $2::date AND c.health_date < $3::date",
  "  AND c.owner_report = 'complete' AND NOT c.zero_intake_fast",
  '  AND c.entry_revision = current_source.revision',
  "  AND NOT EXISTS (SELECT 1 FROM nutrition_entries n WHERE n.log_date = c.health_date",
  "    AND (n.evidence_quality IS NULL OR n.evidence_quality NOT IN ('measured_reference', 'owner_entered')",
  '      OR n.calories IS NULL OR n.calories < 0))',
  "  AND NOT EXISTS (SELECT 1 FROM data_quality_reviews r",
  "    WHERE r.review_status = 'excluded_from_analysis' AND (",
  "      (r.entity_kind = 'nutrition_day' AND r.entity_id = c.health_date::text)",
  "      OR (r.entity_kind = 'nutrition_entry' AND EXISTS (SELECT 1 FROM nutrition_entries n",
  "        WHERE n.log_date = c.health_date AND n.id::text = r.entity_id))",
  "      OR (r.entity_kind = 'nutrition_entry_pair' AND EXISTS (SELECT 1 FROM nutrition_entries n",
  "        WHERE n.log_date = c.health_date AND (",
  "          n.id::text = ANY(string_to_array(r.entity_id, ':'))",
  "          OR (r.issue_snapshot -> 'metadata' -> 'entryIds') ? n.id::text",
  '        )))',
  '    ))',
  'GROUP BY c.health_date, c.entry_revision, current_source.revision',
  'HAVING SUM(e.calories) > 0',
].join('\n')

/**
 * Validate the DB-calculated candidates against the preloaded intelligence
 * snapshot. If there was a between-reads mutation, mismatched kcal/IDs become
 * ineligible rather than being counted as corroborated intake.
 */
export function verifiedNutritionDaysFromRows(
  candidates: readonly Candidate[],
  snapshot: HealthIntelligenceSnapshot,
): ReadonlySet<string> {
  const verified = new Set<string>()
  const dayByDate = new Map(snapshot.frame.map((day) => [day.date, day]))
  for (const row of candidates) {
    if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue
    const calories = Number(row.calories)
    const ids = row.source_ids
    if (!Number.isFinite(calories) || calories <= 0 || !Array.isArray(ids) ||
        ids.length === 0 || ids.some((id) => typeof id !== 'string')) continue
    const observation = dayByDate.get(row.date)?.signals['nutrition.calories']
    if (!observation || observation.quality !== 'high_confidence' ||
        observation.provenance === 'unknown' ||
        Math.abs(observation.value - calories) > 0.00001) continue
    const expected = [...ids].sort()
    const actual = [...observation.sourceIds].sort()
    if (expected.length !== actual.length || expected.some((id, i) => id !== actual[i])) continue
    verified.add(row.date)
  }
  return verified
}

export async function loadVerifiedNutritionDays(input: {
  snapshot: HealthIntelligenceSnapshot
  asOf: string
  today: string | null
  /** Shared intelligence ranges can exceed Maintenance's trailing 30 days. */
  startDate?: string
  sqlOverride?: Sql
}): Promise<ReadonlySet<string>> {
  if (!input.today) return new Set<string>()
  const sql = input.sqlOverride ?? await getSql()
  const rows = await sql.query(VERIFIED_NUTRITION_DAYS_SQL, [
    input.startDate ?? addCalendarDays(input.asOf, -29), input.asOf, input.today,
  ]) as Candidate[]
  return verifiedNutritionDaysFromRows(rows, input.snapshot)
}

/**
 * Weekly intake comparisons require an explicit read-time cross-check of
 * stored confirmations against the same canonical Nutrition rows Weekly Coach
 * used for its other facts. A stale or changed row disqualifies the date.
 */
export function verifiedWeeklyNutritionDatesFromRows(
  candidates: readonly Candidate[],
  entries: readonly Pick<NutritionEntry, 'id' | 'logDate' | 'calories'>[],
): ReadonlySet<string> {
  const byDate = new Map<string, Array<{ id: string; calories: number }>>()
  for (const entry of entries) {
    const rows = byDate.get(entry.logDate) ?? []
    rows.push({ id: entry.id, calories: entry.calories })
    byDate.set(entry.logDate, rows)
  }
  const allowed = new Set<string>()
  for (const row of candidates) {
    if (typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date)) continue
    if (!Array.isArray(row.source_ids) || row.source_ids.length === 0 ||
        row.source_ids.some((id) => typeof id !== 'string')) continue
    const records = byDate.get(row.date) ?? []
    const actualIds = records.map((entry) => entry.id).sort()
    const expectedIds = [...row.source_ids].sort()
    const kcal = Number(row.calories)
    if (!Number.isFinite(kcal) || kcal <= 0 || actualIds.length !== expectedIds.length ||
        expectedIds.some((id, i) => actualIds[i] !== id) ||
        Math.abs(records.reduce((sum, entry) => sum + entry.calories, 0) - kcal) > 0.00001) continue
    allowed.add(row.date)
  }
  return allowed
}

/** Single set-based SQL query; no paid provider call or per-day database loop. */
export async function loadVerifiedWeeklyNutritionDates(input: {
  asOf: string
  today: string | null
  entries: readonly NutritionEntry[]
  sqlOverride?: Sql
}): Promise<ReadonlySet<string>> {
  if (!input.today) return new Set<string>()
  const sql = input.sqlOverride ?? await getSql()
  const rows = await sql.query(VERIFIED_NUTRITION_DAYS_SQL, [
    addCalendarDays(input.asOf, -29), input.asOf, input.today,
  ]) as Candidate[]
  return verifiedWeeklyNutritionDatesFromRows(rows, input.entries)
}
