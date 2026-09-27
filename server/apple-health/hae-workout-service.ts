import { randomUUID } from 'node:crypto'
import {
  HAE_WORKOUT_CALCULATION_VERSION,
  HAE_WORKOUT_STRATEGY,
  sameActivityInstant,
  semanticActivityIdentity,
  type HaeWorkout,
  type HaeWorkoutParseResult,
} from '../../src/domain/apple-health/hae-workouts.js'
import { HAE_SOURCE_VERSION } from '../../src/domain/apple-health/hae.js'
import { formatDatabaseError, getSql } from '../db.js'
import { HttpError } from '../http.js'
import { INSERT_APPLE_HEALTH_JOB_SQL, UPDATE_APPLE_HEALTH_JOB_SQL } from './queries.js'
import { HAE_SOURCE_SQL } from './hae-sql.js'
import { LATEST_HAE_STRATEGY_SQL } from './hae-sleep-sql.js'
import {
  HAE_WORKOUT_ENTITY,
  HAE_WORKOUT_LOCK_SQL,
  HAE_WORKOUT_PERSIST_SQL,
  LATEST_HAE_WORKOUT_AT_SQL,
} from './hae-workout-sql.js'

export type HaeWorkoutIngestCounts = {
  workoutsSeen: number
  workoutsInserted: number
  workoutsMatchedHae: number
  workoutsMatchedExisting: number
  workoutsAmbiguous: number
  workoutsConflict: number
  workoutsIgnored: number
}

export type HaeWorkoutIngestResult = HaeWorkoutIngestCounts & {
  accepted: true
  jobId: string
}

export type HaeWorkoutSyncChannel = {
  importedAt: string
  status: string
  latestWorkoutAt: string | null
}

type PersistOutcome = 'hae' | 'ambiguous' | 'inserted' | 'existing'

type PersistRow = {
  outcome: PersistOutcome
  entity_id: string | null
  existing_start: string | Date | null
  existing_end: string | Date | null
  existing_type: string | null
}

function asIso(value: string | Date | null): string | null {
  if (value == null) {
    return null
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function emptyCounts(seen: number): HaeWorkoutIngestCounts {
  return {
    workoutsSeen: seen,
    workoutsInserted: 0,
    workoutsMatchedHae: 0,
    workoutsMatchedExisting: 0,
    workoutsAmbiguous: 0,
    workoutsConflict: 0,
    workoutsIgnored: 0,
  }
}

export function classifyPersistedWorkout(workout: HaeWorkout, row: PersistRow | undefined): keyof HaeWorkoutIngestCounts | null {
  if (!row) {
    return 'workoutsConflict'
  }
  if (row.outcome === 'inserted') {
    return 'workoutsInserted'
  }
  if (row.outcome === 'existing') {
    return 'workoutsMatchedExisting'
  }
  if (row.outcome === 'ambiguous') {
    return 'workoutsAmbiguous'
  }
  const start = asIso(row.existing_start)
  const end = asIso(row.existing_end)
  if (start == null || end == null || row.existing_type == null) {
    return 'workoutsConflict'
  }
  const sameCore =
    sameActivityInstant(workout.startAt, start) &&
    sameActivityInstant(workout.endAt, end) &&
    workout.semanticActivity === semanticActivityIdentity(row.existing_type)
  return sameCore ? 'workoutsMatchedHae' : 'workoutsConflict'
}

function applyCount(counts: HaeWorkoutIngestCounts, key: keyof HaeWorkoutIngestCounts | null) {
  if (key == null || key === 'workoutsSeen' || key === 'workoutsIgnored') {
    return
  }
  counts[key] += 1
  if (key === 'workoutsConflict') {
    counts.workoutsIgnored += 1
  }
}

function semanticLockKey(workout: HaeWorkout): string {
  return `${workout.startAt}|${workout.endAt}|${workout.semanticActivity}`
}

function persistParams(input: { sourceId: string; jobId: string; workout: HaeWorkout }): unknown[] {
  const workout = input.workout
  return [
    input.sourceId,
    workout.fingerprint,
    HAE_WORKOUT_ENTITY,
    workout.startAt,
    workout.endAt,
    workout.semanticActivity,
    randomUUID(),
    input.jobId,
    workout.providerId,
    JSON.stringify(workout.evidence),
    randomUUID(),
    randomUUID(),
    workout.activityType,
    workout.durationMinutes,
    workout.energyKcal,
    workout.distanceM,
    JSON.stringify(workout.metadata),
  ]
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

export async function latestHaeWorkoutStatus(sourceId: string): Promise<HaeWorkoutSyncChannel | null> {
  const sql = await getSql()
  const jobs = (await sql.query(LATEST_HAE_STRATEGY_SQL, [sourceId, HAE_WORKOUT_STRATEGY])) as Array<{
    imported_at: string | Date
    status: string
  }>
  const job = jobs[0]
  if (!job) {
    return null
  }
  const latest = (await sql.query(LATEST_HAE_WORKOUT_AT_SQL, [sourceId, HAE_WORKOUT_ENTITY])) as Array<{
    latest_workout_at: string | Date | null
  }>
  const latestWorkoutAt = latest[0]?.latest_workout_at
  return {
    importedAt: new Date(job.imported_at).toISOString(),
    status: job.status,
    latestWorkoutAt: latestWorkoutAt == null ? null : new Date(latestWorkoutAt).toISOString(),
  }
}

export async function ingestHealthAutoExportWorkouts(parsed: HaeWorkoutParseResult): Promise<HaeWorkoutIngestResult> {
  const sourceId = await haeSourceId()
  const sql = await getSql()
  const jobId = randomUUID()
  const workouts = [...parsed.workouts].sort((left, right) => left.fingerprint.localeCompare(right.fingerprint))
  const counts = emptyCounts(workouts.length)
  try {
    await sql.query(INSERT_APPLE_HEALTH_JOB_SQL, [
      jobId,
      sourceId,
      'health-auto-export-workouts.json',
      `health_auto_export.${HAE_SOURCE_VERSION}+${HAE_WORKOUT_CALCULATION_VERSION}`,
      workouts.length,
      0,
      JSON.stringify({
        strategy: HAE_WORKOUT_STRATEGY,
        source: 'health_auto_export',
        sourceVersion: HAE_SOURCE_VERSION,
        calculationVersion: HAE_WORKOUT_CALCULATION_VERSION,
        basis: 'workout_summary',
        transportIsObservingSource: false,
      }),
    ])
    if (workouts.length > 0) {
      const statements = workouts.flatMap((workout) => [
        sql.query(HAE_WORKOUT_LOCK_SQL, [workout.fingerprint, semanticLockKey(workout)]),
        sql.query(HAE_WORKOUT_PERSIST_SQL, persistParams({ sourceId, jobId, workout })),
      ])
      const results = (await sql.transaction(statements)) as unknown[][]
      workouts.forEach((workout, index) => {
        const rows = results[index * 2 + 1] as PersistRow[] | undefined
        applyCount(counts, classifyPersistedWorkout(workout, rows?.[0]))
      })
    }
    await sql.query(UPDATE_APPLE_HEALTH_JOB_SQL, [
      jobId,
      'completed',
      counts.workoutsInserted,
      counts.workoutsMatchedHae + counts.workoutsMatchedExisting,
      0,
      workouts.length,
      counts.workoutsAmbiguous + counts.workoutsConflict,
      JSON.stringify({
        strategy: HAE_WORKOUT_STRATEGY,
        source: 'health_auto_export',
        sourceVersion: HAE_SOURCE_VERSION,
        calculationVersion: HAE_WORKOUT_CALCULATION_VERSION,
        basis: 'workout_summary',
        transportIsObservingSource: false,
        ...counts,
      }),
    ])
    return { accepted: true, jobId, ...counts }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    const message = formatDatabaseError(error)
    if (message.includes('does not exist')) {
      throw new HttpError(503, 'Health Auto Export tables are not available. Apply pending migrations.')
    }
    throw new HttpError(500, 'Health Auto Export workout sync could not be completed')
  }
}
