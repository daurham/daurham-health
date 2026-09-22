import {
  arbitrateSleepNights,
  classifySleepIntervals,
  sleepNightSemanticPayload,
  sleepNightlySummariesFromDecisions,
  sleepNightCandidates,
  type SleepNightlySummary,
} from '../../src/domain/sleep/index.js'
import { APPLE_HEALTH_SOURCE_SQL } from '../apple-health/queries.js'
import { getSql } from '../db.js'
import { listSleepIntervals, listSleepNightlySummaries, upsertSleepNightlySummaries } from './queries.js'

export async function resolveAppleHealthSourceId(): Promise<string | null> {
  const sql = await getSql()
  const rows = (await sql.query(APPLE_HEALTH_SOURCE_SQL)) as Array<{ id: string }>
  return rows[0]?.id ?? null
}

export async function materializeSleepNightlySummaries(): Promise<SleepNightlySummary[]> {
  const intervals = await listSleepIntervals()
  const candidates = sleepNightCandidates(classifySleepIntervals(intervals))
  return sleepNightlySummariesFromDecisions(arbitrateSleepNights(candidates))
}

export function nightlySemanticFingerprint(nights: readonly SleepNightlySummary[]): string {
  return JSON.stringify(nights.map(sleepNightSemanticPayload))
}

export async function backfillSleepNightlySummaries(): Promise<{
  nights: SleepNightlySummary[]
  written: number
  sourceId: string | null
}> {
  const [nights, sourceId] = await Promise.all([materializeSleepNightlySummaries(), resolveAppleHealthSourceId()])
  const written = await upsertSleepNightlySummaries(nights, sourceId)
  return { nights, written, sourceId }
}

export async function storedSleepNightlyFingerprint(): Promise<string> {
  return nightlySemanticFingerprint(await listSleepNightlySummaries())
}
