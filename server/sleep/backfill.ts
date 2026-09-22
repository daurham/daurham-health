import { diffSleepNights, SleepMaterializationError } from '../../src/domain/apple-health/hae-sleep.js'
import {
  arbitrateSleepNights,
  classifySleepIntervals,
  sleepNightSemanticPayload,
  sleepNightlySummariesFromDecisions,
  sleepNightCandidates,
  stableSleepNightPayload,
  type SleepNightlySummary,
} from '../../src/domain/sleep/index.js'
import { APPLE_HEALTH_SOURCE_SQL } from '../apple-health/queries.js'
import { getSql } from '../db.js'
import {
  DELETE_SLEEP_NIGHTS_SQL,
  listSleepIntervals,
  listSleepNightlySummaries,
  upsertSleepNightlySummaries,
} from './queries.js'

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

export async function syncSleepNightlySummaries(provenanceSourceId: string | null): Promise<{
  nightsInserted: number
  nightsUpdated: number
  nightsUnchanged: number
  analysisEligible: number
  partialObservations: number
  inBedOnly: number
}> {
  const [intervals, stored] = await Promise.all([listSleepIntervals(), listSleepNightlySummaries()])
  const derived = sleepNightlySummariesFromDecisions(arbitrateSleepNights(sleepNightCandidates(classifySleepIntervals(intervals))))
  if (intervals.length > 0 && derived.length === 0) {
    throw new SleepMaterializationError('Sleep nightly materialization produced no nights')
  }
  const diff = diffSleepNights(
    stored.map((night) => ({ sleepDate: night.sleepDate, payload: stableSleepNightPayload(night) })),
    derived.map((night) => ({ sleepDate: night.sleepDate, payload: stableSleepNightPayload(night) })),
  )
  const changed = new Set(diff.changedDates)
  if (changed.size > 0) {
    await upsertSleepNightlySummaries(
      derived.filter((night) => changed.has(night.sleepDate)),
      provenanceSourceId,
    )
  }
  if (diff.removedDates.length > 0) {
    const sql = await getSql()
    await sql.query(DELETE_SLEEP_NIGHTS_SQL, [derived[0]?.timezone ?? stored[0]?.timezone ?? 'America/Phoenix', diff.removedDates])
  }
  return {
    nightsInserted: diff.nightsInserted,
    nightsUpdated: diff.nightsUpdated,
    nightsUnchanged: diff.nightsUnchanged,
    analysisEligible: derived.filter((night) => night.analysisEligible).length,
    partialObservations: derived.filter((night) => night.observationStatus === 'partial_observation').length,
    inBedOnly: derived.filter((night) => night.observationStatus === 'in_bed_only').length,
  }
}
