import {
  BodyInputError,
  MANUAL_BODY_METRICS,
  metricDefinition,
  parseOffsetAwareMeasuredAt,
  parseStagedManualMetrics,
  type StagedManualMetric,
} from './body-manual.js'
import {
  DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
  assertIanaTimeZone,
  parseWallClockInTimeZone,
} from './time.js'
import { centimetersToInches, kilogramsToPounds } from './units.js'

export const BODY_CAPTURE_VERSION = 'body-capture-v1'
export const BODY_CAPTURE_NOTE_LIMIT = 2000
export const BODY_SHORTCUT_SOURCE_KEY = 'body_shortcut'
export const BODY_INBOX_LIST_LIMIT = 20

const CAPTURE_ID = /^[A-Za-z0-9_-]{1,80}$/
const INBOX_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LOCAL_MEASURED_AT = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2}))?$/
const CAPTURE_FIELDS = new Set(['version', 'captureId', 'capturedAt', 'timezone', 'metrics', 'notes'])
const METRIC_FIELDS = new Set(['key', 'value', 'unit'])

export type BodyCapture = {
  captureId: string
  capturedAt: string
  timezone: string
  metrics: StagedManualMetric[]
  notes: string | null
}

export function bodyInboxReviewPath(id: string): string {
  if (!INBOX_ID.test(id)) {
    throw new BodyInputError('Capture review id is invalid')
  }
  return `/body/inbox/${id}`
}

export function bodyShortcutFingerprint(captureId: string): string {
  return `body_shortcut|${BODY_CAPTURE_VERSION}|${captureId}`
}

export function parseBodyCapture(
  payload: unknown,
  now: Date,
  expectedTimeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): BodyCapture {
  if (payload == null || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new BodyInputError('Capture body is invalid')
  }
  const record = payload as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!CAPTURE_FIELDS.has(key)) {
      throw new BodyInputError('Capture contains unsupported fields')
    }
  }
  if (record.version !== BODY_CAPTURE_VERSION) {
    throw new BodyInputError('Capture version is not supported')
  }
  if (typeof record.captureId !== 'string' || !CAPTURE_ID.test(record.captureId)) {
    throw new BodyInputError('Capture id is invalid')
  }
  const timeZone = assertIanaTimeZone(expectedTimeZone)
  if (record.timezone !== timeZone) {
    throw new BodyInputError(`Capture timezone must be ${timeZone}`)
  }
  const measuredAt = parseOffsetAwareMeasuredAt(record.capturedAt, now)
  if (!Array.isArray(record.metrics) || record.metrics.length > MANUAL_BODY_METRICS.length) {
    throw new BodyInputError('Enter at least one measurement')
  }
  for (const item of record.metrics) {
    if (item == null || typeof item !== 'object' || Array.isArray(item)) {
      throw new BodyInputError('Measurement entry is invalid')
    }
    for (const key of Object.keys(item as Record<string, unknown>)) {
      if (!METRIC_FIELDS.has(key)) {
        throw new BodyInputError('Capture contains unsupported fields')
      }
    }
  }
  const metrics = parseStagedManualMetrics(record.metrics)
  return {
    captureId: record.captureId,
    capturedAt: measuredAt.toISOString(),
    timezone: timeZone,
    metrics,
    notes: parseCaptureNotes(record.notes),
  }
}

export function parseCaptureNotes(value: unknown): string | null {
  if (value == null) {
    return null
  }
  if (typeof value !== 'string') {
    throw new BodyInputError('Notes must be text')
  }
  const trimmed = value.trim()
  if (trimmed.length > BODY_CAPTURE_NOTE_LIMIT) {
    throw new BodyInputError('Notes are too long')
  }
  return trimmed.length === 0 ? null : trimmed
}

export function bodyCapturesMatch(
  left: Pick<BodyCapture, 'capturedAt' | 'notes' | 'metrics'>,
  right: Pick<BodyCapture, 'capturedAt' | 'notes' | 'metrics'>,
): boolean {
  return (
    new Date(left.capturedAt).getTime() === new Date(right.capturedAt).getTime() &&
    left.notes === right.notes &&
    metricKey(left.metrics) === metricKey(right.metrics)
  )
}

export function stagedFormValue(metric: StagedManualMetric): string {
  const definition = metricDefinition(metric.key)
  if (!definition) {
    return ''
  }
  const formUnit = definition.manualInputUnits[0] ?? metric.unit
  let value = metric.value
  if (metric.unit === 'kg' && formUnit === 'lb') {
    value = kilogramsToPounds(metric.value)
  } else if (metric.unit === 'cm' && formUnit === 'in') {
    value = centimetersToInches(metric.value)
  }
  return String(Math.round(value * 1_000_000) / 1_000_000)
}

export function dateTimeLocalInTimeZone(
  iso: string,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    throw new BodyInputError('Measurement time is invalid')
  }
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: assertIanaTimeZone(timeZone),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  )
  const hour = parts.hour === '24' ? '00' : parts.hour
  const second = parts.second ?? '00'
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}:${second}`
}

export function measuredAtFromLocalTime(
  local: string,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  const match = LOCAL_MEASURED_AT.exec(local)
  if (!match?.[1]) {
    throw new BodyInputError('Measurement time must include a real time')
  }
  const [date, hourMinute] = match[1].split('T')
  const [year, month, day] = (date ?? '').split('-')
  const seconds = match[2] ?? '00'
  try {
    const instant = parseWallClockInTimeZone(
      `${month}/${day}/${year} ${hourMinute}:${seconds}`,
      timeZone,
    )
    const timeZoneName = new Intl.DateTimeFormat('en-US', {
      timeZone: assertIanaTimeZone(timeZone),
      timeZoneName: 'longOffset',
    })
      .formatToParts(instant)
      .find((part) => part.type === 'timeZoneName')?.value
    const offset = timeZoneName === 'GMT'
      ? '+00:00'
      : timeZoneName?.match(/^GMT([+-]\d{2}:\d{2})$/)?.[1]
    if (!offset) {
      throw new Error('Timezone offset unavailable')
    }
    return `${match[1]}:${seconds}${offset}`
  } catch {
    throw new BodyInputError('Measurement time is invalid')
  }
}

/** Backward-compatible aliases for older callers/tests. */
export function phoenixDateTimeLocal(iso: string): string {
  return dateTimeLocalInTimeZone(iso, DEFAULT_HEALTH_CALENDAR_TIME_ZONE)
}

export function measuredAtFromPhoenixLocal(local: string): string {
  return measuredAtFromLocalTime(local, DEFAULT_HEALTH_CALENDAR_TIME_ZONE)
}

export function reviewCommitMeasuredAt(input: {
  originalCapturedAt: string
  measuredAtLocal: string
  measuredAtEdited: boolean
  timeZone?: string
}): string {
  if (!input.measuredAtEdited) {
    return input.originalCapturedAt
  }
  return measuredAtFromLocalTime(
    input.measuredAtLocal,
    input.timeZone ?? DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
  )
}

function metricKey(metrics: readonly StagedManualMetric[]): string {
  return JSON.stringify(
    [...metrics]
      .map((metric) => ({ key: metric.key, value: metric.value, unit: metric.unit }))
      .sort((left, right) => left.key.localeCompare(right.key)),
  )
}
