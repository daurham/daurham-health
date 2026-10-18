import { randomUUID } from 'node:crypto'
import { getSql, type Sql } from '../db.js'
import { currentHealthDate } from '../health-time.js'
import { HttpError } from '../http.js'
import { experimentEvidenceFingerprint } from '../../src/domain/experiment-results.js'
import { parseExperimentComparisonSnapshot, type ImplementationProvenance } from '../../src/domain/experiment-comparison-snapshot.js'
import {
  parseOutcomeFeedbackSubmission, reviewOutcomeFeedbackReadiness,
  type OutcomeFeedbackEvent, type OutcomeFeedbackReadiness,
} from '../../src/domain/experiment-outcome-feedback.js'
import {
  reconcileLatestFeedback, reviewFeedbackHistory,
  parseFeedbackHistoryCursor, reviewFeedbackHistoryPage,
  type FeedbackHistory, type FeedbackHistoryPage,
} from '../../src/domain/experiment-evidence-memory.js'

type DbGate = {
  status: string
  classification: string
  protocol_attestation: string
  stopped_for_safety: boolean
  snapshot: unknown
  snapshot_fingerprint: string | null
  current_provenance: ImplementationProvenance
  current_date: string | null
  current_revision: number | null
}
export const OWNER_OUTCOME_FEEDBACK_GATE_SQL = [
  'SELECT r.status, r.classification, r.protocol_attestation, r.stopped_for_safety,',
  '       s.snapshot, s.snapshot_fingerprint,',
  "CASE WHEN changes.action = 'retracted' THEN 'retracted'",
  "     WHEN changes.action = 'corrected' THEN 'corrected'",
  "     WHEN impl.experiment_id IS NOT NULL THEN 'original' ELSE 'unreported' END AS current_provenance,",
  "CASE WHEN changes.action = 'retracted' THEN NULL",
  '     ELSE COALESCE(changes.effective_date, impl.effective_date)::text END AS current_date,',
  'changes.revision AS current_revision',
  'FROM experiment_results r',
  'LEFT JOIN experiment_result_comparison_snapshots s ON s.experiment_result_id = r.id',
  'LEFT JOIN experiment_implementations impl ON impl.experiment_id = r.experiment_id',
  'LEFT JOIN LATERAL (',
  ' SELECT revision,action,effective_date FROM experiment_implementation_revisions',
  ' WHERE experiment_id = r.experiment_id ORDER BY revision DESC LIMIT 1',
  ') changes ON TRUE',
  'WHERE r.id = $1::uuid',
].join('\n')

export const OWNER_OUTCOME_FEEDBACK_LATEST_SQL = [
  'SELECT version, action, unlogged_factors AS "unloggedFactors", owner_note AS "ownerNote",',
  '       recorded_at::text AS "recordedAt"',
  'FROM experiment_outcome_feedback_events WHERE experiment_result_id = $1::uuid',
  'ORDER BY version DESC LIMIT 1',
].join('\n')

// One INSERT statement is the write-time CAS on both owner feedback version
// and independently confirmed current implementation source/date.
export const OWNER_OUTCOME_FEEDBACK_INSERT_SQL = [
  'INSERT INTO experiment_outcome_feedback_events',
  ' (id,experiment_result_id,version,action,unlogged_factors,owner_note,comparison_fingerprint)',
  'SELECT $2::uuid, r.id, $3::int + 1, $4::text, $5::text, $6::text, s.snapshot_fingerprint',
  'FROM experiment_results r',
  'JOIN experiment_result_comparison_snapshots s ON s.experiment_result_id = r.id',
  'LEFT JOIN experiment_implementations impl ON impl.experiment_id = r.experiment_id',
  'LEFT JOIN LATERAL (',
  ' SELECT revision,action,effective_date FROM experiment_implementation_revisions',
  ' WHERE experiment_id = r.experiment_id ORDER BY revision DESC LIMIT 1',
  ') changes ON TRUE',
  'WHERE r.id = $1::uuid',
  ' AND s.snapshot_fingerprint = $7::text',
  ' AND COALESCE((SELECT MAX(version) FROM experiment_outcome_feedback_events',
  ' WHERE experiment_result_id = r.id), 0) = $3::int',
  " AND ($4::text = 'withdrawn' OR (",
  "  r.status = 'valid' AND changes.action IS DISTINCT FROM 'retracted'",
  '  AND impl.experiment_id IS NOT NULL',
  '  AND COALESCE(changes.revision,0) = $8::int',
  '  AND COALESCE(changes.effective_date,impl.effective_date) = $9::date',
  ' ))',
  'ON CONFLICT (experiment_result_id,version) DO NOTHING',
  'RETURNING version',
].join('\n')

export const OWNER_OUTCOME_FEEDBACK_HISTORY_SQL = [
  'SELECT version,action,unlogged_factors AS "unloggedFactors", owner_note AS "ownerNote",',
  ' comparison_fingerprint AS "comparisonFingerprint", recorded_at::text AS "recordedAt"',
  'FROM experiment_outcome_feedback_events WHERE experiment_result_id = $1::uuid',
  'ORDER BY version DESC LIMIT 26',
].join('\n')

export const OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL = [
  'SELECT version,action,unlogged_factors AS "unloggedFactors", owner_note AS "ownerNote",',
  ' comparison_fingerprint AS "comparisonFingerprint", recorded_at::text AS "recordedAt"',
  'FROM experiment_outcome_feedback_events',
  'WHERE experiment_result_id = $1::uuid AND version < $2::int',
  'ORDER BY version DESC LIMIT 26',
].join('\n')

/** No mutation, and no new snapshot; fail closed if audit head changed. */
export async function readOwnerFeedbackHistoryPage(
  resultId:string,before:unknown,latest:unknown,
):Promise<FeedbackHistoryPage> {
  const cursor=parseFeedbackHistoryCursor(before,latest)
  if('error' in cursor) throw new HttpError(400,cursor.error)
  const sql=await getSql()
  const state=await readOwnerOutcomeFeedback(sql,resultId,await currentHealthDate())
  if(state.history.status!=='partial'||!state.snapshotFingerprint||
     !state.latest||state.latest.version!==cursor.latestVersion) {
    throw new HttpError(409,'Feedback history changed or is not verifiable. Refresh the result.')
  }
  const rows=await sql.query(OWNER_OUTCOME_FEEDBACK_HISTORY_PAGE_SQL,[resultId,cursor.beforeVersion])
  const page=reviewFeedbackHistoryPage({
    rows,beforeVersion:cursor.beforeVersion,latestVersion:cursor.latestVersion,
    expectedFingerprint:state.snapshotFingerprint,snapshotVerified:true,
  })
  if(!page) throw new HttpError(409,'Older feedback versions could not be verified. Refresh the result.')
  return page
}

export async function readOwnerOutcomeFeedback(sql: Sql, resultId: string, today: string): Promise<{
  readiness: OutcomeFeedbackReadiness
  latest: OutcomeFeedbackEvent | null
  history: FeedbackHistory
  snapshotFingerprint: string | null
  currentRevision: number
  currentDate: string | null
}> {
  const rows = await sql.query(OWNER_OUTCOME_FEEDBACK_GATE_SQL, [resultId]) as DbGate[]
  const record = rows[0]
  if (!record) throw new HttpError(404, 'Experiment result was not found.')
  const snapshot = parseExperimentComparisonSnapshot(record.snapshot)
  const verified = snapshot && record.snapshot_fingerprint
    ? await experimentEvidenceFingerprint(snapshot) === record.snapshot_fingerprint : false
  const latest = await sql.query(OWNER_OUTCOME_FEEDBACK_LATEST_SQL, [resultId]) as OutcomeFeedbackEvent[]
  const historyRows = await sql.query(OWNER_OUTCOME_FEEDBACK_HISTORY_SQL, [resultId]) as unknown
  const readiness = reviewOutcomeFeedbackReadiness({
    resultStatus: record.status, classification: record.classification,
    protocolAttestation: record.protocol_attestation, stoppedForSafety: record.stopped_for_safety,
    snapshot: verified ? snapshot : null,
    currentImplementation: {
      provenance: record.current_provenance, effectiveDate: record.current_date,
      revision: record.current_revision,
    },
    today,
  })
  const auditedHistory = reviewFeedbackHistory({
    rows: historyRows, expectedFingerprint: record.snapshot_fingerprint,
    snapshotVerified: verified === true, readiness,
  })
  const reconciled = reconcileLatestFeedback(auditedHistory, latest[0] ?? null)
  // Fail closed on mismatched reads rather than exposing an unaudited current
  // answer. Feedback can only be appended while this boundary is verified.
  const history: FeedbackHistory = reconciled.verified ? auditedHistory :
    { status: 'unavailable', events: [], review: 'unavailable' }
  return {
    readiness,
    history,
    latest: reconciled.latest,
    snapshotFingerprint: record.snapshot_fingerprint,
    currentRevision: record.current_revision ?? 0,
    currentDate: record.current_date,
  }
}

export async function submitOwnerOutcomeFeedback(resultId: string, body: unknown) {
  const parsed = parseOutcomeFeedbackSubmission(body)
  if ('error' in parsed) throw new HttpError(400, parsed.error)
  const sql = await getSql()
  const state = await readOwnerOutcomeFeedback(sql, resultId, await currentHealthDate())
  if (state.history.status === 'unavailable') throw new HttpError(409, 'Feedback history could not be verified. Refresh before changing feedback.')
  const version = state.latest?.version ?? 0
  if (parsed.expectedVersion !== version) throw new HttpError(409, 'Feedback changed. Refresh before saving.')
  if (parsed.action === 'record' && state.readiness.state !== 'ready') {
    throw new HttpError(409, 'An owner follow-up is not ready for this result.')
  }
  if (parsed.action === 'withdraw' && (!state.latest || state.latest.action === 'withdrawn')) {
    throw new HttpError(409, 'There is no current feedback to withdraw.')
  }
  if (!state.snapshotFingerprint) throw new HttpError(409, 'The result lacks a saved comparison snapshot.')
  const action = parsed.action === 'withdraw' ? 'withdrawn' : version === 0 ? 'recorded' : 'revised'
  const written = await sql.query(OWNER_OUTCOME_FEEDBACK_INSERT_SQL, [
    resultId,randomUUID(),version,action,parsed.unloggedFactors,parsed.ownerNote,
    state.snapshotFingerprint,state.currentRevision,state.currentDate,
  ])
  if (written.length !== 1) throw new HttpError(409, 'The experiment or feedback changed. Refresh and try again.')
  return { recorded: true, version: version + 1, action }
}
