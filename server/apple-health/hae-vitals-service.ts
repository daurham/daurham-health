import { randomUUID } from 'node:crypto'
import { parseHealthAutoExportVitals, type ParsedSleepVital } from '../../src/domain/apple-health/hae-vitals.js'
import { planSleepVitalReconciliation, type VitalReconcileExisting } from '../../src/domain/sleep/vitals.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { INSERT_APPLE_HEALTH_JOB_SQL, UPDATE_APPLE_HEALTH_JOB_SQL } from './queries.js'
import { HAE_SOURCE_SQL } from './hae-sql.js'
import {
  DELETE_HAE_SLEEP_VITALS_SQL,
  DELETE_SLEEP_VITAL_LINKS_SQL,
  HAE_VITAL_STRATEGY,
  INSERT_SLEEP_VITAL_SQL,
  SLEEP_VITAL_ENTITY,
  VITAL_LINK_OWNERSHIP_SQL,
  WINDOW_SLEEP_VITALS_SQL,
} from './hae-vitals-sql.js'

export type HaeVitalIngestResult = {
  samplesSeen: number
  samplesInserted: number
  samplesMatched: number
  samplesRemoved: number
  coveredMetricKeys: string[]
  reconciliation: 'exclusive_hae_owned_window'
}

async function haeSourceId(): Promise<string> {
  const sql = await getSql()
  const rows = (await sql.query(HAE_SOURCE_SQL)) as Array<{ id: string }>
  const sourceId = rows[0]?.id
  if (!sourceId) {
    throw new HttpError(503, 'Health Auto Export source is not available. Apply pending migrations.')
  }
  return sourceId
}

async function persistVitals(input: {
  sourceId: string
  jobId: string
  samples: readonly ParsedSleepVital[]
  coveredMetricKeys: readonly string[]
}): Promise<Pick<HaeVitalIngestResult, 'samplesSeen' | 'samplesInserted' | 'samplesMatched' | 'samplesRemoved'>> {
  const sql = await getSql()
  const windowStart = input.samples.reduce((min, sample) => (sample.observedAt < min ? sample.observedAt : min), input.samples[0]!.observedAt)
  const windowEnd = input.samples.reduce((max, sample) => (sample.observedAt > max ? sample.observedAt : max), input.samples[0]!.observedAt)
  const windowRows = (await sql.query(WINDOW_SLEEP_VITALS_SQL, [input.coveredMetricKeys, windowStart, windowEnd])) as Array<{
    id: string
    metric_key: string
    fingerprint: string
    transport_source_id: string | null
  }>
  const ids = windowRows.map((row) => row.id)
  const ownershipRows = ids.length
    ? ((await sql.query(VITAL_LINK_OWNERSHIP_SQL, [ids, SLEEP_VITAL_ENTITY])) as Array<{ id: string; hae_owned: boolean }>)
    : []
  const ownership = new Map(ownershipRows.map((row) => [row.id, row.hae_owned]))
  const existing: VitalReconcileExisting[] = windowRows.map((row) => ({
    id: row.id,
    fingerprint: row.fingerprint,
    metricKey: row.metric_key,
    haeOwned: Boolean(ownership.get(row.id)) || row.transport_source_id === input.sourceId,
    inWindow: true,
  }))
  const plan = planSleepVitalReconciliation({
    incomingFingerprints: input.samples.map((sample) => sample.fingerprint),
    existing,
    coveredMetricKeys: input.coveredMetricKeys,
  })
  if (plan.removeIds.length > 0) {
    await sql.transaction([
      sql.query(DELETE_SLEEP_VITAL_LINKS_SQL, [plan.removeIds, SLEEP_VITAL_ENTITY]),
      sql.query(DELETE_HAE_SLEEP_VITALS_SQL, [plan.removeIds, input.sourceId, input.coveredMetricKeys]),
    ])
  }
  const byFingerprint = new Map(input.samples.map((sample) => [sample.fingerprint, sample]))
  let inserted = 0
  for (const fingerprint of plan.insertFingerprints) {
    const sample = byFingerprint.get(fingerprint)
    if (!sample) {
      continue
    }
    const entityId = randomUUID()
    const metadata = {
      transport: 'health_auto_export',
      logicalSourceKey: sample.sourceFamilyKey,
    }
    const rows = (await sql.query(INSERT_SLEEP_VITAL_SQL, [
      randomUUID(),
      input.sourceId,
      input.jobId,
      sample.fingerprint,
      SLEEP_VITAL_ENTITY,
      entityId,
      JSON.stringify({ transport: 'health_auto_export', logicalSourceKey: sample.sourceFamilyKey }),
      sample.metricKey,
      sample.value,
      sample.unit,
      sample.observedAt,
      sample.startAt,
      sample.endAt,
      sample.sourceFamily,
      JSON.stringify(metadata),
    ])) as Array<{ id?: string }>
    if (rows.length > 0) {
      inserted += 1
    }
  }
  return {
    samplesSeen: input.samples.length,
    samplesInserted: inserted,
    samplesMatched: plan.matchedIds.length,
    samplesRemoved: plan.removeIds.length,
  }
}

export async function ingestHealthAutoExportVitals(input: { payload: unknown }): Promise<HaeVitalIngestResult | null> {
  const parsed = parseHealthAutoExportVitals(input.payload)
  if (parsed.samples.length === 0) {
    return null
  }
  const sourceId = await haeSourceId()
  const sql = await getSql()
  const jobId = randomUUID()
  try {
    await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
      jobId,
      sourceId,
      'health-auto-export-sleep-vitals.json',
      'health_auto_export.v2+sleep-vitals',
      parsed.samples.length,
      parsed.aggregatedIgnored,
      JSON.stringify({
        strategy: HAE_VITAL_STRATEGY,
        source: 'health_auto_export',
        coveredMetricKeys: parsed.coveredMetricKeys,
        reconciliation: 'exclusive_hae_owned_window',
      }),
    ])
    const result = await persistVitals({
      sourceId,
      jobId,
      samples: parsed.samples,
      coveredMetricKeys: parsed.coveredMetricKeys,
    })
    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      result.samplesInserted,
      result.samplesMatched,
      parsed.aggregatedIgnored,
      parsed.samples.length,
      0,
      JSON.stringify({
        strategy: HAE_VITAL_STRATEGY,
        coveredMetricKeys: parsed.coveredMetricKeys,
        samplesRemoved: result.samplesRemoved,
        reconciliation: 'exclusive_hae_owned_window',
      }),
    ])
    return {
      ...result,
      coveredMetricKeys: parsed.coveredMetricKeys,
      reconciliation: 'exclusive_hae_owned_window',
    }
  } catch (error) {
    await sql
      .query(UPDATE_APPLE_HEALTH_JOB_SQL, [jobId, 'failed', 0, 0, parsed.aggregatedIgnored, parsed.samples.length, 1, null])
      .catch(() => undefined)
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Health Auto Export tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Health Auto Export sleep vital sync could not be completed')
  }
}
