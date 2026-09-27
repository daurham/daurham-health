import { median } from '../progress/statistics.js'
import type { SleepObservationStatus } from './completeness.js'
import { logicalSleepSource } from './sources.js'

/**
 * Overnight vital observations.
 *
 * A metric stays disabled until an inbound payload has verified its name,
 * meaning, unit, timestamp, and observing source. The production registry
 * below records that audit: none of those checks passed.
 *
 * When a verified quantity sample has both bounds, the observation instant
 * is the interval start. That instant is what episode containment uses.
 * A calendar-day summary is not an overnight sample.
 */

export const SLEEP_VITAL_OBSERVATION_VERSION = 'sleep-vital-observation-v1'

export const SLEEP_VITAL_METRIC_KEYS = [
  'heart_rate',
  'hrv_sdnn',
  'respiratory_rate',
  'oxygen_saturation',
  'sleeping_wrist_temperature',
] as const

export type SleepVitalMetricKey = (typeof SLEEP_VITAL_METRIC_KEYS)[number]

export type SleepVitalUnitRule = {
  source: string
  /** Multiply a 0–1 fraction into the 0–100 percentage scale. */
  fractionToPercent?: boolean
}

export type SleepVitalDefinition = {
  metricKey: SleepVitalMetricKey
  label: string
  canonicalUnit: string
  enabled: boolean
  inboundNames: readonly string[]
  sourceUnits: readonly SleepVitalUnitRule[]
}

export const SLEEP_VITAL_REGISTRY: readonly SleepVitalDefinition[] = [
  {
    metricKey: 'heart_rate',
    label: 'Heart rate',
    canonicalUnit: 'bpm',
    enabled: false,
    inboundNames: [],
    sourceUnits: [],
  },
  {
    metricKey: 'hrv_sdnn',
    label: 'HRV (SDNN)',
    canonicalUnit: 'ms',
    enabled: false,
    inboundNames: [],
    sourceUnits: [],
  },
  {
    metricKey: 'respiratory_rate',
    label: 'Respiratory rate',
    canonicalUnit: 'breaths/min',
    enabled: false,
    inboundNames: [],
    sourceUnits: [],
  },
  {
    metricKey: 'oxygen_saturation',
    label: 'Oxygen saturation',
    canonicalUnit: '%',
    enabled: false,
    inboundNames: [],
    sourceUnits: [],
  },
  {
    metricKey: 'sleeping_wrist_temperature',
    label: 'Wrist temperature',
    canonicalUnit: '°C',
    enabled: false,
    inboundNames: [],
    sourceUnits: [],
  },
]

export type SleepVitalObservation = {
  id: string
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

export type OvernightVital = {
  metricKey: SleepVitalMetricKey
  label: string
  value: number
  unit: string
  statistic: 'median'
  sampleCount: number
  firstObservedAt: string
  lastObservedAt: string
  sourceFamily: string
}

export type VitalReconcileExisting = {
  id: string
  fingerprint: string
  metricKey: string
  haeOwned: boolean
  inWindow: boolean
}

export type VitalReconcilePlan = {
  insertFingerprints: string[]
  matchedIds: string[]
  removeIds: string[]
}

const KNOWN_FAMILY_KEYS = new Set(['apple_watch', 'circular', 'sleep_cycle', 'iphone'])

export function enabledSleepVitals(registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY): SleepVitalDefinition[] {
  return registry.filter((item) => item.enabled)
}

export function sleepVitalDefinition(
  metricKey: string,
  registry: readonly SleepVitalDefinition[] = SLEEP_VITAL_REGISTRY,
): SleepVitalDefinition | null {
  return registry.find((item) => item.metricKey === metricKey) ?? null
}

/** Known wearable families only. An unrecognized string stays Unknown source. */
export function vitalSourceFamily(sourceName: string | null | undefined): { key: string; name: string } {
  const logical = logicalSleepSource(sourceName)
  if (KNOWN_FAMILY_KEYS.has(logical.key)) {
    return logical
  }
  return { key: 'unknown', name: 'Unknown source' }
}

export function sleepVitalFingerprint(input: {
  metricKey: string
  sourceFamilyKey: string
  observedAt: string
  startAt: string | null
  endAt: string | null
  value: number
  unit: string
}): string {
  return [
    'sleep-vital',
    input.metricKey,
    input.sourceFamilyKey,
    input.observedAt,
    input.startAt ?? '',
    input.endAt ?? '',
    Object.is(input.value, -0) ? '0' : String(input.value),
    input.unit,
  ].join('|')
}

export function normalizeSleepVitalUnit(definition: SleepVitalDefinition, sourceUnit: string, value: number): number | null {
  const token = sourceUnit.trim().toLowerCase().replace(/°/g, '')
  const rule = definition.sourceUnits.find((item) => item.source.toLowerCase().replace(/°/g, '') === token)
  if (!rule || !Number.isFinite(value)) {
    return null
  }
  if (rule.fractionToPercent) {
    if (value < 0 || value > 1) {
      return null
    }
    return value * 100
  }
  if (value < 0 && definition.metricKey !== 'sleeping_wrist_temperature') {
    return null
  }
  return value
}

export function sampleInEpisode(observedAt: string, episodeStart: string, episodeEnd: string): boolean {
  const instant = Date.parse(observedAt)
  const start = Date.parse(episodeStart)
  const end = Date.parse(episodeEnd)
  return Number.isFinite(instant) && Number.isFinite(start) && Number.isFinite(end) && instant >= start && instant < end
}

export function deriveOvernightVitals(input: {
  observationStatus: SleepObservationStatus
  episodeStart: string
  episodeEnd: string
  samples: readonly SleepVitalObservation[]
  registry?: readonly SleepVitalDefinition[]
}): OvernightVital[] {
  if (input.observationStatus === 'in_bed_only') {
    return []
  }
  const registry = input.registry ?? SLEEP_VITAL_REGISTRY
  const enabled = new Map(enabledSleepVitals(registry).map((item) => [item.metricKey, item]))
  const groups = new Map<string, { definition: SleepVitalDefinition; sourceFamily: string; values: number[]; instants: string[] }>()
  for (const sample of input.samples) {
    const definition = enabled.get(sample.metricKey)
    if (!definition || sample.unit !== definition.canonicalUnit) {
      continue
    }
    if (!sampleInEpisode(sample.observedAt, input.episodeStart, input.episodeEnd)) {
      continue
    }
    if (!Number.isFinite(sample.value)) {
      continue
    }
    const key = `${sample.metricKey}|${sample.sourceFamilyKey}`
    const group = groups.get(key) ?? { definition, sourceFamily: sample.sourceFamily, values: [], instants: [] }
    group.values.push(sample.value)
    group.instants.push(sample.observedAt)
    groups.set(key, group)
  }
  const order = new Map(registry.map((item, index) => [item.metricKey, index]))
  return [...groups.values()]
    .map((group) => {
      const value = median(group.values)
      const instants = [...group.instants].sort()
      if (value == null || instants.length === 0) {
        return null
      }
      const reading: OvernightVital = {
        metricKey: group.definition.metricKey,
        label: group.definition.label,
        value,
        unit: group.definition.canonicalUnit,
        statistic: 'median',
        sampleCount: group.values.length,
        firstObservedAt: instants[0]!,
        lastObservedAt: instants[instants.length - 1]!,
        sourceFamily: group.sourceFamily,
      }
      return reading
    })
    .filter((item): item is OvernightVital => item != null)
    .sort((left, right) => {
      const byMetric = (order.get(left.metricKey) ?? 0) - (order.get(right.metricKey) ?? 0)
      if (byMetric !== 0) {
        return byMetric
      }
      return left.sourceFamily.localeCompare(right.sourceFamily)
    })
}

export function planSleepVitalReconciliation(input: {
  incomingFingerprints: readonly string[]
  existing: readonly VitalReconcileExisting[]
  coveredMetricKeys: readonly string[]
}): VitalReconcilePlan {
  const incoming = new Set(input.incomingFingerprints)
  const covered = new Set(input.coveredMetricKeys)
  const matchedIds: string[] = []
  const matchedFingerprints = new Set<string>()
  for (const row of input.existing) {
    if (!incoming.has(row.fingerprint) || matchedFingerprints.has(row.fingerprint)) {
      continue
    }
    matchedFingerprints.add(row.fingerprint)
    matchedIds.push(row.id)
  }
  const insertFingerprints = [...new Set(input.incomingFingerprints)].filter((key) => !matchedFingerprints.has(key)).sort()
  const removeIds = input.existing
    .filter((row) => row.inWindow && row.haeOwned && covered.has(row.metricKey) && !incoming.has(row.fingerprint))
    .map((row) => row.id)
  return { insertFingerprints, matchedIds, removeIds }
}
