import { getSql, type Sql } from '../db.js'
import { compareMaintenanceDecisionRevisions } from '../../src/domain/maintenance-revision.js'

/**
 * A single PostgreSQL statement produces a shared MVCC view of:
 *  - effective target ID, numeric value, effective date, modification time;
 *  - every active goal's lifecycle, version ID and current target definition;
 *  - as-of effective-dated explicit owner primary-goal intent (incl. clear);
 *  - active or soon-scheduled experiment IDs/status/windows;
 *  - recent finalized experiment results and evaluated outcome requirements;
 *  - the corresponding immutable-protocol requirement roles, kinds and selectors
 *    (included to detect even incorrect external requirement mutations).
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
), primary_intent AS (
  -- The owner may change explicit priority without editing a Goal itself.
  -- It must participate in the SAME read-time decision digest.
  SELECT version, primary_goal_id::text AS primary_goal_id,
         effective_from::text AS effective_from, recorded_at::text AS recorded_at
    FROM primary_goal_intent_events
   WHERE effective_from <= $1::date
   ORDER BY effective_from DESC, version DESC
   LIMIT 1
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
), relevant_requirements AS (
  SELECT COALESCE(jsonb_agg(
     jsonb_build_array(e.id::text, e.protocol_version_id::text,
       r.id::text, r.role, r.domain, r.requirement_kind, r.selector)
     ORDER BY e.id::text, r.id::text
  ), '[]'::jsonb) AS state
    FROM experiments e
    LEFT JOIN lab_protocol_requirements r
      ON r.protocol_version_id = e.protocol_version_id
   WHERE e.status = 'active'
      OR (e.status = 'scheduled' AND e.window_start <= $1::date + 14
          AND e.window_end >= $1::date)
), recent_result_sources AS (
 SELECT COALESCE(jsonb_agg(
   jsonb_build_array(r.id::text,r.experiment_id::text,
     r.protocol_version_id::text,e.protocol_version_id::text,e.status,
     r.status,r.classification,r.protocol_attestation,r.stopped_for_safety,
     r.window_start::text,r.planned_window_end::text,r.effective_end_date::text,
     r.evidence_fingerprint,r.created_at::text,r.invalidated_at::text,
     p.id::text,p.role,p.domain,p.requirement_kind,p.selector,p.required,
     q.id::text,q.evaluation_status,q.criterion_status,q.summary)
   ORDER BY r.id::text,p.id::text
 ),'[]'::jsonb) AS state
 FROM experiment_results r
 JOIN experiments e ON e.id=r.experiment_id
 LEFT JOIN lab_protocol_requirements p ON p.protocol_version_id=r.protocol_version_id
 LEFT JOIN experiment_result_requirements q
   ON q.experiment_result_id=r.id AND q.requirement_id=p.id
 WHERE r.effective_end_date BETWEEN $1::date - 27 AND $1::date
)
SELECT (SELECT calories_target FROM current_target) AS calorie_target,
       (SELECT active_count FROM relevant_experiments) AS experiment_count,
       md5(jsonb_build_object(
         'target', (SELECT to_jsonb(t) FROM current_target t),
         'goals', (SELECT state FROM active_goals),
         'primary_intent', (SELECT to_jsonb(i) FROM primary_intent i),
         'experiments', (SELECT state FROM relevant_experiments),
         'experiment_requirements', (SELECT state FROM relevant_requirements),
         'recent_results', (SELECT state FROM recent_result_sources),
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
