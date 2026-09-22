import { mapSleepStage } from './sleep.js'
import { HealthAutoExportError } from './hae.js'
import { logicalSleepSource } from '../sleep/sources.js'

const HAE_OFFSET = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}) ([+-])(\d{2})(\d{2})$/

export const HAE_SLEEP_METRIC = 'sleep_analysis'
export const HAE_SLEEP_TRANSPORT = 'health_auto_export'

export type HaeStoredSleepStage = 'in_bed' | 'asleep' | 'awake' | 'core' | 'deep' | 'rem'

export type HaeSleepSegment = {
  startAt: string
  endAt: string
  stage: HaeStoredSleepStage
  sourceCategory: string
  sourceName: string | null
  logicalSourceKey: string
  logicalSourceName: string
  semanticKey: string
}

export type HaeSleepParseResult = {
  metricPresent: boolean
  segments: HaeSleepSegment[]
  intervalsIgnored: number
  unsupportedStages: string[]
  sleepRequiresUnaggregated: boolean
  sourceMetadataPresent: boolean
  sourcesSeen: string[]
}

export type ExistingSleepObservation = {
  id: string
  semanticKey: string
  haeOwned: boolean
  xmlOwned: boolean
  inWindow: boolean
}

export type HaeSleepReconcilePlan = {
  insertKeys: string[]
  matchedIds: string[]
  removeIds: string[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value != null && !Array.isArray(value)
}

export function parseHaeInstant(value: string): string {
  const trimmed = value.trim()
  const offset = HAE_OFFSET.exec(trimmed)
  const iso = offset ? `${offset[1]}T${offset[2]}${offset[3]}${offset[4]}:${offset[5]}` : trimmed
  const instant = Date.parse(iso)
  if (!Number.isFinite(instant)) {
    throw new HealthAutoExportError('Health Auto Export sleep timestamp is invalid')
  }
  return new Date(instant).toISOString()
}

export function mapHaeSleepValue(value: string): HaeStoredSleepStage | null {
  const token = value.trim().toLowerCase().replace(/[\s-]+/g, '_')
  if (token === 'unspecified' || token === 'asleep_unspecified') {
    return null
  }
  if (token === 'awake' || token === 'asleep' || token === 'in_bed' || token === 'core' || token === 'deep' || token === 'rem') {
    return token
  }
  const mapped = mapSleepStage(value.trim())
  if (!mapped.known || mapped.stage === 'unsupported') {
    return null
  }
  return mapped.stage
}

export function sleepSemanticKey(input: {
  logicalSourceKey: string
  stage: string
  startAt: string
  endAt: string
}): string {
  const stage = input.stage === 'asleep_unspecified' ? 'asleep' : input.stage
  return ['sleep', input.logicalSourceKey, stage, parseHaeInstant(input.startAt), parseHaeInstant(input.endAt)].join('|')
}

function text(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed.slice(0, 180) : null
}

function pointIsAggregate(point: Record<string, unknown>): boolean {
  return text(point.startDate) == null && text(point.endDate) == null && text(point.start) == null && text(point.end) == null
}

export function parseHealthAutoExportSleep(payload: unknown): HaeSleepParseResult {
  if (!isRecord(payload) || !isRecord(payload.data) || !Array.isArray(payload.data.metrics)) {
    throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
  }
  const metric = payload.data.metrics.find((item) => isRecord(item) && item.name === HAE_SLEEP_METRIC)
  if (!metric || !isRecord(metric)) {
    return {
      metricPresent: false,
      segments: [],
      intervalsIgnored: 0,
      unsupportedStages: [],
      sleepRequiresUnaggregated: false,
      sourceMetadataPresent: false,
      sourcesSeen: [],
    }
  }
  if (!Array.isArray(metric.data)) {
    throw new HealthAutoExportError('Health Auto Export sleep_analysis data is invalid')
  }
  const segments: HaeSleepSegment[] = []
  const unsupported = new Set<string>()
  let ignored = 0
  let aggregated = 0
  let sourceMetadataPresent = false
  const seen = new Set<string>()
  for (const point of metric.data) {
    if (!isRecord(point)) {
      ignored += 1
      continue
    }
    const sourceName = text(point.source)
    if (sourceName) {
      sourceMetadataPresent = true
    }
    if (pointIsAggregate(point)) {
      aggregated += 1
      ignored += 1
      continue
    }
    const rawValue = text(point.value) ?? text(point.sleepState) ?? text(point.state)
    if (!rawValue) {
      ignored += 1
      continue
    }
    const stage = mapHaeSleepValue(rawValue)
    if (!stage) {
      unsupported.add(rawValue)
      ignored += 1
      continue
    }
    const startRaw = text(point.startDate) ?? text(point.start)
    const endRaw = text(point.endDate) ?? text(point.end)
    if (!startRaw || !endRaw) {
      aggregated += 1
      ignored += 1
      continue
    }
    const startAt = parseHaeInstant(startRaw)
    const endAt = parseHaeInstant(endRaw)
    if (Date.parse(endAt) < Date.parse(startAt)) {
      ignored += 1
      continue
    }
    const logical = logicalSleepSource(sourceName)
    const semanticKey = sleepSemanticKey({ logicalSourceKey: logical.key, stage, startAt, endAt })
    if (seen.has(semanticKey)) {
      ignored += 1
      continue
    }
    seen.add(semanticKey)
    segments.push({
      startAt,
      endAt,
      stage,
      sourceCategory: rawValue,
      sourceName,
      logicalSourceKey: logical.key,
      logicalSourceName: logical.name,
      semanticKey,
    })
  }
  return {
    metricPresent: true,
    segments,
    intervalsIgnored: ignored,
    unsupportedStages: [...unsupported].sort(),
    sleepRequiresUnaggregated: aggregated > 0,
    sourceMetadataPresent,
    sourcesSeen: [...new Set(segments.map((segment) => segment.logicalSourceName))].sort(),
  }
}

export function planHaeSleepReconciliation(
  incoming: readonly HaeSleepSegment[],
  existing: readonly ExistingSleepObservation[],
): HaeSleepReconcilePlan {
  const incomingKeys = new Set(incoming.map((segment) => segment.semanticKey))
  const matchedIds: string[] = []
  const matchedKeys = new Set<string>()
  for (const row of existing) {
    if (!incomingKeys.has(row.semanticKey) || matchedKeys.has(row.semanticKey)) {
      continue
    }
    matchedKeys.add(row.semanticKey)
    matchedIds.push(row.id)
  }
  const insertKeys = [...incomingKeys].filter((key) => !matchedKeys.has(key)).sort()
  const removeIds = existing
    .filter((row) => row.inWindow && row.haeOwned && !row.xmlOwned && !incomingKeys.has(row.semanticKey))
    .map((row) => row.id)
  return { insertKeys, matchedIds, removeIds }
}

export type SleepNightDiff = {
  nightsInserted: number
  nightsUpdated: number
  nightsUnchanged: number
  changedDates: string[]
  removedDates: string[]
}

export function diffSleepNights(
  previous: ReadonlyArray<{ sleepDate: string; payload: string }>,
  next: ReadonlyArray<{ sleepDate: string; payload: string }>,
): SleepNightDiff {
  const prior = new Map(previous.map((item) => [item.sleepDate, item.payload]))
  const nextDates = new Set(next.map((item) => item.sleepDate))
  let nightsInserted = 0
  let nightsUpdated = 0
  let nightsUnchanged = 0
  const changedDates: string[] = []
  for (const item of next) {
    const existing = prior.get(item.sleepDate)
    if (existing == null) {
      nightsInserted += 1
      changedDates.push(item.sleepDate)
    } else if (existing !== item.payload) {
      nightsUpdated += 1
      changedDates.push(item.sleepDate)
    } else {
      nightsUnchanged += 1
    }
  }
  const removedDates = [...prior.keys()].filter((date) => !nextDates.has(date)).sort()
  return { nightsInserted, nightsUpdated, nightsUnchanged, changedDates, removedDates }
}

export class SleepMaterializationError extends Error {
  constructor(message = 'Sleep nightly materialization failed') {
    super(message)
    this.name = 'SleepMaterializationError'
  }
}

export async function commitSleepIngest<TRaw extends Record<string, unknown>, TNights extends Record<string, unknown>>(input: {
  persist: () => Promise<TRaw>
  materialize: () => Promise<TNights>
}): Promise<TRaw & TNights> {
  const raw = await input.persist()
  try {
    const nights = await input.materialize()
    return { ...raw, ...nights }
  } catch (error) {
    if (error instanceof SleepMaterializationError) {
      throw error
    }
    throw new SleepMaterializationError(error instanceof Error ? error.message : 'Sleep nightly materialization failed')
  }
}
