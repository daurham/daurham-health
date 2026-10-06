import { randomUUID } from 'node:crypto'
import {
  classificationCopy,
  evaluateExperiment,
  experimentEvidenceFingerprint,
  experimentStatusForClassification,
  fingerprintMaterial,
  parseResultAttestation,
  resolveFinalizationWindow,
  RESULT_CAUSALITY_FOOTER,
  type ExperimentEvaluation,
  type ExperimentEvidence,
  type ExperimentRequirementSpec,
  type ProtocolAttestation,
} from '../../src/domain/experiment-results.js'
import { parseRequirementCriteria, type RequirementCriteria } from '../../src/domain/lab.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import type { CanonicalSetRecord } from '../../src/domain/progress/types.js'
import { resolveOccurrence } from '../../src/domain/supplements/resolve.js'
import type { AdherenceWindow, OccurrenceState, ScheduleWindow, StatusEventWindow } from '../../src/domain/supplements/types.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'
import { currentHealthDate, healthCalendarTimeZone } from '../health-time.js'

type ExperimentRow = {
  id: string
  title: string
  question: string
  hypothesis: string | null
  status: string
  protocol_version_id: string
  protocol_id: string
  version: number
  window_start: string | null
  window_end: string | null
}

export async function previewExperimentResult(experimentId: string, body: unknown, today?: string) {
  const resolvedToday = today ?? await currentHealthDate()
  const attestation = parsedAttestation(body)
  const built = await buildEvaluation(experimentId, attestation, resolvedToday)
  return publicPreview(built.evaluation, built.experiment, built.fingerprint)
}

export async function commitExperimentResult(experimentId: string, body: unknown, today?: string) {
  const resolvedToday = today ?? await currentHealthDate()
  const attestation = parsedAttestation(body)
  const built = await buildEvaluation(experimentId, attestation, resolvedToday)
  if (!built.evaluation.canCommit || !built.evaluation.classification || !built.evaluation.effectiveEndDate) {
    throw new HttpError(409, built.evaluation.message ?? 'This experiment is not ready to finalize.')
  }
  const sql = await getSql()
  if (built.experiment.status !== 'active') {
    throw new HttpError(409, 'Review a result after the experiment is active.')
  }
  const existing = (await sql.query(
    `SELECT id::text AS id FROM experiment_results WHERE experiment_id = $1::uuid AND status = 'valid'`,
    [experimentId],
  )) as Array<{ id: string }>
  if (existing[0]) {
    throw new HttpError(409, 'This experiment already has a result.')
  }
  await assertSupersedes(sql, experimentId, attestation.supersedesResultId)
  const sourceId = await manualSourceId(sql)
  const resultId = randomUUID()
  const status = experimentStatusForClassification(built.evaluation.classification)
  const requirementIds = built.evaluation.requirements.map(() => randomUUID())
  const statements = [
    sql.query(
      `INSERT INTO experiment_results (
         id, experiment_id, protocol_version_id, classification, status,
         window_start, planned_window_end, effective_end_date, protocol_attestation,
         stopped_for_safety, safety_reason, owner_note, evidence_fingerprint, source_id, supersedes_result_id
       ) VALUES (
         $1::uuid, $2::uuid, $3::uuid, $4, 'valid',
         $5::date, $6::date, $7::date, $8,
         $9, $10, $11, $12, $13::uuid, $14::uuid
       )`,
      [
        resultId,
        experimentId,
        built.experiment.protocol_version_id,
        built.evaluation.classification,
        built.evaluation.windowStart,
        built.evaluation.plannedWindowEnd,
        built.evaluation.effectiveEndDate,
        attestation.protocolFollowed,
        attestation.stoppedForSafety,
        attestation.safetyReason,
        attestation.ownerNote,
        built.fingerprint,
        sourceId,
        attestation.supersedesResultId,
      ],
    ),
    ...built.evaluation.requirements.map((item, index) =>
      sql.query(
        `INSERT INTO experiment_result_requirements (
           id, experiment_result_id, requirement_id, evaluation_status, summary_kind, summary, criterion_status
         ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5, $6::jsonb, $7)`,
        [requirementIds[index], resultId, item.requirementId, item.evaluationStatus, item.summaryKind, JSON.stringify(item.summary), item.criterionStatus],
      ),
    ),
    ...evidenceInserts(sql, resultId, built.evaluation, requirementIds),
    sql.query(`UPDATE experiments SET status = $2, updated_at = now() WHERE id = $1::uuid AND status = 'active'`, [
      experimentId,
      status,
    ]),
  ]
  await sql.transaction(statements)
  return getExperimentResult(resultId)
}

export async function getExperimentResult(id: string) {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT r.id::text AS id, r.experiment_id::text AS experiment_id, e.title, e.question, e.hypothesis, e.status AS experiment_status,
            r.protocol_version_id::text AS protocol_version_id, v.version, r.classification, r.status,
            r.window_start::text AS window_start, r.planned_window_end::text AS planned_window_end,
            r.effective_end_date::text AS effective_end_date, r.protocol_attestation, r.stopped_for_safety,
            r.safety_reason, r.owner_note, r.invalidation_reason, r.supersedes_result_id::text AS supersedes_result_id
     FROM experiment_results r
     JOIN experiments e ON e.id = r.experiment_id
     JOIN lab_protocol_versions v ON v.id = r.protocol_version_id
     WHERE r.id = $1::uuid`,
    [id],
  )) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Experiment result was not found.')
  const requirements = (await sql.query(
    `SELECT id::text AS id, requirement_id::text AS requirement_id, evaluation_status, summary_kind, summary, criterion_status
     FROM experiment_result_requirements WHERE experiment_result_id = $1::uuid`,
    [id],
  )) as Array<Record<string, unknown>>
  const evidence = (await sql.query(
    `SELECT evidence_kind, evidence_ref, evidence_snapshot, observation_date::text AS observation_date, requirement_result_id::text AS requirement_result_id
     FROM experiment_result_evidence WHERE experiment_result_id = $1::uuid`,
    [id],
  )) as Array<Record<string, unknown>>
  const classification = String(row.classification) as Parameters<typeof classificationCopy>[0]
  return {
    id: row.id,
    experimentId: row.experiment_id,
    title: row.title,
    question: row.question,
    hypothesis: row.hypothesis,
    experimentStatus: row.experiment_status,
    protocolVersionId: row.protocol_version_id,
    protocolVersion: Number(row.version),
    classification,
    classificationCopy: classificationCopy(classification),
    status: row.status,
    windowStart: row.window_start,
    plannedWindowEnd: row.planned_window_end,
    effectiveEndDate: row.effective_end_date,
    protocolAttestation: row.protocol_attestation,
    stoppedForSafety: row.stopped_for_safety,
    safetyReason: row.safety_reason,
    ownerNote: row.owner_note,
    invalidationReason: row.invalidation_reason,
    supersedesResultId: row.supersedes_result_id,
    footer: RESULT_CAUSALITY_FOOTER,
    requirements: requirements.map((item) => ({
      id: item.id,
      requirementId: item.requirement_id,
      evaluationStatus: item.evaluation_status,
      summaryKind: item.summary_kind,
      summary: item.summary,
      criterionStatus: item.criterion_status,
      evidence: evidence.filter((entry) => entry.requirement_result_id === item.id),
    })),
    contextEvidence: evidence.filter((entry) => entry.requirement_result_id == null),
  }
}

export async function invalidateExperimentResult(id: string, body: unknown) {
  const reason = invalidationReason(body)
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT experiment_id::text AS experiment_id, status FROM experiment_results WHERE id = $1::uuid`,
    [id],
  )) as Array<{ experiment_id: string; status: string }>
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Experiment result was not found.')
  if (row.status === 'invalidated') throw new HttpError(409, 'This result is already invalidated.')
  await sql.transaction([
    sql.query(
      `UPDATE experiment_results
       SET status = 'invalidated', invalidated_at = now(), invalidation_reason = $2
       WHERE id = $1::uuid AND status = 'valid'`,
      [id, reason],
    ),
    sql.query(
      `UPDATE experiments SET status = 'active', updated_at = now()
       WHERE id = $1::uuid
         AND status IN ('completed', 'inconclusive')
         AND NOT EXISTS (
           SELECT 1 FROM experiment_results WHERE experiment_id = $1::uuid AND status = 'valid' AND id <> $2::uuid
         )`,
      [row.experiment_id, id],
    ),
  ])
  return getExperimentResult(id)
}

export async function listTimelineExperimentResults(start: string, end: string, rangeAll: boolean) {
  const sql = await getSql()
  return (await sql.query(
    `SELECT r.id::text AS id, e.title, r.classification, r.effective_end_date::text AS effective_end_date, r.status
     FROM experiment_results r
     JOIN experiments e ON e.id = r.experiment_id
     WHERE r.status = 'valid' AND ($3::boolean OR r.effective_end_date BETWEEN $1::date AND $2::date)
     ORDER BY r.effective_end_date, r.id`,
    [start, end, rangeAll],
  )) as Array<{ id: string; title: string; classification: string; effective_end_date: string; status: 'valid' }>
}

async function buildEvaluation(
  experimentId: string,
  attestation: Exclude<ReturnType<typeof parseResultAttestation>, { error: string }>,
  today: string,
) {
  const [sql, timezone] = await Promise.all([getSql(), healthCalendarTimeZone()])
  const experiment = await loadExperiment(sql, experimentId)
  if (experiment.status === 'abandoned' || experiment.status === 'superseded') {
    throw new HttpError(409, 'That experiment is not open for a result.')
  }
  if (experiment.status !== 'active' && experiment.status !== 'completed' && experiment.status !== 'inconclusive') {
    throw new HttpError(409, 'Review a result after the experiment is active.')
  }
  const window = resolveFinalizationWindow({
    windowStart: experiment.window_start,
    windowEnd: experiment.window_end,
    today,
    protocolFollowed: attestation.protocolFollowed,
    stoppedForSafety: attestation.stoppedForSafety,
    effectiveEndDate: attestation.effectiveEndDate,
  })
  if ('error' in window) throw new HttpError(400, window.error)
  const open = 'state' in window
  const finalObservationDay = open && window.finalDay
  const start = experiment.window_start ?? today
  const plannedEnd = experiment.window_end ?? today
  const effectiveEnd = open ? null : window.effectiveEndDate
  const loadEnd = effectiveEnd ?? plannedEnd
  const requirements = await loadRequirements(sql, experiment.protocol_version_id)
  const evidence = await loadEvidence(sql, experiment, requirements, start, loadEnd, timezone)
  const evaluation = evaluateExperiment({
    windowStart: start,
    plannedWindowEnd: plannedEnd,
    effectiveEndDate: effectiveEnd,
    windowOpen: open,
    finalObservationDay,
    protocolFollowed: attestation.protocolFollowed,
    stoppedForSafety: attestation.stoppedForSafety,
    requirements,
    evidence,
    descriptiveSupplements: evidence.adherence.map((item) => ({ supplementId: item.supplementId, name: item.name, days: item.days })),
  })
  const fingerprint = evaluation.canCommit && evaluation.effectiveEndDate
    ? await experimentEvidenceFingerprint(
        fingerprintMaterial({
          experimentId,
          protocolVersionId: experiment.protocol_version_id,
          windowStart: evaluation.windowStart,
          plannedWindowEnd: evaluation.plannedWindowEnd,
          effectiveEndDate: evaluation.effectiveEndDate,
          requirements,
          evaluation,
          protocolFollowed: attestation.protocolFollowed,
          stoppedForSafety: attestation.stoppedForSafety,
          safetyReason: attestation.safetyReason,
        }),
      )
    : null
  return { experiment, evaluation, fingerprint }
}

function publicPreview(evaluation: ExperimentEvaluation, experiment: ExperimentRow, fingerprint: string | null) {
  return {
    state: evaluation.state,
    classification: evaluation.classification,
    classificationCopy: evaluation.classification ? classificationCopy(evaluation.classification) : null,
    canCommit: evaluation.canCommit,
    message: evaluation.message,
    experimentId: experiment.id,
    title: experiment.title,
    question: experiment.question,
    hypothesis: experiment.hypothesis,
    protocolVersionId: experiment.protocol_version_id,
    protocolVersion: experiment.version,
    windowStart: evaluation.windowStart,
    plannedWindowEnd: evaluation.plannedWindowEnd,
    effectiveEndDate: evaluation.effectiveEndDate,
    protocolAttestation: evaluation.protocolAttestation,
    stoppedForSafety: evaluation.stoppedForSafety,
    requirements: evaluation.requirements,
    descriptiveAdherence: evaluation.descriptiveAdherence,
    contextControls: evaluation.contextControls,
    limitations: evaluation.limitations,
    fingerprint,
    footer: RESULT_CAUSALITY_FOOTER,
  }
}

async function loadExperiment(sql: Sql, id: string): Promise<ExperimentRow> {
  const rows = (await sql.query(
    `SELECT e.id::text AS id, e.title, e.question, e.hypothesis, e.status,
            e.protocol_version_id::text AS protocol_version_id, v.protocol_id::text AS protocol_id, v.version,
            e.window_start::text AS window_start, e.window_end::text AS window_end
     FROM experiments e
     JOIN lab_protocol_versions v ON v.id = e.protocol_version_id
     WHERE e.id = $1::uuid`,
    [id],
  )) as ExperimentRow[]
  const row = rows[0]
  if (!row) throw new HttpError(404, 'Experiment was not found.')
  return row
}

async function loadRequirements(sql: Sql, protocolVersionId: string): Promise<ExperimentRequirementSpec[]> {
  const rows = (await sql.query(
    `SELECT id::text AS id, role, requirement_kind, selector, label, required, criteria
     FROM lab_protocol_requirements WHERE protocol_version_id = $1::uuid ORDER BY position`,
    [protocolVersionId],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => {
    const parsed = parseRequirementCriteria(String(row.requirement_kind), row.criteria ?? {})
    const criteria: RequirementCriteria = 'error' in parsed ? { minimumObservations: null, minimumCoveragePercent: null, minimumAdherencePercent: null } : parsed
    const selector = row.selector && typeof row.selector === 'object' ? (row.selector as Record<string, string>) : {}
    return {
      id: String(row.id),
      role: String(row.role),
      requirementKind: String(row.requirement_kind),
      selector,
      label: String(row.label),
      required: row.required !== false,
      criteria,
    }
  })
}

async function loadEvidence(
  sql: Sql,
  experiment: ExperimentRow,
  requirements: ExperimentRequirementSpec[],
  start: string,
  end: string,
  timezone: string,
): Promise<ExperimentEvidence> {
  const benchmarkIds = requirements.map((item) => item.selector.benchmarkDefinitionId).filter((id): id is string => Boolean(id))
  const supplementIds = [
    ...requirements.map((item) => item.selector.supplementId).filter((id): id is string => Boolean(id)),
    ...((await sql.query(`SELECT supplement_id::text AS id FROM experiment_supplements WHERE experiment_id = $1::uuid`, [experiment.id])) as Array<{ id: string }>).map((row) => row.id),
  ]
  const [benchmarks, training, body, nutrition, activity, sleep, adherence, context, controls] = await Promise.all([
    loadBenchmarks(sql, experiment.id, benchmarkIds),
    loadTraining(sql, experiment.id, start, end),
    loadBody(sql, requirements, start, end, timezone),
    loadNutrition(sql, start, end),
    loadActivity(sql, start, end, timezone),
    loadSleep(sql, start, end, timezone),
    loadAdherence(sql, [...new Set(supplementIds)], start, end),
    loadContext(sql, start, end),
    loadControls(sql, experiment.protocol_version_id),
  ])
  return { benchmarks, training, body, nutrition, activity, sleep, adherence, context, contextControls: controls }
}

async function loadBenchmarks(sql: Sql, experimentId: string, definitionIds: string[]) {
  if (definitionIds.length === 0) return []
  const rows = (await sql.query(
    `SELECT r.id::text AS id, r.benchmark_definition_id::text AS benchmark_definition_id, p.title,
            r.protocol_version_id::text AS protocol_version_id, v.version, r.result_date::text AS result_date,
            r.created_at::text AS created_at, r.experiment_id::text AS experiment_id, r.status,
            req.id::text AS requirement_id, req.label, val.value, val.unit
     FROM benchmark_results r
     JOIN benchmark_definitions b ON b.id = r.benchmark_definition_id
     JOIN lab_protocols p ON p.id = b.protocol_id
     JOIN lab_protocol_versions v ON v.id = r.protocol_version_id
     LEFT JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
     LEFT JOIN lab_protocol_requirements req ON req.id = val.requirement_id AND req.role = 'primary_outcome'
     WHERE r.benchmark_definition_id = ANY($1::uuid[])
       AND (r.experiment_id = $2::uuid OR r.result_date < (SELECT window_start FROM experiments WHERE id = $2::uuid))
     ORDER BY r.result_date, r.created_at, req.position`,
    [definitionIds, experimentId],
  )) as Array<Record<string, unknown>>
  const grouped = new Map<string, ExperimentEvidence['benchmarks'][number]>()
  for (const row of rows) {
    const id = String(row.id)
    const current = grouped.get(id) ?? {
      id,
      benchmarkDefinitionId: String(row.benchmark_definition_id),
      benchmarkTitle: String(row.title),
      protocolVersionId: String(row.protocol_version_id),
      protocolVersion: Number(row.version),
      resultDate: String(row.result_date),
      createdAt: String(row.created_at),
      experimentId: row.experiment_id == null ? null : String(row.experiment_id),
      status: String(row.status),
      primaryValues: [],
    }
    const value = finite(row.value)
    if (row.requirement_id && row.label && row.unit && value != null) {
      current.primaryValues.push({ requirementId: String(row.requirement_id), label: String(row.label), value, unit: String(row.unit) })
    }
    grouped.set(id, current)
  }
  return [...grouped.values()]
}

async function loadTraining(sql: Sql, experimentId: string, start: string, end: string) {
  const rows = (await sql.query(
    `SELECT s.id::text AS session_id, s.workout_date::text AS workout_date, s.experiment_id::text AS experiment_id,
            e.id::text AS session_exercise_id, e.exercise_definition_id::text AS exercise_definition_id, e.position,
            d.measurement_kind, d.analytics_rep_mode,
            ws.id::text AS set_id, ws.set_number, ws.set_type, ws.reps, ws.duration_sec, ws.left_reps, ws.right_reps,
            ws.left_duration_sec, ws.right_duration_sec, ws.load_state, ws.weight_kg
     FROM workout_sessions s
     JOIN workout_session_exercises e ON e.workout_session_id = s.id
     JOIN exercise_definitions d ON d.id = e.exercise_definition_id
     LEFT JOIN workout_sets ws ON ws.workout_session_exercise_id = e.id
     WHERE s.experiment_id = $1::uuid AND s.workout_date BETWEEN $2::date AND $3::date
     ORDER BY s.workout_date, s.id, e.position, ws.set_number`,
    [experimentId, start, end],
  )) as Array<Record<string, unknown>>
  const sessions = new Map<string, ExperimentEvidence['training'][number]>()
  for (const row of rows) {
    const sessionId = String(row.session_id)
    const session = sessions.get(sessionId) ?? {
      id: sessionId,
      workoutDate: String(row.workout_date),
      experimentId: row.experiment_id == null ? null : String(row.experiment_id),
      exercises: [],
    }
    const exerciseId = String(row.exercise_definition_id)
    let exercise = session.exercises.find((item) => item.exerciseDefinitionId === exerciseId)
    if (!exercise) {
      exercise = {
        exerciseDefinitionId: exerciseId,
        measurementKind: String(row.measurement_kind),
        analyticsRepMode: row.analytics_rep_mode === 'per_side' ? 'per_side' : 'standard',
        sets: [],
      }
      session.exercises.push(exercise)
    }
    if (row.set_id) {
      exercise.sets.push(canonicalSet(row, session))
    }
    sessions.set(sessionId, session)
  }
  return [...sessions.values()]
}

function canonicalSet(row: Record<string, unknown>, session: { id: string; workoutDate: string }): CanonicalSetRecord {
  return {
    setId: String(row.set_id),
    sessionId: session.id,
    sessionExerciseId: String(row.session_exercise_id),
    exerciseId: String(row.exercise_definition_id),
    sessionDate: session.workoutDate,
    sessionCreatedAt: session.workoutDate,
    sessionExercisePosition: Number(row.position ?? 0),
    setNumber: Number(row.set_number ?? 0),
    setType: String(row.set_type ?? ''),
    loadState: String(row.load_state ?? 'none'),
    weightKg: finite(row.weight_kg),
    reps: finite(row.reps),
    durationSec: finite(row.duration_sec),
    leftReps: finite(row.left_reps),
    rightReps: finite(row.right_reps),
    leftDurationSec: finite(row.left_duration_sec),
    rightDurationSec: finite(row.right_duration_sec),
  }
}

async function loadBody(
  sql: Sql,
  requirements: ExperimentRequirementSpec[],
  start: string,
  end: string,
  fallbackTimezone: string,
) {
  const metricKeys = requirements.filter((item) => item.requirementKind === 'body_metric').map((item) => item.selector.metricKey).filter(Boolean)
  if (metricKeys.length === 0) return []
  const rows = (await sql.query(
    `SELECT m.id::text AS id, m.metric_key, m.value, m.unit, s.measured_at, s.timezone
     FROM body_metrics m
     JOIN body_measurement_sessions s ON s.id = m.measurement_session_id
     WHERE m.metric_key = ANY($1::text[])`,
    [metricKeys],
  )) as Array<Record<string, unknown>>
  return rows.flatMap((row) => {
    const value = finite(row.value)
    if (value == null || !(row.measured_at instanceof Date) && typeof row.measured_at !== 'string') return []
    const instant = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
    const timezone = typeof row.timezone === 'string' && row.timezone.trim() ? row.timezone : fallbackTimezone
    const calendarDate = calendarDateFromInstant(instant, timezone)
    if (calendarDate < start || calendarDate > end) return []
    return [{ measurementId: String(row.id), calendarDate, metricKey: String(row.metric_key), value, unit: String(row.unit) }]
  })
}

async function loadNutrition(sql: Sql, start: string, end: string) {
  const rows = (await sql.query(
    `SELECT log_date::text AS log_date,
            SUM(calories) AS calories, SUM(protein) AS protein, SUM(carbs) AS carbs, SUM(fat) AS fat
     FROM nutrition_entries
     WHERE log_date BETWEEN $1::date AND $2::date
     GROUP BY log_date`,
    [start, end],
  )) as Array<Record<string, unknown>>
  const points: ExperimentEvidence['nutrition'] = []
  for (const row of rows) {
    for (const key of ['calories', 'protein', 'carbs', 'fat'] as const) {
      points.push({ date: String(row.log_date), metricKey: key, value: finite(row[key]) })
    }
  }
  return points
}

async function loadActivity(sql: Sql, start: string, end: string, timezone: string) {
  const rows = (await sql.query(
    `SELECT summary_date::text AS summary_date, steps_count, active_energy_kcal, exercise_minutes, resting_heart_rate_bpm
     FROM activity_daily_summaries
     WHERE timezone = $3 AND summary_date BETWEEN $1::date AND $2::date`,
    [start, end, timezone],
  )) as Array<Record<string, unknown>>
  const points: ExperimentEvidence['activity'] = []
  for (const row of rows) {
    for (const key of ['steps_count', 'active_energy_kcal', 'exercise_minutes', 'resting_heart_rate_bpm'] as const) {
      points.push({ date: String(row.summary_date), metricKey: key, value: finite(row[key]) })
    }
  }
  return points
}

async function loadSleep(sql: Sql, start: string, end: string, timezone: string) {
  const rows = (await sql.query(
    `SELECT sleep_date::text AS sleep_date, total_sleep_minutes, analysis_eligible
     FROM sleep_nightly_summaries
     WHERE timezone = $3 AND sleep_date BETWEEN $1::date AND $2::date`,
    [start, end, timezone],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    date: String(row.sleep_date),
    metricKey: 'total_sleep_minutes',
    value: finite(row.total_sleep_minutes),
    eligible: row.analysis_eligible === true,
  }))
}

async function loadContext(sql: Sql, start: string, end: string) {
  const rows = (await sql.query(
    `SELECT c.context_date::text AS context_date, t.tag_key
     FROM daily_context c
     LEFT JOIN daily_context_tags t ON t.context_id = c.id
     WHERE c.context_date BETWEEN $1::date AND $2::date`,
    [start, end],
  )) as Array<{ context_date: string; tag_key: string | null }>
  const grouped = new Map<string, string[]>()
  for (const row of rows) {
    const tags = grouped.get(row.context_date) ?? []
    if (row.tag_key) tags.push(row.tag_key)
    grouped.set(row.context_date, tags)
  }
  return [...grouped.entries()].map(([date, tags]) => ({ date, tags }))
}

async function loadControls(sql: Sql, protocolVersionId: string) {
  const rows = (await sql.query(
    `SELECT tag_key FROM lab_protocol_context_controls WHERE protocol_version_id = $1::uuid`,
    [protocolVersionId],
  )) as Array<{ tag_key: string }>
  return rows.map((row) => ({ tagKey: row.tag_key }))
}

async function loadAdherence(sql: Sql, supplementIds: string[], start: string, end: string) {
  if (supplementIds.length === 0) return []
  const supplements = (await sql.query(`SELECT id::text AS id, name FROM supplements WHERE id = ANY($1::uuid[])`, [supplementIds])) as Array<{ id: string; name: string }>
  const schedules = (await sql.query(
    `SELECT id::text AS id, supplement_id::text AS supplement_id, slot_label, dose_amount, dose_unit, weekday_mask,
            effective_from::text AS effective_from, effective_through::text AS effective_through, sort_order
     FROM supplement_schedules WHERE supplement_id = ANY($1::uuid[])`,
    [supplementIds],
  )) as Array<Record<string, unknown>>
  const events = (await sql.query(
    `SELECT supplement_id::text AS supplement_id, effective_date::text AS effective_date, status
     FROM supplement_status_events WHERE supplement_id = ANY($1::uuid[]) ORDER BY effective_date, created_at`,
    [supplementIds],
  )) as Array<{ supplement_id: string; effective_date: string; status: StatusEventWindow['status'] }>
  const adherence = (await sql.query(
    `SELECT a.schedule_id::text AS schedule_id, a.scheduled_date::text AS scheduled_date, a.status
     FROM supplement_adherence a
     JOIN supplement_schedules s ON s.id = a.schedule_id
     WHERE s.supplement_id = ANY($1::uuid[]) AND a.scheduled_date BETWEEN $2::date AND $3::date`,
    [supplementIds, start, end],
  )) as Array<{ schedule_id: string; scheduled_date: string; status: 'taken' | 'skipped' }>
  return supplements.map((supplement) => {
    const ownSchedules: ScheduleWindow[] = schedules
      .filter((row) => row.supplement_id === supplement.id)
      .map((row) => ({
        id: String(row.id),
        supplementId: supplement.id,
        slotLabel: row.slot_label == null ? null : String(row.slot_label),
        doseAmount: Number(row.dose_amount),
        doseUnit: String(row.dose_unit),
        weekdayMask: Number(row.weekday_mask),
        effectiveFrom: String(row.effective_from),
        effectiveThrough: row.effective_through == null ? null : String(row.effective_through),
        sortOrder: Number(row.sort_order ?? 0),
      }))
    const ownEvents: StatusEventWindow[] = events
      .filter((row) => row.supplement_id === supplement.id)
      .map((row) => ({ effectiveDate: row.effective_date, status: row.status }))
    const ownAdherence: AdherenceWindow[] = adherence
      .filter((row) => ownSchedules.some((schedule) => schedule.id === row.schedule_id))
      .map((row) => ({
        scheduleId: row.schedule_id,
        scheduledDate: row.scheduled_date,
        status: row.status,
        actualDoseAmount: null,
        actualDoseUnit: null,
      }))
    const days: Array<{ date: string; state: OccurrenceState }> = []
    let cursor = start
    while (cursor <= end) {
      for (const schedule of ownSchedules) {
        const observation = ownAdherence.find((item) => item.scheduleId === schedule.id && item.scheduledDate === cursor) ?? null
        days.push({
          date: cursor,
          state: resolveOccurrence({ events: ownEvents, schedule, date: cursor, adherence: observation }),
        })
      }
      cursor = nextDate(cursor)
    }
    return { supplementId: supplement.id, name: supplement.name, days }
  })
}

function nextDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year!, (month ?? 1) - 1, day ?? 1))
  utc.setUTCDate(utc.getUTCDate() + 1)
  return utc.toISOString().slice(0, 10)
}

function evidenceInserts(sql: Sql, resultId: string, evaluation: ExperimentEvaluation, requirementIds: string[]) {
  const statements = []
  evaluation.requirements.forEach((requirement, index) => {
    for (const evidence of requirement.evidence) {
      statements.push(
        sql.query(
          `INSERT INTO experiment_result_evidence (
             id, experiment_result_id, requirement_result_id, evidence_kind, evidence_ref, evidence_snapshot, observation_date
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4, $5::jsonb, $6::jsonb, $7::date)`,
          [
            randomUUID(),
            resultId,
            requirementIds[index],
            evidence.evidenceKind,
            JSON.stringify(evidence.evidenceRef),
            JSON.stringify(evidence.evidenceSnapshot),
            evidence.observationDate,
          ],
        ),
      )
    }
  })
  for (const control of evaluation.contextControls) {
    statements.push(
      sql.query(
        `INSERT INTO experiment_result_evidence (
           id, experiment_result_id, requirement_result_id, evidence_kind, evidence_ref, evidence_snapshot, observation_date
         ) VALUES ($1::uuid, $2::uuid, NULL, 'daily_context', $3::jsonb, $4::jsonb, NULL)`,
        [
          randomUUID(),
          resultId,
          JSON.stringify({ tagKey: control.tagKey }),
          JSON.stringify({ recordedDates: control.recordedDates, recordedDayCount: control.recordedDayCount }),
        ],
      ),
    )
  }
  return statements
}

async function assertSupersedes(sql: Sql, experimentId: string, supersedesResultId: string | null) {
  if (!supersedesResultId) return
  const rows = (await sql.query(
    `SELECT experiment_id::text AS experiment_id, status FROM experiment_results WHERE id = $1::uuid`,
    [supersedesResultId],
  )) as Array<{ experiment_id: string; status: string }>
  const row = rows[0]
  if (!row || row.experiment_id !== experimentId) {
    throw new HttpError(400, 'A replacement must name a result from this experiment.')
  }
  if (row.status !== 'invalidated') {
    throw new HttpError(409, 'Invalidate the previous result before replacing it.')
  }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual'`, [])) as Array<{ id: string }>
  const id = rows[0]?.id
  if (!id) throw new HttpError(503, 'Manual data source is not configured')
  return id
}

function parsedAttestation(body: unknown): Exclude<ReturnType<typeof parseResultAttestation>, { error: string }> & { protocolFollowed: ProtocolAttestation } {
  const parsed = parseResultAttestation(body)
  if ('error' in parsed) throw new HttpError(400, parsed.error)
  return parsed
}

function invalidationReason(body: unknown): string | null {
  if (body == null || typeof body !== 'object') return null
  const reason = (body as { reason?: unknown }).reason
  if (reason == null || reason === '') return null
  if (typeof reason !== 'string') throw new HttpError(400, 'Invalidation reason must be text.')
  const text = reason.trim()
  if (text.length > 500) throw new HttpError(400, 'Invalidation reason must be 500 characters or fewer.')
  return text.length === 0 ? null : text
}

function finite(value: unknown): number | null {
  if (value == null) return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}
