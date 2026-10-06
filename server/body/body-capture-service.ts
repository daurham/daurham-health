import { randomUUID } from 'node:crypto'
import {
  bodyCapturesMatch,
  bodyInboxReviewPath,
  parseBodyCapture,
  parseCaptureNotes,
  type BodyCapture,
} from '../../src/domain/body-capture.js'
import { BodyInputError, metricDefinition, parseManualCreate, type StagedManualMetric } from '../../src/domain/body-manual.js'
import { getSql } from '../db.js'
import { HttpError } from '../http.js'
import { healthCalendarTimeZone } from '../health-time.js'
import {
  BODY_CAPTURE_COMMIT_SQL,
  BODY_CAPTURE_DETAIL_SQL,
  BODY_CAPTURE_DISCARD_SQL,
  BODY_CAPTURE_LIST_SQL,
  BODY_CAPTURE_SOURCE_SQL,
  BODY_CAPTURE_STAGE_SQL,
} from './body-capture-sql.js'

export type StagedMetricView = {
  key: string
  label: string
  value: number
  unit: string
}

export type BodyInboxListItem = {
  id: string
  capturedAt: string
  timezone: string
  metrics: StagedMetricView[]
  notes: string | null
}

export type BodyCaptureIntake = {
  accepted: true
  id: string
  status: string
  reviewPath: string
  duplicate: boolean
}

function asInputError(error: unknown): never {
  if (error instanceof BodyInputError) {
    throw new HttpError(400, error.message)
  }
  if (error instanceof HttpError) {
    throw error
  }
  throw error
}

async function sourceIds(): Promise<{ manual: string; shortcut: string }> {
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_SOURCE_SQL)) as Array<{ key?: string; id?: string }>
  const manual = rows.find((row) => row.key === 'manual')?.id
  const shortcut = rows.find((row) => row.key === 'body_shortcut')?.id
  if (!manual || !shortcut) {
    throw new HttpError(500, 'Body capture sources are not configured')
  }
  return { manual, shortcut }
}

export async function stageBodyCapture(payload: unknown, now = new Date()): Promise<BodyCaptureIntake> {
  let capture: BodyCapture
  try {
    capture = parseBodyCapture(payload, now, await healthCalendarTimeZone())
  } catch (error) {
    asInputError(error)
  }
  const { shortcut } = await sourceIds()
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_STAGE_SQL, [
    capture.captureId,
    capture.capturedAt,
    capture.timezone,
    JSON.stringify(capture.metrics),
    capture.notes,
    shortcut,
  ])) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row?.id || typeof row.id !== 'string') {
    throw new HttpError(500, 'Could not stage the capture')
  }
  const duplicate = row.existing === true || row.existing === 't' || row.existing === 'true'
  if (duplicate && !bodyCapturesMatch(capture, storedCapture(row))) {
    throw new HttpError(409, 'This capture id was already used with different measurements')
  }
  return {
    accepted: true,
    id: row.id,
    status: typeof row.status === 'string' ? row.status : 'pending',
    reviewPath: bodyInboxReviewPath(row.id),
    duplicate,
  }
}

export async function listBodyInbox(): Promise<{ pendingCount: number; items: BodyInboxListItem[] }> {
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_LIST_SQL)) as Array<Record<string, unknown>>
  const pendingCount = asCount(rows[0]?.pending_count)
  const items = rows.flatMap((row) => {
    if (typeof row.id !== 'string') {
      return []
    }
    const stored = storedCapture(row)
    return [
      {
        id: row.id,
        capturedAt: stored.capturedAt,
        timezone: stored.timezone,
        metrics: stored.metrics.map(metricView),
        notes: stored.notes,
      },
    ]
  })
  return { pendingCount, items }
}

export async function getBodyInbox(id: string) {
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_DETAIL_SQL, [id])) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row || typeof row.id !== 'string' || typeof row.status !== 'string') {
    throw new HttpError(404, 'Capture not found')
  }
  const stored = storedCapture(row)
  const committed = row.status === 'committed'
  return {
    id: row.id,
    status: row.status,
    capturedAt: stored.capturedAt,
    timezone: stored.timezone,
    metrics: stored.metrics.map(metricView),
    notes: stored.notes,
    canCommit: row.status === 'pending',
    canDiscard: row.status === 'pending',
    ...(committed
      ? { canonicalSessionId: typeof row.canonical_session_id === 'string' ? row.canonical_session_id : null }
      : {}),
  }
}

export async function commitBodyCapture(id: string, body: unknown, now = new Date()) {
  let plan
  try {
    if (body == null || typeof body !== 'object' || Array.isArray(body) || !('measuredAt' in body)) {
      throw new BodyInputError('Measurement time must include a real time')
    }
    plan = parseManualCreate(body, now)
    parseCaptureNotes(plan.notes)
  } catch (error) {
    asInputError(error)
  }
  const [{ manual, shortcut }, timezone] = await Promise.all([
    sourceIds(),
    healthCalendarTimeZone(),
  ])
  const sessionId = randomUUID()
  const metricIds = plan.metrics.map(() => randomUUID())
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_COMMIT_SQL, [
    id,
    sessionId,
    plan.measuredAt.toISOString(),
    timezone,
    manual,
    plan.notes,
    metricIds,
    plan.metrics.map((metric) => metric.key),
    plan.metrics.map((metric) => String(metric.value)),
    plan.metrics.map((metric) => metric.unit),
    plan.metrics.length,
    randomUUID(),
    shortcut,
  ])) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Capture not found')
  }
  if (row.previous_status === 'discarded') {
    throw new HttpError(409, 'Discarded captures are not saved')
  }
  if (row.previous_status === 'committed') {
    return {
      id,
      status: 'committed' as const,
      canonicalSessionId: typeof row.existing_session_id === 'string' ? row.existing_session_id : null,
      alreadyCommitted: true,
    }
  }
  if (typeof row.inserted_session_id !== 'string') {
    throw new HttpError(500, 'Could not save the measurement')
  }
  return {
    id,
    status: 'committed' as const,
    canonicalSessionId: row.inserted_session_id,
    alreadyCommitted: false,
  }
}

export async function discardBodyCapture(id: string) {
  const sql = await getSql()
  const rows = (await sql.query(BODY_CAPTURE_DISCARD_SQL, [id])) as Array<Record<string, unknown>>
  const row = rows[0]
  if (!row) {
    throw new HttpError(404, 'Capture not found')
  }
  if (row.previous_status === 'committed') {
    throw new HttpError(409, 'A saved measurement cannot be discarded')
  }
  return { id, status: 'discarded' as const }
}

function metricView(metric: StagedManualMetric): StagedMetricView {
  return {
    key: metric.key,
    label: metricDefinition(metric.key)?.label ?? metric.key,
    value: metric.value,
    unit: metric.unit,
  }
}

function storedCapture(row: Record<string, unknown>): BodyCapture {
  const metrics = readMetrics(row.metrics)
  const notes = row.notes == null ? null : typeof row.notes === 'string' ? row.notes : null
  const capturedAt = asIso(row.captured_at)
  const timezone = typeof row.timezone === 'string' && row.timezone.trim() ? row.timezone : null
  if (!capturedAt || metrics == null || !timezone) {
    throw new HttpError(409, 'This capture id was already used with different measurements')
  }
  return {
    captureId: '',
    capturedAt,
    timezone,
    metrics,
    notes,
  }
}

function readMetrics(value: unknown): StagedManualMetric[] | null {
  const parsed = typeof value === 'string' ? parseJson(value) : value
  if (!Array.isArray(parsed)) {
    return null
  }
  const metrics: StagedManualMetric[] = []
  for (const item of parsed) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      return null
    }
    const record = item as Record<string, unknown>
    const key = typeof record.key === 'string' ? record.key : ''
    const unit = typeof record.unit === 'string' ? record.unit : ''
    const number = typeof record.value === 'number' ? record.value : Number(record.value)
    if (!metricDefinition(key) || !Number.isFinite(number) || unit.length === 0) {
      return null
    }
    metrics.push({ key, value: number, unit })
  }
  return metrics
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function asIso(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString()
  }
  if (typeof value === 'string' && !Number.isNaN(new Date(value).getTime())) {
    return new Date(value).toISOString()
  }
  return null
}

function asCount(value: unknown): number {
  const count = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(count) ? count : 0
}
