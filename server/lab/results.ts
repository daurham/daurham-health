import { randomUUID } from 'node:crypto'
import { ACTIVITY_TIMEZONE } from '../../src/domain/activity/config.js'
import {
  type ActivityDayEvidence,
  type BodyMetricEvidence,
  type EvidencePool,
  type NutritionDayEvidence,
  type OutcomeRequirement,
  type SleepNightEvidence,
  type TrainingSessionEvidence,
  type TrainingSetEvidence,
} from '../../src/domain/lab-evaluators.js'
import {
  composeBenchmarkPreview,
  evidenceFingerprint,
  experimentLinkError,
  parseResultRequest,
  protocolChangeNote,
  protocolMismatchError,
  sameProtocolValueDelta,
  type BenchmarkPreview,
  type ResultContextView,
  type ResultRequest,
} from '../../src/domain/lab-results.js'
import { calendarDateFromInstant } from '../../src/domain/progress/dates.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'

/**
 * Duplicate commits return 409 with the existing result id.
 * The unique key is benchmark definition + protocol version + evidence fingerprint,
 * including invalidated rows. The same evidence cannot be committed again after
 * invalidation; a replacement requires different canonical evidence.
 * Creating a result does not change Experiment status.
 */

type VersionRow = {
  id: string
  version: number
  is_current: boolean
  protocol_id: string
  protocol_kind: string
  title: string
  benchmark_id: string | null
}

type CommitResult =
  | { status: 'created'; result: BenchmarkResultDetail }
  | { status: 'duplicate'; existingResultId: string; result: BenchmarkResultDetail }
  | { status: 'rejected'; error: string; preview: PublicPreview }

export type PublicPreview = Omit<BenchmarkPreview, 'fingerprintMaterial' | 'protocolMismatch' | 'experimentConflict'>

export type BenchmarkResultDetail = {
  id: string
  benchmarkDefinitionId: string
  benchmarkTitle: string
  protocolVersionId: string
  protocolVersion: number
  resultDate: string
  status: 'valid' | 'invalidated'
  protocolConfirmationKind: 'linked_protocol' | 'owner_attested'
  experiment: { id: string; title: string; status: string } | null
  invalidatedAt: string | null
  invalidationReason: string | null
  supersedesResultId: string | null
  supersededBy: string[]
  createdAt: string
  values: ResultValueView[]
  context: ResultContextView
  deltas: ResultDelta[] | null
}

export type ResultValueView = {
  id: string
  requirementId: string
  role: string
  label: string
  value: number
  unit: string
  valueKind: 'observed' | 'derived'
  evidence: ResultEvidenceView[]
}

export type ResultEvidenceView = {
  evidenceKind: string
  observationDate: string
  evidenceRef: Record<string, unknown>
  evidenceSnapshot: Record<string, unknown>
}

export type ResultDelta = {
  requirementId: string
  label: string
  absolute: number
  percent: number | null
}

export type BenchmarkResultHistory = {
  protocolChangeNote: string | null
  versions: Array<{
    protocolVersionId: string
    version: number
    isCurrent: boolean
    validResultCount: number
    results: BenchmarkResultSummary[]
  }>
}

export type BenchmarkResultSummary = {
  id: string
  resultDate: string
  status: 'valid' | 'invalidated'
  protocolVersionId: string
  protocolVersion: number
  protocolConfirmationKind: 'linked_protocol' | 'owner_attested'
  experimentId: string | null
  invalidationReason: string | null
  supersedesResultId: string | null
  values: Array<{ requirementId: string; role: string; label: string; value: number; unit: string; valueKind: string }>
  deltas: ResultDelta[] | null
}

type HistoryValue = BenchmarkResultSummary['values'][number]

export async function previewBenchmarkResult(benchmarkId: string, body: unknown): Promise<PublicPreview> {
  return toPublicPreview(await buildPreview(benchmarkId, parsedRequest(body)))
}

export async function commitBenchmarkResult(benchmarkId: string, body: unknown): Promise<CommitResult> {
  const request = parsedRequest(body)
  const preview = await buildPreview(benchmarkId, request)
  if (preview.state === 'duplicate' && preview.existingResultId) {
    return { status: 'duplicate', existingResultId: preview.existingResultId, result: await getBenchmarkResult(preview.existingResultId) }
  }
  if (!preview.canCommit || !preview.resultDate || !preview.confirmation || !preview.fingerprintMaterial) {
    return { status: 'rejected', error: preview.message ?? 'This result cannot be saved.', preview: toPublicPreview(preview) }
  }
  await assertSupersedes(benchmarkId, request.supersedesResultId)
  const sql = await getSql()
  const sourceId = await manualSourceId(sql)
  const resultId = randomUUID()
  const fingerprint = await evidenceFingerprint(preview.fingerprintMaterial)
  const storedValues = preview.outcomes.filter((outcome) => outcome.status === 'available' && outcome.value != null && outcome.unit)
  const valueIds = storedValues.map(() => randomUUID())
  try {
    await sql.transaction([
      sql.query(
        `INSERT INTO benchmark_results (
           id, benchmark_definition_id, protocol_version_id, result_date, experiment_id, status,
           protocol_confirmation_kind, evidence_fingerprint, source_id, supersedes_result_id
         ) VALUES (
           $1::uuid, $2::uuid, $3::uuid, $4::date, $5::uuid, 'valid', $6, $7, $8::uuid, $9::uuid
         )`,
        [
          resultId,
          benchmarkId,
          preview.protocolVersionId,
          preview.resultDate,
          preview.experimentId,
          preview.confirmation,
          fingerprint,
          sourceId,
          request.supersedesResultId,
        ],
      ),
      ...storedValues.map((outcome, index) =>
        sql.query(
          `INSERT INTO benchmark_result_values (
             id, benchmark_result_id, requirement_id, value, unit, value_kind
           ) VALUES ($1::uuid, $2::uuid, $3::uuid, $4::numeric, $5, $6)`,
          [valueIds[index], resultId, outcome.requirementId, outcome.value, outcome.unit, outcome.valueKind],
        ),
      ),
      ...storedValues.flatMap((outcome, index) =>
        outcome.evidence.map((item) =>
          sql.query(
            `INSERT INTO benchmark_result_evidence (
               id, benchmark_result_value_id, evidence_kind, evidence_ref, evidence_snapshot, observation_date
             ) VALUES ($1::uuid, $2::uuid, $3, $4::jsonb, $5::jsonb, $6::date)`,
            [
              randomUUID(),
              valueIds[index],
              item.evidenceKind,
              JSON.stringify(item.evidenceRef),
              JSON.stringify(item.evidenceSnapshot),
              item.observationDate,
            ],
          ),
        ),
      ),
    ])
  } catch (error) {
    const existing = await findFingerprint(sql, benchmarkId, preview.protocolVersionId, fingerprint)
    if (existing) {
      return { status: 'duplicate', existingResultId: existing, result: await getBenchmarkResult(existing) }
    }
    throw error
  }
  return { status: 'created', result: await getBenchmarkResult(resultId) }
}

export async function listBenchmarkResults(benchmarkId: string): Promise<BenchmarkResultHistory> {
  const sql = await getSql()
  const benchmark = await loadBenchmark(sql, benchmarkId)
  const versions = (await sql.query(
    `SELECT id::text AS id, version, is_current
     FROM lab_protocol_versions
     WHERE protocol_id = $1::uuid
     ORDER BY version DESC`,
    [benchmark.protocol_id],
  )) as Array<{ id: string; version: number; is_current: boolean }>
  const rows = (await sql.query(
    `SELECT r.id::text AS id,
            r.protocol_version_id::text AS protocol_version_id,
            r.result_date::text AS result_date,
            r.status,
            r.protocol_confirmation_kind,
            r.experiment_id::text AS experiment_id,
            r.invalidation_reason,
            r.supersedes_result_id::text AS supersedes_result_id,
            r.created_at,
            val.requirement_id::text AS requirement_id,
            val.value,
            val.unit,
            val.value_kind,
            req.label,
            req.role,
            req.position
     FROM benchmark_results r
     LEFT JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
     LEFT JOIN lab_protocol_requirements req ON req.id = val.requirement_id
     WHERE r.benchmark_definition_id = $1::uuid
     ORDER BY r.result_date, r.created_at, req.position`,
    [benchmarkId],
  )) as HistoryRow[]
  const grouped = new Map<string, BenchmarkResultSummary & { createdAt: string }>()
  for (const row of rows) {
    const current = grouped.get(row.id) ?? {
      id: row.id,
      resultDate: row.result_date,
      status: row.status,
      protocolVersionId: row.protocol_version_id,
      protocolVersion: versions.find((version) => version.id === row.protocol_version_id)?.version ?? 0,
      protocolConfirmationKind: row.protocol_confirmation_kind,
      experimentId: row.experiment_id,
      invalidationReason: row.invalidation_reason,
      supersedesResultId: row.supersedes_result_id,
      values: [],
      deltas: null,
      createdAt: timestamp(row.created_at),
    }
    const stored = finite(row.value)
    if (row.requirement_id && row.label && row.role && row.unit && row.value_kind && stored != null) {
      current.values.push({
        requirementId: row.requirement_id,
        role: row.role,
        label: row.label,
        value: stored,
        unit: row.unit,
        valueKind: row.value_kind,
      })
    }
    grouped.set(row.id, current)
  }
  const results = [...grouped.values()]
  return {
    protocolChangeNote: protocolChangeNote(
      versions.map((version) => ({
        version: version.version,
        validResultCount: results.filter((result) => result.protocolVersionId === version.id && result.status === 'valid').length,
      })),
    ),
    versions: versions.map((version) => {
      const versionResults = results
        .filter((result) => result.protocolVersionId === version.id)
        .sort((left, right) => left.resultDate.localeCompare(right.resultDate) || left.createdAt.localeCompare(right.createdAt))
      let previous: HistoryValue[] | null = null
      for (const result of versionResults) {
        if (result.status !== 'valid') {
          result.deltas = null
          continue
        }
        result.deltas = previous ? deltasBetween(previous, result.values) : null
        previous = result.values
      }
      return {
        protocolVersionId: version.id,
        version: version.version,
        isCurrent: version.is_current,
        validResultCount: versionResults.filter((result) => result.status === 'valid').length,
        results: versionResults.map((result) => {
          const { createdAt, ...rest } = result
          void createdAt
          return rest
        }),
      }
    }),
  }
}

export async function getBenchmarkResult(id: string): Promise<BenchmarkResultDetail> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT r.id::text AS id,
            r.benchmark_definition_id::text AS benchmark_definition_id,
            p.title AS benchmark_title,
            r.protocol_version_id::text AS protocol_version_id,
            v.version AS protocol_version,
            r.result_date::text AS result_date,
            r.status,
            r.protocol_confirmation_kind,
            r.experiment_id::text AS experiment_id,
            e.title AS experiment_title,
            e.status AS experiment_status,
            r.invalidated_at,
            r.invalidation_reason,
            r.supersedes_result_id::text AS supersedes_result_id,
            r.created_at,
            val.id::text AS value_id,
            val.requirement_id::text AS requirement_id,
            val.value,
            val.unit,
            val.value_kind,
            req.label,
            req.role,
            req.position
     FROM benchmark_results r
     JOIN benchmark_definitions b ON b.id = r.benchmark_definition_id
     JOIN lab_protocols p ON p.id = b.protocol_id
     JOIN lab_protocol_versions v ON v.id = r.protocol_version_id
     LEFT JOIN experiments e ON e.id = r.experiment_id
     LEFT JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
     LEFT JOIN lab_protocol_requirements req ON req.id = val.requirement_id
     WHERE r.id = $1::uuid
     ORDER BY req.position`,
    [id],
  )) as DetailRow[]
  const first = rows[0]
  if (!first) {
    throw new HttpError(404, 'Benchmark result was not found.')
  }
  const evidenceRows = (await sql.query(
    `SELECT val.id::text AS value_id,
            evidence.evidence_kind,
            evidence.evidence_ref,
            evidence.evidence_snapshot,
            evidence.observation_date::text AS observation_date
     FROM benchmark_result_evidence evidence
     JOIN benchmark_result_values val ON val.id = evidence.benchmark_result_value_id
     WHERE val.benchmark_result_id = $1::uuid`,
    [id],
  )) as EvidenceRow[]
  const successors = (await sql.query(
    `SELECT id::text AS id FROM benchmark_results WHERE supersedes_result_id = $1::uuid ORDER BY created_at`,
    [id],
  )) as Array<{ id: string }>
  const values = rows.flatMap((row) => {
    const stored = finite(row.value)
    if (!row.value_id || !row.requirement_id || !row.label || !row.role || !row.unit || !row.value_kind || stored == null) {
      return []
    }
    return [
      {
        id: row.value_id,
        requirementId: row.requirement_id,
        role: row.role,
        label: row.label,
        value: stored,
        unit: row.unit,
        valueKind: row.value_kind as 'observed' | 'derived',
        evidence: evidenceRows
          .filter((item) => item.value_id === row.value_id)
          .map((item) => ({
            evidenceKind: item.evidence_kind,
            observationDate: item.observation_date,
            evidenceRef: jsonObject(item.evidence_ref),
            evidenceSnapshot: jsonObject(item.evidence_snapshot),
          })),
      },
    ]
  })
  const history = await listBenchmarkResults(first.benchmark_definition_id)
  const summary = history.versions.flatMap((version) => version.results).find((result) => result.id === id)
  return {
    id: first.id,
    benchmarkDefinitionId: first.benchmark_definition_id,
    benchmarkTitle: first.benchmark_title,
    protocolVersionId: first.protocol_version_id,
    protocolVersion: first.protocol_version,
    resultDate: first.result_date,
    status: first.status,
    protocolConfirmationKind: first.protocol_confirmation_kind,
    experiment: first.experiment_id
      ? { id: first.experiment_id, title: first.experiment_title ?? 'Experiment', status: first.experiment_status ?? '' }
      : null,
    invalidatedAt: first.invalidated_at ? timestamp(first.invalidated_at) : null,
    invalidationReason: first.invalidation_reason,
    supersedesResultId: first.supersedes_result_id,
    supersededBy: successors.map((row) => row.id),
    createdAt: timestamp(first.created_at),
    values,
    context: await loadContext(sql, first.result_date, first.protocol_version_id),
    deltas: summary?.deltas ?? null,
  }
}

export async function invalidateBenchmarkResult(id: string, body: unknown): Promise<BenchmarkResultDetail> {
  const reason = parseInvalidationReason(body)
  const sql = await getSql()
  const updated = (await sql.query(
    `UPDATE benchmark_results
     SET status = 'invalidated', invalidated_at = now(), invalidation_reason = $2
     WHERE id = $1::uuid AND status = 'valid'
     RETURNING id::text AS id`,
    [id, reason],
  )) as Array<{ id: string }>
  if (!updated[0]) {
    const existing = (await sql.query(`SELECT status FROM benchmark_results WHERE id = $1::uuid`, [id])) as Array<{ status: string }>
    if (!existing[0]) {
      throw new HttpError(404, 'Benchmark result was not found.')
    }
    throw new HttpError(409, 'This result is already invalidated.')
  }
  return getBenchmarkResult(id)
}

export async function getLabProtocolVersion(id: string) {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT v.id::text AS id, v.version, p.protocol_kind, p.title, b.id::text AS benchmark_id
     FROM lab_protocol_versions v
     JOIN lab_protocols p ON p.id = v.protocol_id
     LEFT JOIN benchmark_definitions b ON b.protocol_id = p.id
     WHERE v.id = $1::uuid`,
    [id],
  )) as Array<{ id: string; version: number; protocol_kind: string; title: string; benchmark_id: string | null }>
  const row = rows[0]
  if (!row || row.protocol_kind !== 'benchmark' || !row.benchmark_id) {
    throw new HttpError(404, 'Benchmark protocol was not found.')
  }
  return { id: row.id, version: row.version, protocolKind: row.protocol_kind, title: row.title, benchmarkDefinitionId: row.benchmark_id }
}

export async function listTimelineBenchmarkResults(start: string, end: string, rangeAll: boolean) {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT r.id::text AS id,
            r.result_date::text AS result_date,
            p.title,
            v.version,
            req.label,
            val.value,
            val.unit
     FROM benchmark_results r
     JOIN benchmark_definitions b ON b.id = r.benchmark_definition_id
     JOIN lab_protocols p ON p.id = b.protocol_id
     JOIN lab_protocol_versions v ON v.id = r.protocol_version_id
     JOIN benchmark_result_values val ON val.benchmark_result_id = r.id
     JOIN lab_protocol_requirements req ON req.id = val.requirement_id
     WHERE r.status = 'valid'
       AND req.role = 'primary_outcome'
       AND ($3::boolean OR r.result_date BETWEEN $1::date AND $2::date)
     ORDER BY r.result_date, r.id, req.position`,
    [start, end, rangeAll],
  )) as Array<{ id: string; result_date: string; title: string; version: number; label: string; value: unknown; unit: string }>
  const grouped = new Map<string, { id: string; resultDate: string; title: string; protocolVersion: number; status: 'valid'; primary: Array<{ label: string; value: number; unit: string }> }>()
  for (const row of rows) {
    const current = grouped.get(row.id) ?? {
      id: row.id,
      resultDate: row.result_date,
      title: row.title,
      protocolVersion: row.version,
      status: 'valid' as const,
      primary: [],
    }
    const value = finite(row.value)
    if (value == null) {
      grouped.set(row.id, current)
      continue
    }
    current.primary.push({ label: row.label, value, unit: row.unit })
    grouped.set(row.id, current)
  }
  return [...grouped.values()]
}

async function buildPreview(benchmarkId: string, request: ResultRequest): Promise<BenchmarkPreview> {
  const sql = await getSql()
  const benchmark = await loadBenchmark(sql, benchmarkId)
  const version = await loadVersion(sql, request.protocolVersionId)
  if (version.protocol_kind !== 'benchmark' || version.benchmark_id !== benchmarkId || version.protocol_id !== benchmark.protocol_id) {
    throw new HttpError(400, version.protocol_kind === 'experiment' ? 'Experiment protocols are not benchmark results.' : 'That protocol version belongs to a different benchmark.')
  }
  const requirements = await loadRequirements(sql, version.id)
  const loaded = await loadEvidence(sql, request, requirements)
  const preview = composeBenchmarkPreview({
    benchmarkDefinitionId: benchmarkId,
    protocolVersionId: version.id,
    protocolVersion: version.version,
    requirements,
    pool: loaded.pool,
    request: loaded.request,
    context: null,
    existingResultId: null,
  })
  const mismatch = protocolMismatchError(preview.protocolMismatch)
  if (mismatch) {
    throw new HttpError(400, mismatch)
  }
  if (preview.experimentConflict) {
    throw new HttpError(400, 'The selected workouts belong to different experiments.')
  }
  const linkError = experimentLinkError(preview.experimentId, request.experimentId)
  if (linkError) {
    throw new HttpError(400, linkError)
  }
  let next = preview
  if (preview.fingerprintMaterial && preview.state === 'eligible') {
    const fingerprint = await evidenceFingerprint(preview.fingerprintMaterial)
    const existing = await findFingerprint(sql, benchmarkId, version.id, fingerprint)
    if (existing) {
      next = {
        ...preview,
        state: 'duplicate',
        canCommit: false,
        attestationRequired: false,
        existingResultId: existing,
        message: 'An existing benchmark result already used this evidence.',
      }
    }
  }
  if (next.resultDate) {
    next = { ...next, context: await loadContext(sql, next.resultDate, version.id) }
  }
  return next
}

function parsedRequest(body: unknown): ResultRequest {
  const request = parseResultRequest(body)
  if ('error' in request) {
    throw new HttpError(400, request.error)
  }
  return request
}

async function loadBenchmark(sql: Sql, id: string) {
  const rows = (await sql.query(
    `SELECT b.id::text AS id, b.protocol_id::text AS protocol_id
     FROM benchmark_definitions b
     WHERE b.id = $1::uuid`,
    [id],
  )) as Array<{ id: string; protocol_id: string }>
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Benchmark was not found.')
  }
  return row
}

async function loadVersion(sql: Sql, id: string): Promise<VersionRow> {
  const rows = (await sql.query(
    `SELECT v.id::text AS id,
            v.version,
            v.is_current,
            v.protocol_id::text AS protocol_id,
            p.protocol_kind,
            p.title,
            b.id::text AS benchmark_id
     FROM lab_protocol_versions v
     JOIN lab_protocols p ON p.id = v.protocol_id
     LEFT JOIN benchmark_definitions b ON b.protocol_id = p.id
     WHERE v.id = $1::uuid`,
    [id],
  )) as VersionRow[]
  const row = rows[0]
  if (!row) {
    throw new HttpError(400, 'Choose a protocol version.')
  }
  return row
}

async function loadRequirements(sql: Sql, versionId: string): Promise<OutcomeRequirement[]> {
  const rows = (await sql.query(
    `SELECT id::text AS id, role, requirement_kind, selector, label
     FROM lab_protocol_requirements
     WHERE protocol_version_id = $1::uuid
     ORDER BY position`,
    [versionId],
  )) as Array<{ id: string; role: string; requirement_kind: string; selector: unknown; label: string }>
  return rows.map((row) => ({
    id: row.id,
    role: row.role,
    requirementKind: row.requirement_kind,
    selector: jsonObject(row.selector) as Record<string, string>,
    label: row.label,
  }))
}

async function loadEvidence(sql: Sql, request: ResultRequest, requirements: OutcomeRequirement[]) {
  const outcomes = requirements.filter((item) => item.role === 'primary_outcome' || item.role === 'secondary_outcome')
  const exerciseIds = [...new Set(outcomes.flatMap((item) => (item.requirementKind === 'training_measure' ? [item.selector.exerciseDefinitionId] : [])))]
  const metricKeys = [...new Set(outcomes.flatMap((item) => (item.requirementKind === 'body_metric' ? [item.selector.metricKey] : [])))]
  const sessionHeader = request.workoutSessionId ? await loadSessionHeader(sql, request.workoutSessionId) : null
  if (request.workoutSessionId && !sessionHeader) {
    throw new HttpError(400, 'That workout was not found.')
  }
  if (sessionHeader?.benchmark_protocol_version_id && sessionHeader.benchmark_protocol_version_id !== request.protocolVersionId) {
    throw new HttpError(400, 'This workout is linked to a different benchmark protocol.')
  }
  const metrics = metricKeys.length > 0 ? await loadBodyMetrics(sql, metricKeys) : []
  const selectedMeasurement = request.measurementId ? metrics.find((metric) => metric.measurementId === request.measurementId) ?? await loadBodyMetric(sql, request.measurementId) : null
  if (request.measurementId && !selectedMeasurement) {
    throw new HttpError(400, 'That measurement was not found.')
  }
  const anchorDate = sessionHeader?.workout_date ?? selectedMeasurement?.calendarDate ?? request.date
  const sessions = exerciseIds.length === 0
    ? []
    : await loadSessions(sql, {
        sessionId: request.workoutSessionId,
        date: request.workoutSessionId ? null : anchorDate,
        exerciseIds,
      })
  const training: EvidencePool['training'] = exerciseIds.length === 0 ? [] : request.workoutSessionId || anchorDate ? sessions : 'unselected'
  const bodySelections = Object.entries(request.evidenceSelections)
  const body: EvidencePool['body'] = metricKeys.length === 0
    ? []
    : bodyPool(metrics, anchorDate, bodySelections.map(([, sourceId]) => sourceId), Boolean(request.measurementId))
  const needsDay = outcomes.some((item) => item.requirementKind === 'nutrition_metric' || item.requirementKind === 'activity_metric' || item.requirementKind === 'sleep_metric')
  const day = needsDay ? anchorDate : null
  const pool: EvidencePool = {
    training,
    body,
    nutrition: !outcomes.some((item) => item.requirementKind === 'nutrition_metric')
      ? 'absent'
      : day
        ? await loadNutrition(sql, day)
        : 'unselected',
    activity: !outcomes.some((item) => item.requirementKind === 'activity_metric')
      ? 'absent'
      : day
        ? await loadActivity(sql, day)
        : 'unselected',
    sleep: !outcomes.some((item) => item.requirementKind === 'sleep_metric')
      ? 'absent'
      : day
        ? await loadSleep(sql, day)
        : 'unselected',
  }
  return { pool, request: withMeasurementSelection(request, outcomes, selectedMeasurement) }
}

function withMeasurementSelection(
  request: ResultRequest,
  requirements: OutcomeRequirement[],
  metric: BodyMetricEvidence | null,
): ResultRequest {
  if (!request.measurementId || !metric) {
    return request
  }
  const matches = requirements.filter((item) => item.requirementKind === 'body_metric' && item.selector.metricKey === metric.metricKey)
  const match = matches.length === 1 ? matches[0] : null
  if (!match || request.evidenceSelections[match.id]) {
    return request
  }
  return { ...request, evidenceSelections: { ...request.evidenceSelections, [match.id]: request.measurementId } }
}

function bodyPool(
  metrics: BodyMetricEvidence[],
  date: string | null,
  selectionIds: string[],
  measurementRequested: boolean,
): BodyMetricEvidence[] | 'unselected' {
  if (!date && selectionIds.length === 0 && !measurementRequested) {
    return 'unselected'
  }
  if (selectionIds.length > 0 || measurementRequested) {
    const selected = metrics.filter((metric) => selectionIds.includes(metric.measurementId))
    const onDate = date ? metrics.filter((metric) => metric.calendarDate === date) : []
    const merged = [...selected]
    for (const metric of onDate) {
      if (!merged.some((item) => item.measurementId === metric.measurementId)) {
        merged.push(metric)
      }
    }
    return merged
  }
  return metrics.filter((metric) => metric.calendarDate === date)
}

async function loadSessionHeader(sql: Sql, id: string) {
  const rows = (await sql.query(
    `SELECT id::text AS id,
            workout_date::text AS workout_date,
            benchmark_protocol_version_id::text AS benchmark_protocol_version_id
     FROM workout_sessions
     WHERE id = $1::uuid`,
    [id],
  )) as Array<{ id: string; workout_date: string; benchmark_protocol_version_id: string | null }>
  return rows[0] ?? null
}

async function loadSessions(
  sql: Sql,
  input: { sessionId: string | null; date: string | null; exerciseIds: string[] },
): Promise<TrainingSessionEvidence[]> {
  const rows = (await sql.query(
    `SELECT s.id::text AS session_id,
            s.workout_date::text AS workout_date,
            s.session_type,
            s.session_name,
            s.experiment_id::text AS experiment_id,
            s.benchmark_protocol_version_id::text AS benchmark_protocol_version_id,
            e.exercise_definition_id::text AS exercise_definition_id,
            e.exercise_name,
            d.measurement_kind,
            d.analytics_rep_mode,
            ws.id::text AS set_id,
            ws.set_number,
            ws.set_type,
            ws.reps,
            ws.duration_sec,
            ws.left_reps,
            ws.right_reps,
            ws.left_duration_sec,
            ws.right_duration_sec
     FROM workout_sessions s
     JOIN workout_session_exercises e ON e.workout_session_id = s.id
     JOIN exercise_definitions d ON d.id = e.exercise_definition_id
     LEFT JOIN workout_sets ws ON ws.workout_session_exercise_id = e.id
     WHERE e.exercise_definition_id = ANY($1::uuid[])
       AND ($2::uuid IS NULL OR s.id = $2::uuid)
       AND ($3::date IS NULL OR s.workout_date = $3::date)
     ORDER BY s.workout_date, s.id, e.position, ws.set_number`,
    [input.exerciseIds, input.sessionId, input.date],
  )) as SessionRow[]
  const grouped = new Map<string, TrainingSessionEvidence>()
  for (const row of rows) {
    const key = `${row.session_id}:${row.exercise_definition_id}`
    const current = grouped.get(key) ?? {
      sessionId: row.session_id,
      workoutDate: row.workout_date,
      sessionType: row.session_type,
      sessionName: row.session_name,
      experimentId: row.experiment_id,
      benchmarkProtocolVersionId: row.benchmark_protocol_version_id,
      exerciseDefinitionId: row.exercise_definition_id,
      exerciseName: row.exercise_name,
      measurementKind: row.measurement_kind,
      analyticsRepMode: row.analytics_rep_mode === 'per_side' ? 'per_side' : 'standard',
      sets: [],
    }
    if (row.set_id && row.set_number != null && row.set_type) {
      current.sets.push(setFromRow(row))
    }
    grouped.set(key, current)
  }
  return [...grouped.values()]
}

function setFromRow(row: SessionRow): TrainingSetEvidence {
  return {
    setId: row.set_id ?? '',
    setNumber: Number(row.set_number),
    setType: row.set_type ?? '',
    reps: finite(row.reps),
    durationSec: finite(row.duration_sec),
    leftReps: finite(row.left_reps),
    rightReps: finite(row.right_reps),
    leftDurationSec: finite(row.left_duration_sec),
    rightDurationSec: finite(row.right_duration_sec),
  }
}

async function loadBodyMetrics(sql: Sql, metricKeys: string[]): Promise<BodyMetricEvidence[]> {
  const rows = (await sql.query(
    `SELECT m.id::text AS measurement_id,
            m.metric_key,
            m.value,
            m.unit,
            m.value_kind,
            s.id::text AS measurement_session_id,
            s.measured_at,
            s.timezone
     FROM body_metrics m
     JOIN body_measurement_sessions s ON s.id = m.measurement_session_id
     WHERE m.metric_key = ANY($1::text[])`,
    [metricKeys],
  )) as BodyRow[]
  return rows.flatMap((row) => {
    const value = finite(row.value)
    if (value == null) {
      return []
    }
    return [bodyEvidence(row, value)]
  })
}

async function loadBodyMetric(sql: Sql, id: string): Promise<BodyMetricEvidence | null> {
  const rows = (await sql.query(
    `SELECT m.id::text AS measurement_id,
            m.metric_key,
            m.value,
            m.unit,
            m.value_kind,
            s.id::text AS measurement_session_id,
            s.measured_at,
            s.timezone
     FROM body_metrics m
     JOIN body_measurement_sessions s ON s.id = m.measurement_session_id
     WHERE m.id = $1::uuid`,
    [id],
  )) as BodyRow[]
  const row = rows[0]
  const value = row ? finite(row.value) : null
  if (!row || value == null) {
    return null
  }
  return bodyEvidence(row, value)
}

function bodyEvidence(row: BodyRow, value: number): BodyMetricEvidence {
  const measuredAt = row.measured_at instanceof Date ? row.measured_at : new Date(String(row.measured_at))
  const timezone = row.timezone?.trim() ? row.timezone : HEALTH_CALENDAR_TIME_ZONE
  return {
    measurementId: row.measurement_id,
    measurementSessionId: row.measurement_session_id,
    metricKey: row.metric_key,
    value,
    unit: row.unit,
    valueKind: row.value_kind,
    calendarDate: calendarDateFromInstant(measuredAt, timezone),
  }
}

async function loadNutrition(sql: Sql, date: string): Promise<NutritionDayEvidence | 'absent'> {
  const rows = (await sql.query(
    `SELECT id::text AS id, calories, protein, carbs, fat
     FROM nutrition_entries
     WHERE log_date = $1::date
     ORDER BY id`,
    [date],
  )) as Array<{ id: string; calories: unknown; protein: unknown; carbs: unknown; fat: unknown }>
  if (rows.length === 0) {
    return 'absent'
  }
  return {
    logDate: date,
    entries: rows.map((row) => ({
      entryId: row.id,
      calories: finite(row.calories),
      protein: finite(row.protein),
      carbs: finite(row.carbs),
      fat: finite(row.fat),
    })),
  }
}

async function loadActivity(sql: Sql, date: string): Promise<ActivityDayEvidence | 'absent'> {
  const rows = (await sql.query(
    `SELECT id::text AS id, summary_date::text AS summary_date, timezone,
            steps_count, active_energy_kcal, exercise_minutes, resting_heart_rate_bpm
     FROM activity_daily_summaries
     WHERE summary_date = $1::date AND timezone = $2`,
    [date, ACTIVITY_TIMEZONE],
  )) as Array<{
    id: string
    summary_date: string
    timezone: string
    steps_count: unknown
    active_energy_kcal: unknown
    exercise_minutes: unknown
    resting_heart_rate_bpm: unknown
  }>
  const row = rows[0]
  if (!row) {
    return 'absent'
  }
  return {
    summaryId: row.id,
    summaryDate: row.summary_date,
    timezone: row.timezone,
    stepsCount: finite(row.steps_count),
    activeEnergyKcal: finite(row.active_energy_kcal),
    exerciseMinutes: finite(row.exercise_minutes),
    restingHeartRateBpm: finite(row.resting_heart_rate_bpm),
  }
}

async function loadSleep(sql: Sql, date: string): Promise<SleepNightEvidence | 'absent'> {
  const rows = (await sql.query(
    `SELECT sleep_date::text AS sleep_date, timezone, logical_source_key, source_name,
            total_sleep_minutes, observation_status, analysis_eligible
     FROM sleep_nightly_summaries
     WHERE sleep_date = $1::date AND timezone = $2`,
    [date, ACTIVITY_TIMEZONE],
  )) as Array<{
    sleep_date: string
    timezone: string
    logical_source_key: string
    source_name: string
    total_sleep_minutes: unknown
    observation_status: string
    analysis_eligible: boolean
  }>
  const row = rows[0]
  if (!row) {
    return 'absent'
  }
  return {
    sleepDate: row.sleep_date,
    timezone: row.timezone,
    logicalSourceKey: row.logical_source_key,
    sourceName: row.source_name,
    totalSleepMinutes: finite(row.total_sleep_minutes),
    observationStatus: row.observation_status,
    analysisEligible: row.analysis_eligible === true,
  }
}

async function loadContext(sql: Sql, date: string, protocolVersionId: string): Promise<ResultContextView> {
  const controls = (await sql.query(
    `SELECT tag_key FROM lab_protocol_context_controls WHERE protocol_version_id = $1::uuid ORDER BY tag_key`,
    [protocolVersionId],
  )) as Array<{ tag_key: string }>
  const rows = (await sql.query(
    `SELECT c.note, t.tag_key
     FROM daily_context c
     LEFT JOIN daily_context_tags t ON t.context_id = c.id
     WHERE c.context_date = $1::date`,
    [date],
  )) as Array<{ note: string | null; tag_key: string | null }>
  const tags = rows.flatMap((row) => (row.tag_key ? [row.tag_key] : []))
  return {
    recorded: rows.length > 0,
    tags,
    note: rows[0]?.note ?? null,
    controls: controls.map((control) => ({ tagKey: control.tag_key, recorded: tags.includes(control.tag_key) })),
  }
}

async function findFingerprint(sql: Sql, benchmarkId: string, protocolVersionId: string, fingerprint: string) {
  const rows = (await sql.query(
    `SELECT id::text AS id
     FROM benchmark_results
     WHERE benchmark_definition_id = $1::uuid
       AND protocol_version_id = $2::uuid
       AND evidence_fingerprint = $3`,
    [benchmarkId, protocolVersionId, fingerprint],
  )) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

async function assertSupersedes(benchmarkId: string, supersedesResultId: string | null) {
  if (!supersedesResultId) {
    return
  }
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT benchmark_definition_id::text AS benchmark_definition_id, status
     FROM benchmark_results
     WHERE id = $1::uuid`,
    [supersedesResultId],
  )) as Array<{ benchmark_definition_id: string; status: string }>
  const row = rows[0]
  if (!row || row.benchmark_definition_id !== benchmarkId) {
    throw new HttpError(400, 'A replacement must belong to the same benchmark.')
  }
  if (row.status !== 'invalidated') {
    throw new HttpError(400, 'Invalidate the previous result before replacing it.')
  }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual' LIMIT 1`, [])) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(500, 'Manual source is not available.')
  }
  return id
}

function parseInvalidationReason(body: unknown): string | null {
  if (body == null) {
    return null
  }
  if (typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Invalidation reason must be text.')
  }
  const reason = (body as { reason?: unknown }).reason
  if (reason == null || reason === '') {
    return null
  }
  if (typeof reason !== 'string') {
    throw new HttpError(400, 'Invalidation reason must be text.')
  }
  const trimmed = reason.trim()
  if (!trimmed) {
    return null
  }
  if (trimmed.length > 500) {
    throw new HttpError(400, 'Invalidation reason must be 500 characters or fewer.')
  }
  return trimmed
}

function deltasBetween(previous: HistoryValue[], next: HistoryValue[]): ResultDelta[] {
  return next.flatMap((value) => {
    const prior = previous.find((item) => item.requirementId === value.requirementId)
    if (!prior) {
      return []
    }
    const delta = sameProtocolValueDelta(prior.value, value.value)
    return [{ requirementId: value.requirementId, label: value.label, absolute: delta.absolute, percent: delta.percent }]
  })
}

function toPublicPreview(preview: BenchmarkPreview): PublicPreview {
  const { fingerprintMaterial, protocolMismatch, experimentConflict, ...rest } = preview
  void fingerprintMaterial
  void protocolMismatch
  void experimentConflict
  return rest
}

function finite(value: unknown): number | null {
  if (value == null || value === '') {
    return null
  }
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function timestamp(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return String(value)
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return {}
}

type SessionRow = {
  session_id: string
  workout_date: string
  session_type: string
  session_name: string | null
  experiment_id: string | null
  benchmark_protocol_version_id: string | null
  exercise_definition_id: string
  exercise_name: string
  measurement_kind: string
  analytics_rep_mode: string
  set_id: string | null
  set_number: number | null
  set_type: string | null
  reps: unknown
  duration_sec: unknown
  left_reps: unknown
  right_reps: unknown
  left_duration_sec: unknown
  right_duration_sec: unknown
}

type BodyRow = {
  measurement_id: string
  metric_key: string
  value: unknown
  unit: string
  value_kind: string
  measurement_session_id: string
  measured_at: string | Date
  timezone: string | null
}

type HistoryRow = {
  id: string
  protocol_version_id: string
  result_date: string
  status: 'valid' | 'invalidated'
  protocol_confirmation_kind: 'linked_protocol' | 'owner_attested'
  experiment_id: string | null
  invalidation_reason: string | null
  supersedes_result_id: string | null
  created_at: unknown
  requirement_id: string | null
  value: unknown
  unit: string | null
  value_kind: string | null
  label: string | null
  role: string | null
  position: number | null
}

type DetailRow = {
  id: string
  benchmark_definition_id: string
  benchmark_title: string
  protocol_version_id: string
  protocol_version: number
  result_date: string
  status: 'valid' | 'invalidated'
  protocol_confirmation_kind: 'linked_protocol' | 'owner_attested'
  experiment_id: string | null
  experiment_title: string | null
  experiment_status: string | null
  invalidated_at: unknown
  invalidation_reason: string | null
  supersedes_result_id: string | null
  created_at: unknown
  value_id: string | null
  requirement_id: string | null
  value: unknown
  unit: string | null
  value_kind: string | null
  label: string | null
  role: string | null
  position: number | null
}

type EvidenceRow = {
  value_id: string
  evidence_kind: string
  evidence_ref: unknown
  evidence_snapshot: unknown
  observation_date: string
}
