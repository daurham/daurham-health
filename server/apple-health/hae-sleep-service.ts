import { randomUUID } from 'node:crypto'
import { SLEEP_INTERVAL_ENTITY } from '../../src/domain/apple-health/config.js'
import {
  commitSleepIngest,
  parseHealthAutoExportSleep,
  planHaeSleepReconciliation,
  sleepSemanticKey,
  type ExistingSleepObservation,
  type HaeSleepParseResult,
  type HaeSleepSegment,
} from '../../src/domain/apple-health/hae-sleep.js'
import { logicalSleepSource } from '../../src/domain/sleep/sources.js'
import { HEALTH_CALENDAR_TIME_ZONE } from '../../src/domain/time.js'
import { resolveAppleHealthSourceId, syncSleepNightlySummaries } from '../sleep/backfill.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { INSERT_APPLE_HEALTH_JOB_SQL, UPDATE_APPLE_HEALTH_JOB_SQL } from './queries.js'
import { HAE_SOURCE_SQL } from './hae-sql.js'
import {
  DELETE_HAE_SLEEP_INTERVALS_SQL,
  DELETE_SLEEP_LINKS_SQL,
  HAE_SLEEP_STRATEGY,
  LATEST_HAE_STRATEGY_SQL,
  LATEST_SLEEP_NIGHT_SQL,
  INSERT_HAE_SLEEP_INTERVAL_SQL,
  LINK_EXISTING_SLEEP_SQL,
  MATCH_SLEEP_INTERVALS_SQL,
  SLEEP_LINK_OWNERSHIP_SQL,
  WINDOW_SLEEP_INTERVALS_SQL,
} from './hae-sleep-sql.js'

export type HaeSleepIngestResult = {
  intervalsSeen: number
  intervalsInserted: number
  intervalsMatchedExisting: number
  intervalsUpdated: number
  intervalsRemoved: number
  intervalsIgnored: number
  sourcesSeen: string[]
  sourceMetadataPresent: boolean
  sleepRequiresUnaggregated: boolean
  unsupportedStages: string[]
  reconciliation: 'exclusive_hae_owned_window'
  nightsInserted: number
  nightsUpdated: number
  nightsUnchanged: number
  analysisEligible: number
  partialObservations: number
  inBedOnly: number
}

type IntervalIdentity = {
  id: string
  startAt: string
  endAt: string
  stage: string
  sourceName: string | null
  sourceKey: string
}

function asIso(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString()
  }
  return new Date(String(value)).toISOString()
}

function identityFrom(row: Record<string, unknown>): IntervalIdentity {
  return {
    id: String(row.id),
    startAt: asIso(row.start_at),
    endAt: asIso(row.end_at),
    stage: String(row.stage),
    sourceName: typeof row.source_name === 'string' ? row.source_name : null,
    sourceKey: String(row.source_key),
  }
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

function emptySleepResult(parsed: HaeSleepParseResult): HaeSleepIngestResult {
  return {
    intervalsSeen: parsed.segments.length,
    intervalsInserted: 0,
    intervalsMatchedExisting: 0,
    intervalsUpdated: 0,
    intervalsRemoved: 0,
    intervalsIgnored: parsed.intervalsIgnored,
    sourcesSeen: parsed.sourcesSeen,
    sourceMetadataPresent: parsed.sourceMetadataPresent,
    sleepRequiresUnaggregated: parsed.sleepRequiresUnaggregated,
    unsupportedStages: parsed.unsupportedStages,
    reconciliation: 'exclusive_hae_owned_window',
    nightsInserted: 0,
    nightsUpdated: 0,
    nightsUnchanged: 0,
    analysisEligible: 0,
    partialObservations: 0,
    inBedOnly: 0,
  }
}

async function persistSleepSegments(input: {
  sourceId: string
  jobId: string
  segments: readonly HaeSleepSegment[]
}): Promise<Pick<
  HaeSleepIngestResult,
  'intervalsSeen' | 'intervalsInserted' | 'intervalsMatchedExisting' | 'intervalsUpdated' | 'intervalsRemoved'
>> {
  const sql = await getSql()
  const starts = input.segments.map((segment) => segment.startAt)
  const ends = input.segments.map((segment) => segment.endAt)
  const windowStart = input.segments.reduce((min, segment) => (segment.startAt < min ? segment.startAt : min), input.segments[0]!.startAt)
  const windowEnd = input.segments.reduce((max, segment) => (segment.endAt > max ? segment.endAt : max), input.segments[0]!.endAt)
  const matchedRows = (await sql.query(MATCH_SLEEP_INTERVALS_SQL, [starts, ends])) as Array<Record<string, unknown>>
  const windowRows = (await sql.query(WINDOW_SLEEP_INTERVALS_SQL, [windowStart, windowEnd])) as Array<Record<string, unknown>>
  const byId = new Map<string, IntervalIdentity>()
  for (const row of [...matchedRows, ...windowRows]) {
    const identity = identityFrom(row)
    byId.set(identity.id, identity)
  }
  const ids = [...byId.keys()]
  const ownershipRows = ids.length
    ? ((await sql.query(SLEEP_LINK_OWNERSHIP_SQL, [ids, SLEEP_INTERVAL_ENTITY])) as Array<{
        id: string
        hae_owned: boolean
        xml_owned: boolean
      }>)
    : []
  const ownership = new Map(ownershipRows.map((row) => [row.id, row]))
  const windowIds = new Set(windowRows.map((row) => String(row.id)))
  const existing: ExistingSleepObservation[] = [...byId.values()].map((row) => {
    const owner = ownership.get(row.id)
    const logical = logicalSleepSource(row.sourceName)
    return {
      id: row.id,
      semanticKey: sleepSemanticKey({
        logicalSourceKey: logical.key,
        stage: row.stage,
        startAt: row.startAt,
        endAt: row.endAt,
      }),
      haeOwned: Boolean(owner?.hae_owned) || row.sourceKey === 'health_auto_export',
      xmlOwned: Boolean(owner?.xml_owned) || row.sourceKey === 'apple_health',
      inWindow: windowIds.has(row.id),
    }
  })
  const plan = planHaeSleepReconciliation(input.segments, existing)
  const segmentsByKey = new Map(input.segments.map((segment) => [segment.semanticKey, segment]))
  if (plan.removeIds.length > 0) {
    await sql.transaction([
      sql.query(DELETE_SLEEP_LINKS_SQL, [plan.removeIds, SLEEP_INTERVAL_ENTITY]),
      sql.query(DELETE_HAE_SLEEP_INTERVALS_SQL, [plan.removeIds, input.sourceId]),
    ])
  }
  let inserted = 0
  for (const key of plan.insertKeys) {
    const segment = segmentsByKey.get(key)
    if (!segment) {
      continue
    }
    const entityId = randomUUID()
    const metadata = {
      transport: 'health_auto_export',
      logicalSourceKey: segment.logicalSourceKey,
      logicalSourceName: segment.logicalSourceName,
      semanticKey: segment.semanticKey,
    }
    const rows = (await sql.query(INSERT_HAE_SLEEP_INTERVAL_SQL, [
      randomUUID(),
      input.sourceId,
      input.jobId,
      segment.semanticKey,
      SLEEP_INTERVAL_ENTITY,
      entityId,
      JSON.stringify({ transport: 'health_auto_export', logicalSourceKey: segment.logicalSourceKey }),
      segment.startAt,
      segment.endAt,
      segment.stage,
      segment.sourceCategory,
      segment.sourceName,
      null,
      null,
      JSON.stringify(metadata),
    ])) as Array<{ entity_id?: string }>
    if (rows.length > 0) {
      inserted += 1
    }
  }
  for (const id of plan.matchedIds) {
    const row = existing.find((item) => item.id === id)
    const segment = row ? segmentsByKey.get(row.semanticKey) : undefined
    if (!row || !segment) {
      continue
    }
    await sql.query(LINK_EXISTING_SLEEP_SQL, [
      randomUUID(),
      input.sourceId,
      input.jobId,
      segment.semanticKey,
      SLEEP_INTERVAL_ENTITY,
      row.id,
      JSON.stringify({ transport: 'health_auto_export', logicalSourceKey: segment.logicalSourceKey, matchedExisting: true }),
    ])
  }
  return {
    intervalsSeen: input.segments.length,
    intervalsInserted: inserted,
    intervalsMatchedExisting: plan.matchedIds.length,
    intervalsUpdated: 0,
    intervalsRemoved: plan.removeIds.length,
  }
}

export async function ingestHealthAutoExportSleep(input: { payload: unknown }): Promise<HaeSleepIngestResult> {
  const parsed = parseHealthAutoExportSleep(input.payload)
  if (!parsed.metricPresent) {
    return emptySleepResult(parsed)
  }
  if (parsed.segments.length === 0) {
    return emptySleepResult(parsed)
  }
  const sourceId = await haeSourceId()
  const sql = await getSql()
  const jobId = randomUUID()
  try {
    await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
      jobId,
      sourceId,
      'health-auto-export-sleep.json',
      'health_auto_export.v2+sleep',
      parsed.segments.length,
      parsed.intervalsIgnored,
      JSON.stringify({
        strategy: HAE_SLEEP_STRATEGY,
        source: 'health_auto_export',
        sourceMetadataPresent: parsed.sourceMetadataPresent,
        sourcesSeen: parsed.sourcesSeen,
        sleepRequiresUnaggregated: parsed.sleepRequiresUnaggregated,
        unsupportedStages: parsed.unsupportedStages,
        reconciliation: 'exclusive_hae_owned_window',
      }),
    ])
    const result = await commitSleepIngest({
      persist: () => persistSleepSegments({ sourceId, jobId, segments: parsed.segments }),
      materialize: async () => syncSleepNightlySummaries(await resolveAppleHealthSourceId()),
    })
    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      result.intervalsInserted,
      result.intervalsMatchedExisting,
      parsed.intervalsIgnored,
      parsed.segments.length,
      0,
      JSON.stringify({
        strategy: HAE_SLEEP_STRATEGY,
        source: 'health_auto_export',
        sourceMetadataPresent: parsed.sourceMetadataPresent,
        sourcesSeen: parsed.sourcesSeen,
        intervalsRemoved: result.intervalsRemoved,
        nightsInserted: result.nightsInserted,
        nightsUpdated: result.nightsUpdated,
        nightsUnchanged: result.nightsUnchanged,
        reconciliation: 'exclusive_hae_owned_window',
      }),
    ])
    return {
      ...emptySleepResult(parsed),
      ...result,
      intervalsIgnored: parsed.intervalsIgnored,
      sourcesSeen: parsed.sourcesSeen,
      sourceMetadataPresent: parsed.sourceMetadataPresent,
      sleepRequiresUnaggregated: parsed.sleepRequiresUnaggregated,
      unsupportedStages: parsed.unsupportedStages,
    }
  } catch (error) {
    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [jobId, 'failed', 0, 0, parsed.intervalsIgnored, parsed.segments.length, 1, null]).catch(() => undefined)
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Health Auto Export tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Health Auto Export sleep sync could not be completed')
  }
}

export async function latestHaeSleepStatus(): Promise<{ importedAt: string; status: string; latestNight: string | null } | null> {
  const sql = await getSql()
  const sourceRows = (await sql.query(HAE_SOURCE_SQL)) as Array<{ id: string }>
  const sourceId = sourceRows[0]?.id
  if (!sourceId) {
    return null
  }
  const jobs = (await sql.query(LATEST_HAE_STRATEGY_SQL, [sourceId, HAE_SLEEP_STRATEGY])) as Array<{
    imported_at: string | Date
    status: string
  }>
  const job = jobs[0]
  if (!job) {
    return null
  }
  const nights = (await sql.query(LATEST_SLEEP_NIGHT_SQL, [HEALTH_CALENDAR_TIME_ZONE])) as Array<{
    latest_night: string | null
  }>
  return {
    importedAt: new Date(job.imported_at).toISOString(),
    status: job.status,
    latestNight: nights[0]?.latest_night ?? null,
  }
}
