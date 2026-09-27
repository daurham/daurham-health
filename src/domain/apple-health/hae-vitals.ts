import { HealthAutoExportError } from './hae.js'
import { parseHaeInstant } from './hae-sleep.js'
import {
  SLEEP_VITAL_REGISTRY,
  normalizeSleepVitalUnit,
  sleepVitalFingerprint,
  vitalSourceFamily,
  type SleepVitalDefinition,
  type SleepVitalMetricKey,
} from '../sleep/vitals.js'

/**
 * Health Auto Export quantity samples for overnight vitals.
 *
 * Production parsing uses SLEEP_VITAL_REGISTRY. Every metric there is disabled
 * until a real payload verifies the inbound name, unit, timestamp, and source.
 * A point that only has a calendar `date` is a day summary. Those stay out of
 * this table, including the daily `heart_rate` shape already ignored by the
 * activity parser.
 *
 * When an enabled metric supplies start and end, both are kept. The
 * observation instant is the start.
 */

export type ParsedSleepVital = {
  metricKey: SleepVitalMetricKey
  value: number
  unit: string
  observedAt: string
  startAt: string | null
  endAt: string | null
  sourceFamily: string
  sourceFamilyKey: string
  fingerprint: string
}

export type SleepVitalParseResult = {
  samples: ParsedSleepVital[]
  coveredMetricKeys: string[]
  ignoredNames: string[]
  aggregatedIgnored: number
}

export type SleepVitalAuditRow = {
  inboundName: string
  declaredUnit: string | null
  sampleCount: number
  hasDate: boolean
  hasStart: boolean
  hasEnd: boolean
  sourceFieldCount: number
  knownFamilies: string[]
  metricKey: string | null
  enabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function metricsOf(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.metrics)) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  return payload.data.metrics.filter(isRecord)
}

function definitionForName(name: string, registry: readonly SleepVitalDefinition[]): SleepVitalDefinition | null {
  return registry.find((item) => item.inboundNames.includes(name)) ?? null
}

function bounds(point: Record<string, unknown>): { startRaw: string; endRaw: string } | null {
  const startRaw = text(point.startDate) ?? text(point.start)
  const endRaw = text(point.endDate) ?? text(point.end)
  if (!startRaw || !endRaw) {
    return null
  }
  return { startRaw, endRaw }
}

export function parseHealthAutoExportVitals(
  payload: unknown,
  registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY,
): SleepVitalParseResult {
  const samples: ParsedSleepVital[] = []
  const seen = new Set<string>()
  const ignored = new Set<string>()
  const covered = new Set<string>()
  let aggregatedIgnored = 0
  for (const metric of metricsOf(payload)) {
    const name = text(metric.name)
    if (!name) {
      throw new HealthAutoExportError('Health Auto Export metric name is invalid')
    }
    const definition = definitionForName(name, registry)
    if (!definition || !definition.enabled) {
      ignored.add(name)
      continue
    }
    if (!Array.isArray(metric.data)) {
      throw new HealthAutoExportError(`Health Auto Export ${name} data is invalid`)
    }
    const declaredUnit = text(metric.units) ?? ''
    for (const point of metric.data) {
      if (!isRecord(point)) {
        aggregatedIgnored += 1
        continue
      }
      const interval = bounds(point)
      if (!interval) {
        aggregatedIgnored += 1
        continue
      }
      const qty = point.qty
      if (typeof qty !== 'number' || !Number.isFinite(qty)) {
        throw new HealthAutoExportError(`Health Auto Export ${name} quantity is invalid`)
      }
      const unit = text(point.units) ?? declaredUnit
      const value = normalizeSleepVitalUnit(definition, unit, qty)
      if (value == null) {
        throw new HealthAutoExportError(`Health Auto Export ${name} unit is invalid`)
      }
      const startAt = parseHaeInstant(interval.startRaw)
      const endAt = parseHaeInstant(interval.endRaw)
      if (Date.parse(endAt) < Date.parse(startAt)) {
        aggregatedIgnored += 1
        continue
      }
      const family = vitalSourceFamily(text(point.source))
      const fingerprint = sleepVitalFingerprint({
        metricKey: definition.metricKey,
        sourceFamilyKey: family.key,
        observedAt: startAt,
        startAt,
        endAt,
        value,
        unit: definition.canonicalUnit,
      })
      if (seen.has(fingerprint)) {
        continue
      }
      seen.add(fingerprint)
      covered.add(definition.metricKey)
      samples.push({
        metricKey: definition.metricKey,
        value,
        unit: definition.canonicalUnit,
        observedAt: startAt,
        startAt,
        endAt,
        sourceFamily: family.name,
        sourceFamilyKey: family.key,
        fingerprint,
      })
    }
  }
  return {
    samples,
    coveredMetricKeys: [...covered].sort(),
    ignoredNames: [...ignored].sort(),
    aggregatedIgnored,
  }
}

export function auditSleepVitalPayload(
  payload: unknown,
  registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY,
): SleepVitalAuditRow[] {
  const rows: SleepVitalAuditRow[] = []
  for (const metric of metricsOf(payload)) {
    const name = text(metric.name)
    if (!name || !Array.isArray(metric.data)) {
      continue
    }
    const definition = definitionForName(name, registry)
    let hasDate = false
    let hasStart = false
    let hasEnd = false
    let sourceFieldCount = 0
    const families = new Set<string>()
    for (const point of metric.data) {
      if (!isRecord(point)) {
        continue
      }
      if (text(point.date)) {
        hasDate = true
      }
      if (text(point.startDate) || text(point.start)) {
        hasStart = true
      }
      if (text(point.endDate) || text(point.end)) {
        hasEnd = true
      }
      const source = text(point.source)
      if (source) {
        sourceFieldCount += 1
        families.add(vitalSourceFamily(source).name)
      }
    }
    rows.push({
      inboundName: name,
      declaredUnit: text(metric.units),
      sampleCount: metric.data.length,
      hasDate,
      hasStart,
      hasEnd,
      sourceFieldCount,
      knownFamilies: [...families].sort(),
      metricKey: definition?.metricKey ?? null,
      enabled: Boolean(definition?.enabled),
    })
  }
  return rows.sort((left, right) => left.inboundName.localeCompare(right.inboundName))
}

export function formatSleepVitalAudit(rows: readonly SleepVitalAuditRow[]): string {
  const lines = ['Sleep vital capability audit', '']
  if (rows.length === 0) {
    lines.push('No metrics in payload.')
    return lines.join('\n')
  }
  for (const row of rows) {
    lines.push(row.inboundName)
    lines.push(`Declared unit: ${row.declaredUnit ?? 'none'}`)
    lines.push(`Samples inspected: ${row.sampleCount}`)
    lines.push(`Timestamp fields: date=${row.hasDate} start=${row.hasStart} end=${row.hasEnd}`)
    lines.push(`Source field count: ${row.sourceFieldCount}`)
    lines.push(`Sources: ${row.knownFamilies.length > 0 ? row.knownFamilies.join(', ') : 'none'}`)
    lines.push(`Canonical key: ${row.metricKey ?? 'none'}`)
    lines.push(`Enabled: ${row.enabled ? 'yes' : 'no'}`)
    lines.push('')
  }
  return lines.join('\n')
}
