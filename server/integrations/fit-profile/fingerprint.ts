import { createHash } from 'node:crypto'
import { FIT_PROFILE_SOURCE_KEY } from '../../../src/domain/body-metrics.js'

export type FingerprintMetric = {
  key: string
  value: number
  unit: string
}

function stableNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error('Cannot fingerprint a non-finite metric value')
  }
  return value.toString()
}

export function fitProfileFingerprint(input: {
  measuredAtIso: string
  deviceName: string
  deviceMac: string
  metrics: readonly FingerprintMetric[]
}): string {
  const metrics = [...input.metrics]
    .map((metric) => ({
      key: metric.key,
      unit: metric.unit,
      value: stableNumber(metric.value),
    }))
    .sort((a, b) => a.key.localeCompare(b.key))

  const payload = {
    source: FIT_PROFILE_SOURCE_KEY,
    measuredAt: input.measuredAtIso,
    deviceName: input.deviceName.trim().toLowerCase(),
    deviceMac: input.deviceMac.replace(/[^a-fA-F0-9]/g, '').toLowerCase(),
    metrics,
  }

  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}
