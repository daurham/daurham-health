import { getSql, type Sql } from '../db.js'
import { compareMaintenanceDecisionRevisions } from '../../src/domain/maintenance-revision.js'

/**
 * A single PostgreSQL statement produces a shared MVCC view of:
 *  - effective target ID, numeric value, effective date, modification time;
 *  - every active goal's lifecycle, version ID and current target definition;
 *  - active or soon-scheduled experiment IDs/status/windows.
 *
 * The digest is for deterministic change detection, not authentication.
 * Selecting these settings again just before surfacing advice is optimistic,
 * not a substitute for an atomic transaction or an owner confirmation.
 */
export const MAINTENANCE_DECISION_REVISION_SQL = `
WITH current_target AS (
  SELECT id::text AS id, effective_from::text AS effective_from,
         calories_target::text AS calories_target, updated_at::text AS updated_at
    FROM nutrition_targets
   WHERE effective_from <= $1::date
   ORDER BY effective_from DESC, updated_at DESC, id DESC
   LIMIT 1
), active_goals AS (
  SELECT COALESCE(jsonb_agg(
    jsonb_build_array(g.id::text, g.status, g.updated_at::text,
      g.goal_kind, g.body_metric_key, v.id::text, v.version,
      v.target_mode, v.target_min::text, v.target_max::text, v.target_unit,
      v.target_date::text, v.evaluation_window_days)
    ORDER BY g.id::text
  ), '[]'::jsonb) AS state
    FROM goals g
    LEFT JOIN goal_versions v ON v.goal_id = g.id AND v.is_current
   WHERE g.status = 'active'
), relevant_experiments AS (
  SELECT COUNT(*)::int AS active_count,
         COALESCE(jsonb_agg(
           jsonb_build_array(e.id::text, e.status, e.window_start::text,
             e.window_end::text, e.protocol_version_id::text, e.updated_at::text)
           ORDER BY e.id::text
         ), '[]'::jsonb) AS state
    FROM experiments e
   WHERE e.status = 'active'
      OR (e.status = 'scheduled' AND e.window_start <= $1::date + 14
          AND e.window_end >= $1::date)
)
SELECT (SELECT calories_target FROM current_target) AS calorie_target,
       (SELECT active_count FROM relevant_experiments) AS experiment_count,
       md5(jsonb_build_object(
         'target', (SELECT to_jsonb(t) FROM current_target t),
         'goals', (SELECT state FROM active_goals),
         'experiments', (SELECT state FROM relevant_experiments),
         'profile', (SELECT to_jsonb(p) FROM health_profile p WHERE singleton_id = 1)
       )::text) AS decision_revision
`

export type MaintenanceDecisionSnapshot =
  | { status: 'available'; currentCalorieTarget: number | null; activeExperimentCount: number; revision: string }
  | { status: 'unavailable'; currentCalorieTarget: null; activeExperimentCount: 0; revision: null }

export async function readMaintenanceDecisionSnapshot(
  asOf: string,
  sqlOverride?: Sql,
): Promise<MaintenanceDecisionSnapshot> {
  try {
    const sql = sqlOverride ?? await getSql()
    const rows = await sql.query(MAINTENANCE_DECISION_REVISION_SQL, [asOf]) as Array<{
      calorie_target: number | string | null
      experiment_count: number | string | null
      decision_revision: string | null
    }>
    const row = rows[0]
    const count = Number(row?.experiment_count)
    const target = row?.calorie_target == null ? null : Number(row.calorie_target)
    const revision = row?.decision_revision
    if (!row || typeof revision !== 'string' || !/^[a-f0-9]{32}$/.test(revision) ||
        !Number.isSafeInteger(count) || count < 0 ||
        (target != null && (!Number.isFinite(target) || target <= 0))) {
      return { status: 'unavailable', currentCalorieTarget: null, activeExperimentCount: 0, revision: null }
    }
    return { status: 'available', currentCalorieTarget: target, activeExperimentCount: count, revision }
  } catch {
    // A transient connection error or missing table is NOT evidence of an
    // unchanged goal, no experiment, or a safe low-calorie target.
    return { status: 'unavailable', currentCalorieTarget: null, activeExperimentCount: 0, revision: null }
  }
}

export async function isMaintenanceDecisionRevisionCurrent(
  asOf: string,
  captured: string | null | undefined,
  sqlOverride?: Sql,
): Promise<boolean> {
  if (!captured) return false
  const next = await readMaintenanceDecisionSnapshot(asOf, sqlOverride)
  return compareMaintenanceDecisionRevisions(captured, next.revision) === 'consistent'
}
