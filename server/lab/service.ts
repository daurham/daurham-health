import { randomUUID } from 'node:crypto'
import { benchmarkOutcomeRoleError } from '../../src/domain/lab-results.js'
import { experimentNeedsReview } from '../../src/domain/experiment-results.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import {
  cleanOptionalText,
  cleanRequiredText,
  experimentBenchmarkPinError,
  experimentStatusTransitionError,
  experimentWindowError,
  isBenchmarkDomain,
  parseBenchmarkLinks,
  parseContextControls,
  parseLabRequirements,
  parseSupplementLinks,
  retestIntervalError,
  type BenchmarkDomain,
  type ExperimentOrigin,
  type ExperimentStatus,
  type LabExistence,
  type LabProtocolKind,
  type LabRequirement,
} from '../../src/domain/lab.js'
import { getSql, type Sql } from '../db.js'
import { HttpError } from '../http.js'

type VersionContent = {
  instructions: string
  minimumRetestDays: number | null
  suggestedRetestDays: number | null
  requirements: LabRequirement[]
  contextControls: Array<{ tagKey: string; controlMode: 'observe' }>
}

function optionalCount(value: unknown, name: string): { value: number | null } | { error: string } {
  if (value == null || value === '') {
    return { value: null }
  }
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    return { error: `${name} must be a whole number.` }
  }
  return { value }
}

async function manualSourceId(sql: Sql): Promise<string> {
  const rows = (await sql.query(`SELECT id::text AS id FROM data_sources WHERE key = 'manual'`, [])) as Array<{ id?: string }>
  const id = rows[0]?.id
  if (!id) {
    throw new HttpError(503, 'Manual data source is not configured')
  }
  return id
}

async function existenceFor(sql: Sql, body: unknown): Promise<LabExistence> {
  const record = body != null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const requirements = Array.isArray(record.requirements) ? record.requirements : []
  const supplementIds = new Set<string>()
  const exerciseIds = new Set<string>()
  const benchmarkIds = new Set<string>()
  const protocolVersionIds = new Set<string>()
  for (const item of requirements) {
    if (item == null || typeof item !== 'object') {
      continue
    }
    const selector = (item as { selector?: unknown }).selector
    if (selector == null || typeof selector !== 'object') {
      continue
    }
    const fields = selector as Record<string, unknown>
    if (typeof fields.supplementId === 'string') {
      supplementIds.add(fields.supplementId)
    }
    if (typeof fields.exerciseDefinitionId === 'string') {
      exerciseIds.add(fields.exerciseDefinitionId)
    }
    if (typeof fields.benchmarkDefinitionId === 'string') {
      benchmarkIds.add(fields.benchmarkDefinitionId)
    }
    if (typeof fields.benchmarkProtocolVersionId === 'string') {
      protocolVersionIds.add(fields.benchmarkProtocolVersionId)
    }
  }
  for (const item of Array.isArray(record.supplements) ? record.supplements : []) {
    if (item && typeof item === 'object' && typeof (item as { supplementId?: unknown }).supplementId === 'string') {
      supplementIds.add((item as { supplementId: string }).supplementId)
    }
  }
  for (const item of Array.isArray(record.benchmarks) ? record.benchmarks : []) {
    if (item && typeof item === 'object' && typeof (item as { benchmarkDefinitionId?: unknown }).benchmarkDefinitionId === 'string') {
      benchmarkIds.add((item as { benchmarkDefinitionId: string }).benchmarkDefinitionId)
    }
  }
  const supplements =
    supplementIds.size === 0
      ? []
      : ((await sql.query(`SELECT id::text AS id FROM supplements WHERE id = ANY($1::uuid[])`, [[...supplementIds]])) as Array<{ id: string }>)
  const exercises =
    exerciseIds.size === 0
      ? []
      : ((await sql.query(`SELECT id::text AS id FROM exercise_definitions WHERE id = ANY($1::uuid[])`, [[...exerciseIds]])) as Array<{ id: string }>)
  const benchmarks =
    benchmarkIds.size === 0
      ? []
      : ((await sql.query(`SELECT id::text AS id FROM benchmark_definitions WHERE id = ANY($1::uuid[])`, [[...benchmarkIds]])) as Array<{ id: string }>)
  const pins =
    protocolVersionIds.size === 0
      ? []
      : ((await sql.query(
          `SELECT b.id::text AS benchmark_id, v.id::text AS version_id
           FROM lab_protocol_versions v
           JOIN benchmark_definitions b ON b.protocol_id = v.protocol_id
           WHERE v.id = ANY($1::uuid[])`,
          [[...protocolVersionIds]],
        )) as Array<{ benchmark_id: string; version_id: string }>)
  return {
    supplementIds: new Set(supplements.map((row) => row.id)),
    exerciseIds: new Set(exercises.map((row) => row.id)),
    benchmarkIds: new Set(benchmarks.map((row) => row.id)),
    benchmarkProtocolPins: new Set(pins.map((row) => `${row.benchmark_id}:${row.version_id}`)),
  }
}

function protocolContent(
  body: unknown,
  existence: LabExistence,
  requireMeasurement: boolean,
  benchmarkOutcomes = false,
  pinBenchmarkProtocol = false,
): VersionContent {
  if (body == null || typeof body !== 'object') {
    throw new HttpError(400, 'Protocol content is required.')
  }
  const record = body as Record<string, unknown>
  const instructions = cleanRequiredText(record.instructions, 'Instructions', 8000)
  if ('error' in instructions) {
    throw new HttpError(400, instructions.error)
  }
  const minimum = optionalCount(record.minimumRetestDays, 'Minimum retest days')
  if ('error' in minimum) {
    throw new HttpError(400, minimum.error)
  }
  const suggested = optionalCount(record.suggestedRetestDays, 'Suggested retest days')
  if ('error' in suggested) {
    throw new HttpError(400, suggested.error)
  }
  const retestError = retestIntervalError(minimum.value, suggested.value)
  if (retestError) {
    throw new HttpError(400, retestError)
  }
  const requirements = parseLabRequirements(record.requirements, existence)
  if ('error' in requirements) {
    throw new HttpError(400, requirements.error)
  }
  if (requireMeasurement && requirements.length === 0) {
    throw new HttpError(400, 'A benchmark needs at least one measurement.')
  }
  if (benchmarkOutcomes) {
    const outcomeError = benchmarkOutcomeRoleError(requirements)
    if (outcomeError) {
      throw new HttpError(400, outcomeError)
    }
  }
  if (pinBenchmarkProtocol) {
    const pinError = experimentBenchmarkPinError(requirements)
    if (pinError) {
      throw new HttpError(400, pinError)
    }
  }
  const controls = parseContextControls(record.contextTags ?? record.contextControls)
  if ('error' in controls) {
    throw new HttpError(400, controls.error)
  }
  return {
    instructions: instructions.text,
    minimumRetestDays: minimum.value,
    suggestedRetestDays: suggested.value,
    requirements,
    contextControls: controls,
  }
}

async function insertVersion(
  sql: Sql,
  protocolId: string,
  version: number,
  content: VersionContent,
  versionId = randomUUID(),
): Promise<string> {
  await sql.query(
    `INSERT INTO lab_protocol_versions (
       id, protocol_id, version, instructions, minimum_retest_days, suggested_retest_days, is_current
     ) VALUES ($1::uuid, $2::uuid, $3::int, $4, $5::int, $6::int, true)`,
    [versionId, protocolId, version, content.instructions, content.minimumRetestDays, content.suggestedRetestDays],
  )
  for (const requirement of content.requirements) {
    await sql.query(
      `INSERT INTO lab_protocol_requirements (
         id, protocol_version_id, position, role, domain, requirement_kind, selector, label, required, criteria
       ) VALUES ($1::uuid, $2::uuid, $3::int, $4, $5, $6, $7::jsonb, $8, $9, $10::jsonb)`,
      [
        randomUUID(),
        versionId,
        requirement.position,
        requirement.role,
        requirement.domain,
        requirement.requirementKind,
        JSON.stringify(requirement.selector),
        requirement.label,
        requirement.required,
        JSON.stringify(requirement.criteria),
      ],
    )
  }
  for (const control of content.contextControls) {
    await sql.query(
      `INSERT INTO lab_protocol_context_controls (protocol_version_id, tag_key, control_mode)
       VALUES ($1::uuid, $2, 'observe')`,
      [versionId, control.tagKey],
    )
  }
  return versionId
}

async function replaceLinks(sql: Sql, experimentId: string, body: unknown, existence: LabExistence): Promise<void> {
  const supplements = parseSupplementLinks(
    body != null && typeof body === 'object' ? (body as { supplements?: unknown }).supplements : null,
    existence.supplementIds,
  )
  if ('error' in supplements) {
    throw new HttpError(400, supplements.error)
  }
  const benchmarks = parseBenchmarkLinks(
    body != null && typeof body === 'object' ? (body as { benchmarks?: unknown }).benchmarks : null,
    existence.benchmarkIds,
  )
  if ('error' in benchmarks) {
    throw new HttpError(400, benchmarks.error)
  }
  await sql.query(`DELETE FROM experiment_supplements WHERE experiment_id = $1::uuid`, [experimentId])
  await sql.query(`DELETE FROM experiment_benchmarks WHERE experiment_id = $1::uuid`, [experimentId])
  for (const link of supplements) {
    await sql.query(
      `INSERT INTO experiment_supplements (experiment_id, supplement_id, role) VALUES ($1::uuid, $2::uuid, $3)`,
      [experimentId, link.supplementId, link.role],
    )
  }
  for (const link of benchmarks) {
    await sql.query(
      `INSERT INTO experiment_benchmarks (experiment_id, benchmark_definition_id, role)
       VALUES ($1::uuid, $2::uuid, $3)`,
      [experimentId, link.benchmarkDefinitionId, link.role],
    )
  }
}

type ExperimentRow = {
  id: string
  title: string
  question: string
  hypothesis: string | null
  rationale: string | null
  origin: ExperimentOrigin
  status: ExperimentStatus
  protocol_version_id: string
  protocol_id: string
  window_start: string | null
  window_end: string | null
  created_at: Date | string
  updated_at: Date | string
}

function instant(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

async function loadExperimentRow(sql: Sql, id: string): Promise<ExperimentRow> {
  const rows = (await sql.query(
    `SELECT e.id::text AS id, e.title, e.question, e.hypothesis, e.rationale, e.origin, e.status,
            e.protocol_version_id::text AS protocol_version_id,
            v.protocol_id::text AS protocol_id,
            e.window_start::text AS window_start, e.window_end::text AS window_end,
            e.created_at, e.updated_at
     FROM experiments e
     JOIN lab_protocol_versions v ON v.id = e.protocol_version_id
     WHERE e.id = $1::uuid`,
    [id],
  )) as ExperimentRow[]
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Experiment was not found.')
  }
  return row
}

async function loadVersionBundle(sql: Sql, protocolId: string) {
  const versions = (await sql.query(
    `SELECT id::text AS id, version, instructions, minimum_retest_days, suggested_retest_days, is_current, created_at
     FROM lab_protocol_versions
     WHERE protocol_id = $1::uuid
     ORDER BY version`,
    [protocolId],
  )) as Array<{
    id: string
    version: number
    instructions: string
    minimum_retest_days: number | null
    suggested_retest_days: number | null
    is_current: boolean
    created_at: Date | string
  }>
  const ids = versions.map((version) => version.id)
  const requirements = ids.length
    ? ((await sql.query(
        `SELECT id::text AS id, protocol_version_id::text AS protocol_version_id, position, role, domain,
                requirement_kind, selector, label, required, criteria
         FROM lab_protocol_requirements
         WHERE protocol_version_id = ANY($1::uuid[])
         ORDER BY position`,
        [ids],
      )) as Array<Record<string, unknown>>)
    : []
  const controls = ids.length
    ? ((await sql.query(
        `SELECT protocol_version_id::text AS protocol_version_id, tag_key, control_mode
         FROM lab_protocol_context_controls
         WHERE protocol_version_id = ANY($1::uuid[])`,
        [ids],
      )) as Array<{ protocol_version_id: string; tag_key: string; control_mode: 'observe' }>)
    : []
  return versions.map((version) => ({
    id: version.id,
    version: Number(version.version),
    instructions: version.instructions,
    minimumRetestDays: version.minimum_retest_days == null ? null : Number(version.minimum_retest_days),
    suggestedRetestDays: version.suggested_retest_days == null ? null : Number(version.suggested_retest_days),
    isCurrent: version.is_current,
    createdAt: instant(version.created_at),
    requirements: requirements
      .filter((item) => item.protocol_version_id === version.id)
      .map((item) => ({
        id: item.id,
        position: Number(item.position),
        role: item.role,
        domain: item.domain,
        requirementKind: item.requirement_kind,
        selector: item.selector,
        label: item.label,
        required: item.required,
        criteria: item.criteria ?? {},
      })),
    contextControls: controls
      .filter((item) => item.protocol_version_id === version.id)
      .map((item) => ({ tagKey: item.tag_key, controlMode: item.control_mode })),
  }))
}

async function experimentDetail(sql: Sql, id: string) {
  const row = await loadExperimentRow(sql, id)
  const versions = await loadVersionBundle(sql, row.protocol_id)
  const supplements = (await sql.query(
    `SELECT es.supplement_id::text AS supplement_id, es.role, s.name
     FROM experiment_supplements es
     JOIN supplements s ON s.id = es.supplement_id
     WHERE es.experiment_id = $1::uuid
     ORDER BY s.name`,
    [id],
  )) as Array<{ supplement_id: string; role: string; name: string }>
  const benchmarks = (await sql.query(
    `SELECT eb.benchmark_definition_id::text AS benchmark_definition_id, eb.role, p.title, b.protocol_id::text AS protocol_id
     FROM experiment_benchmarks eb
     JOIN benchmark_definitions b ON b.id = eb.benchmark_definition_id
     JOIN lab_protocols p ON p.id = b.protocol_id
     WHERE eb.experiment_id = $1::uuid
     ORDER BY eb.role, p.title`,
    [id],
  )) as Array<{ benchmark_definition_id: string; role: string; title: string; protocol_id: string }>
  const sessions = (await sql.query(
    `SELECT id::text AS id, workout_date::text AS workout_date, session_name, benchmark_protocol_version_id::text AS benchmark_protocol_version_id
     FROM workout_sessions
     WHERE experiment_id = $1::uuid
     ORDER BY workout_date, created_at`,
    [id],
  )) as Array<{ id: string; workout_date: string; session_name: string | null; benchmark_protocol_version_id: string | null }>
  const validResults = (await sql.query(
    `SELECT id::text AS id FROM experiment_results WHERE experiment_id = $1::uuid AND status = 'valid'`,
    [id],
  )) as Array<{ id: string }>
  const current = versions.find((version) => version.id === row.protocol_version_id) ?? versions.find((version) => version.isCurrent)
  const currentResultId = validResults[0]?.id ?? null
  return {
    id: row.id,
    title: row.title,
    question: row.question,
    hypothesis: row.hypothesis,
    rationale: row.rationale,
    origin: row.origin,
    status: row.status,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    protocolVersionId: row.protocol_version_id,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    versions,
    currentVersion: current ?? null,
    supplements: supplements.map((item) => ({ supplementId: item.supplement_id, name: item.name, role: item.role })),
    benchmarks: benchmarks.map((item) => ({
      benchmarkDefinitionId: item.benchmark_definition_id,
      title: item.title,
      role: item.role,
      protocolId: item.protocol_id,
    })),
    sessions: sessions.map((item) => ({
      id: item.id,
      workoutDate: item.workout_date,
      sessionName: item.session_name,
      benchmarkProtocolVersionId: item.benchmark_protocol_version_id,
    })),
    currentResultId,
    reviewReady: experimentNeedsReview({
      status: row.status,
      windowEnd: row.window_end,
      today: healthCalendarDateFromNow(),
      hasValidResult: currentResultId != null,
    }),
  }
}

export async function listExperiments() {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id, title, question, status, origin, window_start::text AS window_start, window_end::text AS window_end
     FROM experiments
     ORDER BY created_at DESC`,
    [],
  )) as Array<Record<string, string | null>>
  return {
    experiments: rows.map((row) => ({
      id: row.id,
      title: row.title,
      question: row.question,
      status: row.status,
      origin: row.origin,
      windowStart: row.window_start,
      windowEnd: row.window_end,
    })),
  }
}

export async function getExperiment(id: string) {
  const sql = await getSql()
  return experimentDetail(sql, id)
}

export async function createOwnerExperiment(body: unknown) {
  const sql = await getSql()
  const existence = await existenceFor(sql, body)
  if (body == null || typeof body !== 'object') {
    throw new HttpError(400, 'Experiment content is required.')
  }
  const record = body as Record<string, unknown>
  const title = cleanRequiredText(record.title, 'Title', 200)
  if ('error' in title) {
    throw new HttpError(400, title.error)
  }
  const question = cleanRequiredText(record.question, 'Question', 2000)
  if ('error' in question) {
    throw new HttpError(400, question.error)
  }
  const hypothesis = cleanOptionalText(record.hypothesis, 'Hypothesis', 4000)
  if ('error' in hypothesis) {
    throw new HttpError(400, hypothesis.error)
  }
  const rationale = cleanOptionalText(record.rationale, 'Rationale', 4000)
  if ('error' in rationale) {
    throw new HttpError(400, rationale.error)
  }
  const content = protocolContent(body, existence, false, false, true)
  const sourceId = await manualSourceId(sql)
  const protocolId = randomUUID()
  const experimentId = randomUUID()
  await sql.query(
    `INSERT INTO lab_protocols (id, protocol_kind, title, description, source_id)
     VALUES ($1::uuid, 'experiment', $2, NULL, $3::uuid)`,
    [protocolId, title.text, sourceId],
  )
  const versionId = await insertVersion(sql, protocolId, 1, content)
  await sql.query(
    `INSERT INTO experiments (
       id, title, question, hypothesis, rationale, origin, status, protocol_version_id, source_id
     ) VALUES ($1::uuid, $2, $3, $4, $5, 'owner_created', 'accepted', $6::uuid, $7::uuid)`,
    [experimentId, title.text, question.text, hypothesis.text, rationale.text, versionId, sourceId],
  )
  await replaceLinks(sql, experimentId, body, existence)
  return experimentDetail(sql, experimentId)
}

export async function createProposedExperiment(body: unknown, origin: ExperimentOrigin = 'ai_assisted') {
  if (origin === 'owner_created') {
    throw new HttpError(400, 'Owner-created experiments start accepted.')
  }
  const created = await createOwnerExperiment(body)
  const sql = await getSql()
  await sql.query(`UPDATE experiments SET origin = $2, status = 'proposed', updated_at = now() WHERE id = $1::uuid`, [
    created.id,
    origin,
  ])
  return experimentDetail(sql, created.id)
}

async function moveExperiment(id: string, to: ExperimentStatus, windows?: { start: string | null; end: string | null }) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  const transition = experimentStatusTransitionError(row.status, to)
  if (transition) {
    throw new HttpError(409, transition)
  }
  await sql.query(
    `UPDATE experiments
     SET status = $2, window_start = $3::date, window_end = $4::date, updated_at = now()
     WHERE id = $1::uuid`,
    [id, to, windows?.start ?? null, windows?.end ?? null],
  )
  return experimentDetail(sql, id)
}

export async function acceptExperiment(id: string) {
  return moveExperiment(id, 'accepted', { start: null, end: null })
}

export async function scheduleExperiment(id: string, body: unknown) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  if (row.status !== 'accepted' && row.status !== 'scheduled') {
    throw new HttpError(409, 'Only an accepted experiment can be scheduled.')
  }
  const record = body != null && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const window = experimentWindowError(
    typeof record.windowStart === 'string' ? record.windowStart : null,
    typeof record.windowEnd === 'string' ? record.windowEnd : null,
  )
  if ('error' in window) {
    throw new HttpError(400, window.error)
  }
  if (row.status === 'accepted') {
    const transition = experimentStatusTransitionError('accepted', 'scheduled')
    if (transition) {
      throw new HttpError(409, transition)
    }
  }
  await sql.query(
    `UPDATE experiments
     SET status = 'scheduled', window_start = $2::date, window_end = $3::date, updated_at = now()
     WHERE id = $1::uuid`,
    [id, window.windowStart, window.windowEnd],
  )
  return experimentDetail(sql, id)
}

export async function startExperiment(id: string) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  const transition = experimentStatusTransitionError(row.status, 'active')
  if (transition) {
    throw new HttpError(409, transition)
  }
  if (!row.window_start || !row.window_end) {
    throw new HttpError(400, 'An active experiment needs a date window.')
  }
  await sql.query(`UPDATE experiments SET status = 'active', updated_at = now() WHERE id = $1::uuid`, [id])
  return experimentDetail(sql, id)
}

export async function abandonExperiment(id: string) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  return moveExperiment(id, 'abandoned', { start: row.window_start, end: row.window_end })
}

export async function supersedeExperiment(id: string) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  return moveExperiment(id, 'superseded', { start: row.window_start, end: row.window_end })
}

export async function patchExperiment(id: string, body: unknown) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  if (row.status !== 'proposed' && row.status !== 'accepted' && row.status !== 'scheduled') {
    throw new HttpError(409, 'This experiment can no longer be edited.')
  }
  if (body == null || typeof body !== 'object') {
    throw new HttpError(400, 'Experiment content is required.')
  }
  const record = body as Record<string, unknown>
  const title = cleanRequiredText(record.title ?? row.title, 'Title', 200)
  if ('error' in title) {
    throw new HttpError(400, title.error)
  }
  const question = cleanRequiredText(record.question ?? row.question, 'Question', 2000)
  if ('error' in question) {
    throw new HttpError(400, question.error)
  }
  const hypothesis = cleanOptionalText(record.hypothesis === undefined ? row.hypothesis : record.hypothesis, 'Hypothesis', 4000)
  if ('error' in hypothesis) {
    throw new HttpError(400, hypothesis.error)
  }
  const rationale = cleanOptionalText(record.rationale === undefined ? row.rationale : record.rationale, 'Rationale', 4000)
  if ('error' in rationale) {
    throw new HttpError(400, rationale.error)
  }
  await sql.query(
    `UPDATE experiments
     SET title = $2, question = $3, hypothesis = $4, rationale = $5, updated_at = now()
     WHERE id = $1::uuid`,
    [id, title.text, question.text, hypothesis.text, rationale.text],
  )
  await sql.query(`UPDATE lab_protocols SET title = $2, updated_at = now() WHERE id = $1::uuid`, [row.protocol_id, title.text])
  if ('supplements' in record || 'benchmarks' in record) {
    const existence = await existenceFor(sql, body)
    await replaceLinks(sql, id, body, existence)
  }
  return experimentDetail(sql, id)
}

export async function addExperimentProtocolVersion(id: string, body: unknown) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  if (row.status === 'active' || row.status === 'abandoned' || row.status === 'superseded' || row.status === 'completed' || row.status === 'inconclusive') {
    throw new HttpError(409, 'The protocol is frozen for this experiment.')
  }
  const existence = await existenceFor(sql, body)
  const content = protocolContent(body, existence, false, false, true)
  const versions = (await sql.query(
    `SELECT COALESCE(MAX(version), 0)::int AS version FROM lab_protocol_versions WHERE protocol_id = $1::uuid`,
    [row.protocol_id],
  )) as Array<{ version: number }>
  const next = Number(versions[0]?.version ?? 0) + 1
  await sql.query(`UPDATE lab_protocol_versions SET is_current = false WHERE protocol_id = $1::uuid AND is_current`, [row.protocol_id])
  const versionId = await insertVersion(sql, row.protocol_id, next, content)
  await sql.query(`UPDATE experiments SET protocol_version_id = $2::uuid, updated_at = now() WHERE id = $1::uuid`, [id, versionId])
  return experimentDetail(sql, id)
}

export async function deleteUntouchedExperiment(id: string) {
  const sql = await getSql()
  const row = await loadExperimentRow(sql, id)
  if (row.status !== 'accepted') {
    throw new HttpError(409, 'Only an accepted experiment with no workout can be deleted.')
  }
  const sessions = (await sql.query(`SELECT id FROM workout_sessions WHERE experiment_id = $1::uuid LIMIT 1`, [id])) as unknown[]
  if (sessions.length > 0) {
    throw new HttpError(409, 'This experiment has Training evidence. Abandon it instead of deleting it.')
  }
  await sql.query(`DELETE FROM experiments WHERE id = $1::uuid`, [id])
  await sql.query(`DELETE FROM lab_protocol_versions WHERE protocol_id = $1::uuid`, [row.protocol_id])
  await sql.query(`DELETE FROM lab_protocols WHERE id = $1::uuid`, [row.protocol_id])
  return { deleted: true }
}

export async function listBenchmarks() {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT b.id::text AS id, p.title, b.domain, b.is_active, v.id::text AS current_version_id, v.version
     FROM benchmark_definitions b
     JOIN lab_protocols p ON p.id = b.protocol_id
     JOIN lab_protocol_versions v ON v.protocol_id = p.id AND v.is_current
     ORDER BY p.title`,
    [],
  )) as Array<{ id: string; title: string; domain: string; is_active: boolean; current_version_id: string; version: number }>
  return {
    benchmarks: rows.map((row) => ({
      id: row.id,
      title: row.title,
      domain: row.domain,
      isActive: row.is_active,
      currentVersion: Number(row.version),
      currentVersionId: row.current_version_id,
    })),
  }
}

async function benchmarkDetail(sql: Sql, id: string) {
  const rows = (await sql.query(
    `SELECT b.id::text AS id, b.protocol_id::text AS protocol_id, b.domain, b.description, b.is_active, p.title, b.created_at, b.updated_at
     FROM benchmark_definitions b
     JOIN lab_protocols p ON p.id = b.protocol_id
     WHERE b.id = $1::uuid`,
    [id],
  )) as Array<{
    id: string
    protocol_id: string
    domain: BenchmarkDomain
    description: string | null
    is_active: boolean
    title: string
    created_at: Date | string
    updated_at: Date | string
  }>
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Benchmark was not found.')
  }
  const versions = await loadVersionBundle(sql, row.protocol_id)
  const sessions = (await sql.query(
    `SELECT id::text AS id, workout_date::text AS workout_date, session_name, benchmark_protocol_version_id::text AS benchmark_protocol_version_id
     FROM workout_sessions
     WHERE benchmark_protocol_version_id = ANY($1::uuid[])
     ORDER BY workout_date`,
    [versions.map((version) => version.id)],
  )) as Array<{ id: string; workout_date: string; session_name: string | null; benchmark_protocol_version_id: string }>
  return {
    id: row.id,
    title: row.title,
    domain: row.domain,
    description: row.description,
    isActive: row.is_active,
    protocolId: row.protocol_id,
    createdAt: instant(row.created_at),
    updatedAt: instant(row.updated_at),
    versions,
    currentVersion: versions.find((version) => version.isCurrent) ?? null,
    sessions: sessions.map((item) => ({
      id: item.id,
      workoutDate: item.workout_date,
      sessionName: item.session_name,
      benchmarkProtocolVersionId: item.benchmark_protocol_version_id,
    })),
  }
}

export async function getBenchmark(id: string) {
  return benchmarkDetail(await getSql(), id)
}

export async function createBenchmark(body: unknown) {
  const sql = await getSql()
  const existence = await existenceFor(sql, body)
  if (body == null || typeof body !== 'object') {
    throw new HttpError(400, 'Benchmark content is required.')
  }
  const record = body as Record<string, unknown>
  const title = cleanRequiredText(record.title, 'Name', 200)
  if ('error' in title) {
    throw new HttpError(400, title.error)
  }
  if (typeof record.domain !== 'string' || !isBenchmarkDomain(record.domain)) {
    throw new HttpError(400, 'Choose a benchmark domain.')
  }
  const description = cleanOptionalText(record.description, 'Description', 4000)
  if ('error' in description) {
    throw new HttpError(400, description.error)
  }
  const content = protocolContent(body, existence, true, true)
  const sourceId = await manualSourceId(sql)
  const protocolId = randomUUID()
  const benchmarkId = randomUUID()
  await sql.query(
    `INSERT INTO lab_protocols (id, protocol_kind, title, description, source_id)
     VALUES ($1::uuid, 'benchmark', $2, $3, $4::uuid)`,
    [protocolId, title.text, description.text, sourceId],
  )
  await insertVersion(sql, protocolId, 1, content)
  await sql.query(
    `INSERT INTO benchmark_definitions (id, protocol_id, domain, description, source_id)
     VALUES ($1::uuid, $2::uuid, $3, $4, $5::uuid)`,
    [benchmarkId, protocolId, record.domain, description.text, sourceId],
  )
  return benchmarkDetail(sql, benchmarkId)
}

export async function patchBenchmark(id: string, body: unknown) {
  const sql = await getSql()
  const current = await benchmarkDetail(sql, id)
  if (body == null || typeof body !== 'object') {
    throw new HttpError(400, 'Benchmark content is required.')
  }
  const record = body as Record<string, unknown>
  const title = cleanRequiredText(record.title ?? current.title, 'Name', 200)
  if ('error' in title) {
    throw new HttpError(400, title.error)
  }
  const description = cleanOptionalText(
    record.description === undefined ? current.description : record.description,
    'Description',
    4000,
  )
  if ('error' in description) {
    throw new HttpError(400, description.error)
  }
  await sql.query(`UPDATE lab_protocols SET title = $2, description = $3, updated_at = now() WHERE id = $1::uuid`, [
    current.protocolId,
    title.text,
    description.text,
  ])
  await sql.query(`UPDATE benchmark_definitions SET description = $2, updated_at = now() WHERE id = $1::uuid`, [
    id,
    description.text,
  ])
  return benchmarkDetail(sql, id)
}

export async function addBenchmarkProtocolVersion(id: string, body: unknown) {
  const sql = await getSql()
  const current = await benchmarkDetail(sql, id)
  const existence = await existenceFor(sql, body)
  const content = protocolContent(body, existence, true, true)
  const next = (current.versions.at(-1)?.version ?? 0) + 1
  await sql.query(`UPDATE lab_protocol_versions SET is_current = false WHERE protocol_id = $1::uuid AND is_current`, [
    current.protocolId,
  ])
  await insertVersion(sql, current.protocolId, next, content)
  return benchmarkDetail(sql, id)
}

export async function archiveBenchmark(id: string) {
  const sql = await getSql()
  await benchmarkDetail(sql, id)
  await sql.query(`UPDATE benchmark_definitions SET is_active = false, updated_at = now() WHERE id = $1::uuid`, [id])
  return benchmarkDetail(sql, id)
}

export async function listTodayLabExperiments() {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT e.id::text AS id, e.title, e.status, e.window_start::text AS window_start, e.window_end::text AS window_end,
            EXISTS (
              SELECT 1 FROM experiment_results r
              WHERE r.experiment_id = e.id AND r.status = 'valid'
            ) AS has_valid_result
     FROM experiments e
     WHERE e.status IN ('scheduled', 'active')
     ORDER BY e.window_start, e.title`,
    [],
  )) as Array<{ id: string; title: string; status: 'scheduled' | 'active'; window_start: string; window_end: string; has_valid_result: boolean }>
  const today = healthCalendarDateFromNow()
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status,
    windowStart: row.window_start,
    windowEnd: row.window_end,
    reviewReady: experimentNeedsReview({
      status: row.status,
      windowEnd: row.window_end,
      today,
      hasValidResult: row.has_valid_result === true,
    }),
  }))
}

export async function assertTrainingLabParents(input: {
  sessionType: string
  experimentId: string | null
  benchmarkProtocolVersionId: string | null
}): Promise<void> {
  if (input.sessionType !== 'experiment') {
    return
  }
  const sql = await getSql()
  if (input.experimentId) {
    const rows = (await sql.query(`SELECT status FROM experiments WHERE id = $1::uuid`, [input.experimentId])) as Array<{
      status: ExperimentStatus
    }>
    if (!rows[0]) {
      throw new HttpError(400, 'That experiment was not found.')
    }
    if (rows[0].status !== 'active') {
      throw new HttpError(409, 'Log an experiment workout after the experiment is active.')
    }
  }
  let benchmarkProtocolId: string | null = null
  if (input.benchmarkProtocolVersionId) {
    const rows = (await sql.query(
      `SELECT p.protocol_kind, p.id::text AS protocol_id, b.is_active
       FROM lab_protocol_versions v
       JOIN lab_protocols p ON p.id = v.protocol_id
       LEFT JOIN benchmark_definitions b ON b.protocol_id = p.id
       WHERE v.id = $1::uuid`,
      [input.benchmarkProtocolVersionId],
    )) as Array<{ protocol_kind: LabProtocolKind; protocol_id: string; is_active: boolean | null }>
    const row = rows[0]
    if (!row || row.protocol_kind !== 'benchmark') {
      throw new HttpError(400, 'A benchmark workout must use a benchmark protocol version.')
    }
    if (row.is_active === false) {
      throw new HttpError(409, 'That benchmark is archived.')
    }
    benchmarkProtocolId = row.protocol_id
  }
  if (input.experimentId && benchmarkProtocolId) {
    const primary = (await sql.query(
      `SELECT b.protocol_id::text AS protocol_id
       FROM experiment_benchmarks eb
       JOIN benchmark_definitions b ON b.id = eb.benchmark_definition_id
       WHERE eb.experiment_id = $1::uuid AND eb.role = 'primary'`,
      [input.experimentId],
    )) as Array<{ protocol_id: string }>
    if (primary[0] && primary[0].protocol_id !== benchmarkProtocolId) {
      throw new HttpError(409, 'This workout benchmark does not match the experiment primary benchmark.')
    }
  }
}
