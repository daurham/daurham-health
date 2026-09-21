import { createHash, randomUUID } from 'node:crypto'
import {
  BODY_MEASUREMENT_SESSION_ENTITY,
  FIT_PROFILE_SOURCE_KEY,
  displayValueForMetric,
} from '../../src/domain/body-metrics.js'
import {
  bodyHistoryResponseSchema,
  bodyMeasurementSessionSchema,
  bodyMetricSchema,
  fitProfileCommitResponseSchema,
  fitProfilePreviewCandidateSchema,
  fitProfilePreviewResponseSchema,
  type BodyHistoryResponse,
  type FitProfileCommitResponse,
  type FitProfilePreviewResponse,
} from '../../src/domain/body.js'
import { classifyFingerprint } from '../../src/domain/duplicates.js'
import { getSql, formatDatabaseError } from '../db.js'
import { HttpError } from '../http.js'
import {
  parseFitProfileWorkbook,
  type FitProfileCandidate,
} from '../integrations/fit-profile/parse.js'
import {
  CLAIM_AND_INSERT_SESSION_SQL,
  UPDATE_IMPORT_JOB_COUNTS_SQL,
  buildMetricsInsertSql,
} from './commit-sql.js'

function fileSha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function fitProfileSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(
    'SELECT id FROM data_sources WHERE key = $1 LIMIT 1',
    [FIT_PROFILE_SOURCE_KEY],
  )) as Array<{ id: string }>
  const sourceId = rows[0]?.id
  if (!sourceId) {
    throw new HttpError(500, 'Fit Profile data source is not configured')
  }
  return sourceId
}

async function existingFingerprints(
  sourceId: string,
  fingerprints: string[],
): Promise<Set<string>> {
  if (fingerprints.length === 0) {
    return new Set()
  }
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT external_fingerprint
     FROM source_record_links
     WHERE source_id = $1
       AND external_fingerprint = ANY($2::text[])`,
    [sourceId, fingerprints],
  )) as Array<{ external_fingerprint: string }>
  return new Set(rows.map((row) => row.external_fingerprint))
}

function candidatePreview(candidate: FitProfileCandidate, duplicate: boolean) {
  return fitProfilePreviewCandidateSchema.parse({
    fingerprint: candidate.fingerprint,
    duplicate,
    measuredAt: candidate.measuredAt.toISOString(),
    timezone: candidate.timezone,
    deviceName: candidate.deviceName,
    sourceMeasuredAt: candidate.sourceMeasuredAt,
    metrics: candidate.metrics.map((metric) => {
      const display = displayValueForMetric(metric.unit, metric.value)
      return {
        key: metric.key,
        value: metric.value,
        unit: metric.unit,
        valueKind: metric.valueKind,
        displayValue: display.value,
        displayUnit: display.unit,
        sourceHeader: metric.sourceHeader,
        sourceValue: metric.sourceValue,
      }
    }),
    selectedByDefault: !duplicate,
  })
}

export async function previewFitProfileImport(input: {
  bytes: Uint8Array
  timezone: string
  filename: string
}): Promise<FitProfilePreviewResponse> {
  const candidates = parseFitProfileWorkbook(input.bytes, input.timezone)
  const sourceId = await fitProfileSourceId()
  const existing = await existingFingerprints(
    sourceId,
    candidates.map((candidate) => candidate.fingerprint),
  )

  const previewCandidates = candidates.map((candidate) =>
    candidatePreview(
      candidate,
      classifyFingerprint(candidate.fingerprint, existing) === 'duplicate',
    ),
  )

  return fitProfilePreviewResponseSchema.parse({
    timezone: input.timezone,
    filename: input.filename,
    newCount: previewCandidates.filter((candidate) => !candidate.duplicate).length,
    duplicateCount: previewCandidates.filter((candidate) => candidate.duplicate).length,
    errorCount: 0,
    candidates: previewCandidates,
    errors: [],
  })
}

function decimalString(value: number): string {
  if (!Number.isFinite(value)) {
    throw new HttpError(400, 'Invalid metric value')
  }
  return value.toString()
}

export function buildCandidateCommitStatements(input: {
  sourceId: string
  jobId: string
  candidate: FitProfileCandidate
  sessionId: string
  linkId: string
}): {
  claim: { sql: string; params: unknown[] }
  metrics: { sql: string; params: unknown[] } | null
} {
  const claim = {
    sql: CLAIM_AND_INSERT_SESSION_SQL,
    params: [
      input.linkId,
      input.sourceId,
      input.jobId,
      input.candidate.fingerprint,
      BODY_MEASUREMENT_SESSION_ENTITY,
      input.sessionId,
      JSON.stringify(input.candidate.sourcePayload),
      input.candidate.measuredAt.toISOString(),
      input.candidate.timezone,
      input.candidate.deviceName,
      JSON.stringify({ vendor: input.candidate.vendor }),
    ],
  }

  if (input.candidate.metrics.length === 0) {
    return { claim, metrics: null }
  }

  const params: unknown[] = []
  for (const metric of input.candidate.metrics) {
    params.push(
      randomUUID(),
      input.sessionId,
      metric.key,
      decimalString(metric.value),
      metric.unit,
      metric.valueKind,
    )
  }
  params.push(input.linkId)

  return {
    claim,
    metrics: {
      sql: buildMetricsInsertSql(input.candidate.metrics.length),
      params,
    },
  }
}

export async function commitFitProfileImport(input: {
  bytes: Uint8Array
  timezone: string
  filename: string
  fingerprints: string[]
}): Promise<FitProfileCommitResponse> {
  const selected = new Set(input.fingerprints)
  if (selected.size === 0) {
    throw new HttpError(400, 'Select at least one measurement to import')
  }

  const candidates = parseFitProfileWorkbook(input.bytes, input.timezone)
  const byFingerprint = new Map(candidates.map((candidate) => [candidate.fingerprint, candidate]))
  for (const fingerprint of selected) {
    if (!byFingerprint.has(fingerprint)) {
      throw new HttpError(400, 'A selected measurement was not found in the uploaded file')
    }
  }

  const sourceId = await fitProfileSourceId()
  const selectedCandidates = candidates.filter((candidate) => selected.has(candidate.fingerprint))
  const unselectedCount = candidates.length - selectedCandidates.length

  const sql = await getSql()
  const jobId = randomUUID()
  const fileHash = fileSha256(input.bytes)
  const queries = [
    sql.query(
      `INSERT INTO import_jobs (
         id, source_id, source_filename, format_version, status,
         record_count, inserted_count, matched_count, skipped_count, error_count,
         content_hash, metadata
       ) VALUES (
         $1, $2, $3, $4, $5,
         $6, $7, $8, $9, $10,
         NULL, $11::jsonb
       )`,
      [
        jobId,
        sourceId,
        input.filename,
        'fit_profile_xlsx.v1',
        'processing',
        candidates.length,
        0,
        0,
        0,
        0,
        JSON.stringify({
          timezone: input.timezone,
          fileSha256: fileHash,
        }),
      ],
    ),
  ]

  for (const candidate of selectedCandidates) {
    const statements = buildCandidateCommitStatements({
      sourceId,
      jobId,
      candidate,
      sessionId: randomUUID(),
      linkId: randomUUID(),
    })
    queries.push(sql.query(statements.claim.sql, statements.claim.params))
    if (statements.metrics) {
      queries.push(sql.query(statements.metrics.sql, statements.metrics.params))
    }
  }

  queries.push(
    sql.query(UPDATE_IMPORT_JOB_COUNTS_SQL, [
      jobId,
      selectedCandidates.length,
      unselectedCount,
      0,
      candidates.length,
    ]),
  )

  try {
    await sql.transaction(queries)
  } catch {
    throw new HttpError(500, 'Import could not be completed')
  }

  const [job] = (await sql.query(
    `SELECT inserted_count, matched_count, skipped_count, error_count
     FROM import_jobs WHERE id = $1`,
    [jobId],
  )) as Array<{
    inserted_count: number
    matched_count: number
    skipped_count: number
    error_count: number
  }>

  return fitProfileCommitResponseSchema.parse({
    importJobId: jobId,
    insertedCount: job?.inserted_count ?? 0,
    matchedCount: job?.matched_count ?? 0,
    skippedCount: job?.skipped_count ?? 0,
    errorCount: job?.error_count ?? 0,
  })
}

export async function listBodyMeasurements(): Promise<BodyHistoryResponse> {
  const sql = await getSql()
  let sessionRows: Array<{
    id: string
    measured_at: string | Date
    timezone: string | null
    device_name: string | null
  }>
  try {
    sessionRows = (await sql.query(
      `SELECT id, measured_at, timezone, device_name
       FROM body_measurement_sessions
       ORDER BY measured_at DESC`,
    )) as Array<{
      id: string
      measured_at: string | Date
      timezone: string | null
      device_name: string | null
    }>
  } catch (error) {
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(
        503,
        'Body measurement tables are not available. Apply pending migrations.',
      )
    }
    throw new HttpError(500, 'Could not load measurements')
  }

  if (sessionRows.length === 0) {
    return bodyHistoryResponseSchema.parse({ sessions: [] })
  }

  const metricRows = (await sql.query(
    `SELECT id, measurement_session_id, metric_key, value, unit, value_kind
     FROM body_metrics
     WHERE measurement_session_id = ANY($1::uuid[])
     ORDER BY metric_key`,
    [sessionRows.map((row) => row.id)],
  )) as Array<{
    id: string
    measurement_session_id: string
    metric_key: string
    value: string | number
    unit: string
    value_kind: string
  }>

  const metricsBySession = new Map<string, ReturnType<typeof bodyMetricSchema.parse>[]>()
  for (const row of metricRows) {
    const metric = bodyMetricSchema.parse({
      id: row.id,
      measurementSessionId: row.measurement_session_id,
      key: row.metric_key,
      value: Number(row.value),
      unit: row.unit,
      valueKind: row.value_kind,
    })
    const list = metricsBySession.get(row.measurement_session_id) ?? []
    list.push(metric)
    metricsBySession.set(row.measurement_session_id, list)
  }

  const sessions = sessionRows.map((row) =>
    bodyMeasurementSessionSchema.parse({
      id: row.id,
      measuredAt: row.measured_at,
      timezone: row.timezone,
      deviceName: row.device_name,
      metrics: metricsBySession.get(row.id) ?? [],
    }),
  )

  return bodyHistoryResponseSchema.parse({ sessions })
}
