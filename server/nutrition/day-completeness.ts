import { z } from 'zod'
import { nutritionDayQuality, type NutritionEvidenceQuality } from '../../src/domain/nutrition/quality.js'
import { assessNutritionDayCompleteness } from '../../src/domain/nutrition/day-completeness.js'
import { getSql, type Sql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'
import { parseNutritionDayQuery } from './service.js'

/** Canonical revision includes ALL entry fields and relevant exclusion reviews.
 * Only its SHA-256 digest leaves the database, never private source payload.
 */
export const SOURCE_REVISION_SQL = [
  "SELECT encode(sha256(convert_to(jsonb_build_object(",
  " 'entries', COALESCE((",
  "   SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM nutrition_entries e",
  "   WHERE e.log_date = $1::date",
  " ), '[]'::jsonb),",
  " 'reviews', COALESCE((",
  "   SELECT jsonb_agg(to_jsonb(r) ORDER BY r.entity_kind, r.entity_id, r.fingerprint)",
  "   FROM data_quality_reviews r",
  "   WHERE (r.entity_kind = 'nutrition_day' AND r.entity_id = $1::text)",
  "   OR (r.entity_kind = 'nutrition_entry' AND EXISTS (",
  "     SELECT 1 FROM nutrition_entries e",
  "     WHERE e.log_date = $1::date AND e.id::text = r.entity_id",
  "   ))",
  "   OR (r.entity_kind = 'nutrition_entry_pair' AND EXISTS (",
  "     SELECT 1 FROM nutrition_entries e WHERE e.log_date = $1::date AND (",
  "       e.id::text = ANY(string_to_array(r.entity_id, ':'))",
  "       OR (r.issue_snapshot -> 'metadata' -> 'entryIds') ? e.id::text",
  "     )",
  "   ))",
  " ), '[]'::jsonb)",
  ")::text, 'UTF8')), 'hex') AS revision",
].join('\n')

/** A single statement checks source revision AND confirmation version.
 * Revisions after a write invalidate its stored report on the next read.
 */
export const WRITE_NUTRITION_DAY_CONFIRMATION_SQL = [
  'WITH source AS (', SOURCE_REVISION_SQL, '), written AS (',
  'INSERT INTO nutrition_day_completeness (',
  '  health_date, owner_report, zero_intake_fast, entry_revision, version, confirmed_at, updated_at',
  ') SELECT $1::date, $3::text, $4::boolean, source.revision, 1, now(), now()',
  'FROM source',
  'WHERE source.revision = $2::text',
  'AND ($5::integer = 0 OR EXISTS (',
  '  SELECT 1 FROM nutrition_day_completeness c',
  '  WHERE c.health_date = $1::date AND c.version = $5::integer',
  '))',
  "AND ($3::text <> 'complete' OR $4::boolean OR EXISTS (",
  '  SELECT 1 FROM nutrition_entries e WHERE e.log_date = $1::date',
  '))',
  'AND (NOT $4::boolean OR NOT EXISTS (',
  '  SELECT 1 FROM nutrition_entries e WHERE e.log_date = $1::date',
  '))',
  'ON CONFLICT (health_date) DO UPDATE',
  'SET owner_report = EXCLUDED.owner_report,',
  '  zero_intake_fast = EXCLUDED.zero_intake_fast,',
  '  entry_revision = EXCLUDED.entry_revision,',
  '  version = nutrition_day_completeness.version + 1,',
  '  confirmed_at = now(), updated_at = now()',
  'WHERE nutrition_day_completeness.version = $5::integer',
  'RETURNING health_date',
  ') SELECT health_date::text AS date FROM written',
].join('\n')

const ENTRY_ROWS_SQL = [
  'SELECT e.calories, e.evidence_quality,',
  'EXISTS (SELECT 1 FROM data_quality_reviews r',
  "  WHERE r.review_status = 'excluded_from_analysis' AND (",
  "   (r.entity_kind = 'nutrition_day' AND r.entity_id = $1::text)",
  "   OR (r.entity_kind = 'nutrition_entry' AND r.entity_id = e.id::text)",
  "   OR (r.entity_kind = 'nutrition_entry_pair' AND (",
  "     e.id::text = ANY(string_to_array(r.entity_id, ':'))",
  "     OR (r.issue_snapshot -> 'metadata' -> 'entryIds') ? e.id::text",
  '   ))',
  '  )) AS excluded',
  'FROM nutrition_entries e WHERE e.log_date = $1::date ORDER BY e.id',
].join('\n')

const DAY_EXCLUDED_SQL = [
  'SELECT EXISTS (SELECT 1 FROM data_quality_reviews r',
  "  WHERE r.entity_kind = 'nutrition_day'",
  "    AND r.review_status = 'excluded_from_analysis'",
  '    AND r.entity_id = $1::text) AS excluded',
].join('\n')

type Row = {
  revision?: string
  owner_report?: 'complete' | 'partial' | 'unknown'
  entry_revision?: string
  zero_intake_fast?: boolean
  version?: string | number
  calories?: string | number
  evidence_quality?: string | null
  excluded?: boolean
}
export const nutritionDayReportSchema = z.object({
  date: z.string(),
  ownerReport: z.enum(['complete', 'partial', 'unknown']),
  zeroIntakeFast: z.boolean().optional(),
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/),
  expectedVersion: z.number().int().min(0),
}).strict()

function sourceQuality(rows: readonly Row[]) {
  return nutritionDayQuality(rows.filter((x) => !x.excluded).map((x) => ({
    calories: Number(x.calories),
    evidenceQuality: (
      x.evidence_quality === 'measured_reference' ||
      x.evidence_quality === 'owner_entered' ||
      x.evidence_quality === 'ai_estimate' ||
      x.evidence_quality === 'legacy_unknown'
    ) ? x.evidence_quality as NutritionEvidenceQuality : 'legacy_unknown',
  })))
}

type DayCompletenessRead = {
  date: string
  today: string
  entryRevision: string
  version: number
  ownerReport: 'complete' | 'partial' | 'unknown' | null
  quality: ReturnType<typeof nutritionDayQuality>
  /** Entries physically logged, whether or not excluded from analysis. */
  recordedEntryCount: number
  assessment: ReturnType<typeof assessNutritionDayCompleteness>
}

async function protectDb<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation() }
  catch (error) {
    if (error instanceof HttpError && error.statusCode < 500) throw error
    throw new HttpError(503, 'Nutrition day confirmation is temporarily unavailable',
      undefined, 'NUTRITION_COMPLETENESS_UNAVAILABLE')
  }
}

export async function getNutritionDayCompleteness(
  day: string, sqlOverride?: Sql, todayOverride?: string,
): Promise<DayCompletenessRead> {
  const date = parseNutritionDayQuery(day)
  return protectDb(async () => {
    const sql = sqlOverride ?? await getSql()
    const today = todayOverride ?? await currentHealthDate()
    const [revisions, reports, entries, exclusions] = await Promise.all([
      sql.query(SOURCE_REVISION_SQL, [date]) as Promise<Row[]>,
      sql.query('SELECT owner_report, zero_intake_fast, entry_revision, version FROM nutrition_day_completeness WHERE health_date = $1::date', [date]) as Promise<Row[]>,
      sql.query(ENTRY_ROWS_SQL, [date]) as Promise<Row[]>,
      sql.query(DAY_EXCLUDED_SQL, [date]) as Promise<Row[]>,
    ])
    // The four read queries are not wrapped in a shared database transaction.
    // Recheck the canonical source fingerprint before treating this as a
    // consistent response; a concurrent food edit must not silently yield
    // a completed or maintenance-eligible snapshot.
    const secondRevision = await sql.query(SOURCE_REVISION_SQL, [date]) as Row[]
    if (secondRevision[0]?.revision !== revisions[0]?.revision) {
      throw new HttpError(409, 'Food records changed during this request. Refresh and review again.',
        undefined, 'NUTRITION_COMPLETENESS_STALE')
    }
    const entryRevision = revisions[0]?.revision
    if (!entryRevision || !/^[a-f0-9]{64}$/.test(entryRevision)) throw new Error('Bad revision')
    const report = reports[0]
    const version = report?.version == null ? 0 : Number(report.version)
    if (!Number.isSafeInteger(version) || version < 0) throw new Error('Bad version')
    const quality = sourceQuality(entries)
    const assessment = assessNutritionDayCompleteness({
      date, today, entryRevision, quality,
      recordedEntryCount: entries.length,
      confirmation: report?.owner_report && report.entry_revision
        ? { state: report.owner_report, entryRevision: report.entry_revision,
          zeroIntakeFast: report.zero_intake_fast === true }
        : null,
      excludedFromAnalysis: exclusions[0]?.excluded === true || entries.some((row) => row.excluded === true),
    })
    return { date, today, entryRevision, version,
      ownerReport: report?.owner_report ?? null, quality,
      recordedEntryCount: entries.length, assessment }
  })
}

export async function saveNutritionDayCompleteness(
  body: unknown, sqlOverride?: Sql, todayOverride?: string,
): Promise<DayCompletenessRead> {
  const parsed = nutritionDayReportSchema.safeParse(body)
  if (!parsed.success) throw new HttpError(400, 'Invalid day confirmation',
    undefined, 'NUTRITION_COMPLETENESS_INVALID')
  const value = parsed.data
  const date = parseNutritionDayQuery(value.date)
  const today = todayOverride ?? await currentHealthDate()
  if (date > today) throw new HttpError(400, 'Cannot confirm a future day')
  const fast = value.zeroIntakeFast ?? false
  if (fast && value.ownerReport !== 'complete') throw new HttpError(400, 'Only a complete day can be fasted')
  const existing = await getNutritionDayCompleteness(date, sqlOverride, today)
  if (value.ownerReport === 'complete' && existing.recordedEntryCount === 0 && !fast) {
    throw new HttpError(400, 'An empty food day requires explicit fasting confirmation')
  }
  if (fast && existing.recordedEntryCount > 0) throw new HttpError(400, 'Fasting requires an empty food log')
  return protectDb(async () => {
    const sql = sqlOverride ?? await getSql()
    const rows = await sql.query(WRITE_NUTRITION_DAY_CONFIRMATION_SQL, [
      date, value.expectedRevision, value.ownerReport, fast, value.expectedVersion,
    ]) as Row[]
    if (rows.length === 0) throw new HttpError(409, 'Food log or confirmation changed. Refresh and review again.',
      undefined, 'NUTRITION_COMPLETENESS_STALE')
    return getNutritionDayCompleteness(date, sql, today)
  })
}
