import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BACKUP_TABLES, LATEST_SCHEMA_MIGRATION } from '../server/backup/inventory.ts'
import { buildBackupArchive, planRestore, restoreStatements, verifyBackupArchive } from '../server/backup/format.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'
import { HAE_WORKOUT_LOCK_SQL, HAE_WORKOUT_PERSIST_SQL } from '../server/apple-health/hae-workout-sql.ts'
import { classifyPersistedWorkout } from '../server/apple-health/hae-workout-service.ts'
import appleHealthSyncHandler, { parseHealthAutoExportRequest } from '../server/handlers/apple-health-sync.ts'
import { ingestHealthAutoExport } from '../server/apple-health/hae-service.ts'
import { ingestHealthAutoExportSleep } from '../server/apple-health/hae-sleep-service.ts'
import { ingestHealthAutoExportVitals } from '../server/apple-health/hae-vitals-service.ts'
import { ingestHealthAutoExportWorkouts } from '../server/apple-health/hae-workout-service.ts'
import { demoToday } from '../src/demo/index.ts'
import {
  haeWorkoutFingerprint,
  parseHealthAutoExportWorkouts,
  planHaeWorkouts,
  semanticActivityIdentity,
  type HaeWorkout,
  type StoredActivityWorkout,
} from '../src/domain/apple-health/hae-workouts.ts'
import { buildProgressTimeline, timelineEventsForFocus } from '../src/domain/progress/timeline.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { appleHealthStatusSchema } from '../src/features/settings/api.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

vi.mock('../server/apple-health/hae-service.ts', () => ({
  ingestHealthAutoExport: vi.fn(),
}))

vi.mock('../server/apple-health/hae-sleep-service.ts', () => ({
  ingestHealthAutoExportSleep: vi.fn(),
}))

vi.mock('../server/apple-health/hae-vitals-service.ts', () => ({
  ingestHealthAutoExportVitals: vi.fn(),
}))

vi.mock('../server/apple-health/hae-workout-service.ts', async () => {
  const actual = await vi.importActual<typeof import('../server/apple-health/hae-workout-service.ts')>(
    '../server/apple-health/hae-workout-service.ts',
  )
  return {
    ...actual,
    ingestHealthAutoExportWorkouts: vi.fn(),
  }
})

const TOKEN = 'test-sync-token-value'
const START = '2024-02-06 07:00:00 -0800'
const END = '2024-02-06 08:13:00 -0800'

function workout(extra: Record<string, unknown> = {}, id = 'workout-alpha') {
  return {
    id,
    name: 'Running',
    start: START,
    end: END,
    duration: 4380,
    ...extra,
  }
}

function payload(workouts: unknown, metrics?: unknown) {
  const data: Record<string, unknown> = {}
  if (metrics !== undefined) {
    data.metrics = metrics
  }
  if (workouts !== undefined) {
    data.workouts = workouts
  }
  return { data }
}

function capture(method: string, headers: Record<string, string>, body?: unknown) {
  const socket = new Socket()
  const nodeRes = new ServerResponse(new IncomingMessage(socket))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payloadBody: unknown
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = (value: unknown) => {
    payloadBody = value
  }
  const req = {
    method,
    url: '/api?path=ingest/apple-health',
    query: { path: 'ingest/apple-health' },
    headers,
    body,
    async *[Symbol.asyncIterator]() {},
  } as ApiRequest
  return { req, res: res as ApiResponse, status: () => statusCode, body: () => payloadBody }
}

function parsedWorkout(extra: Record<string, unknown> = {}, id = 'workout-alpha'): HaeWorkout {
  return parseHealthAutoExportWorkouts(payload([workout(extra, id)])).workouts[0] as HaeWorkout
}

function stored(partial: Partial<StoredActivityWorkout> & Pick<StoredActivityWorkout, 'id'>): StoredActivityWorkout {
  return {
    activityType: 'HKWorkoutActivityTypeRunning',
    startAt: '2024-02-06T15:00:00.000Z',
    endAt: '2024-02-06T16:13:00.000Z',
    haeProviderId: null,
    ...partial,
  }
}

describe('Health Auto Export workout parser', () => {
  it('accepts a v2 workout and ignores telemetry without inventing a source', () => {
    const parsed = parseHealthAutoExportWorkouts(
      payload([
        workout({
          activeEnergyBurned: { qty: 418.4, units: 'kJ' },
          totalEnergy: { qty: 999, units: 'kcal' },
          distance: { qty: 3.1, units: 'mi' },
          location: 'Outdoor',
          isIndoor: false,
          route: [{ lat: 1, lon: 2 }],
          heartRateData: [{ qty: 140, source: 'Apple Watch' }],
          stepCount: [{ qty: 4000, source: 'Apple Watch' }],
        }),
      ]),
    )
    const row = parsed.workouts[0]
    expect(row?.activityType).toBe('Running')
    expect(row?.semanticActivity).toBe('running')
    expect(row?.durationMinutes).toBe(73)
    expect(row?.energyKcal).toBeCloseTo(100, 5)
    expect(row?.distanceM).toBeCloseTo(3.1 * 1609.344, 5)
    expect(row?.fingerprint).toBe('health_auto_export|workout|v2|workout-alpha')
    expect(row?.fingerprint).not.toContain('418.4')
    expect(row?.sourceName).toBeNull()
    expect(row?.sourceVersion).toBeNull()
    expect(row?.deviceName).toBeNull()
    expect(row?.metadata).toMatchObject({
      transport: 'health_auto_export',
      exportVersion: 'v2',
      calculationVersion: 'hae-workout-v1',
      location: 'Outdoor',
      isIndoor: false,
    })
    expect(JSON.stringify(row?.metadata)).not.toContain('Apple Watch')
    expect(JSON.stringify(row?.evidence)).not.toContain('route')
    expect(JSON.stringify(row?.evidence)).not.toContain('totalEnergy')
    expect(parsed.ignoredFieldCounts).toMatchObject({ route: 1, heartRateData: 1, stepCount: 1, totalEnergy: 1 })
  })

  it('keeps explicit zero and leaves missing energy and distance empty', () => {
    const zero = parsedWorkout({ activeEnergyBurned: { qty: 0, units: 'kcal' }, distance: { qty: 0, units: 'km' } })
    const missing = parsedWorkout()
    expect(zero.energyKcal).toBe(0)
    expect(zero.distanceM).toBe(0)
    expect(missing.energyKcal).toBeNull()
    expect(missing.distanceM).toBeNull()
  })

  it('rejects a legacy workout that has no stable id', () => {
    expect(() =>
      parseHealthAutoExportWorkouts(
        payload([
          {
            name: 'Running',
            start: START,
            end: END,
            duration: 1800,
            activeEnergy: { qty: 100, units: 'kcal' },
          },
        ]),
      ),
    ).toThrow(/id is required/)
  })

  it('rejects missing required fields, bad units, and an end before the start', () => {
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ name: '  ' })]))).toThrow(/name is required/)
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ duration: -1 })]))).toThrow(/duration is invalid/)
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ start: '2024-02-06' })]))).toThrow(/timestamp is invalid/)
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ end: '2024-02-06 06:00:00 -0800' })]))).toThrow(/end is before start/)
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ activeEnergyBurned: { qty: 1, units: 'stones' } })]))).toThrow(
      /energy is invalid/,
    )
    expect(() => parseHealthAutoExportWorkouts(payload([workout({ distance: { qty: -1, units: 'km' } })]))).toThrow(/distance is invalid/)
  })

  it('treats a missing workouts channel as absent and an empty array as valid', () => {
    expect(() => parseHealthAutoExportWorkouts(payload(undefined, []))).toThrow(/workouts must be an array/)
    const empty = parseHealthAutoExportWorkouts(payload([]))
    expect(empty.workouts).toEqual([])
  })
})

describe('Health Auto Export workout identity', () => {
  it('normalizes only formatting between HealthKit names and Health Auto Export names', () => {
    expect(semanticActivityIdentity('HKWorkoutActivityTypeRunning')).toBe('running')
    expect(semanticActivityIdentity('Running')).toBe('running')
    expect(semanticActivityIdentity('Running.')).toBe('running')
    expect(semanticActivityIdentity('HKWorkoutActivityTypeTraditionalStrengthTraining')).toBe('traditional strength training')
    expect(semanticActivityIdentity('Run')).not.toBe(semanticActivityIdentity('Running'))
  })

  it('matches one exact semantic workout and does not match overlap or a fuzzy name', () => {
    const incoming = parsedWorkout()
    const [linked] = planHaeWorkouts([incoming], [stored({ id: 'xml-1' })])
    expect(linked?.kind).toBe('link')
    const [overlap] = planHaeWorkouts(
      [incoming],
      [stored({ id: 'xml-2', endAt: '2024-02-06T16:00:00.000Z' })],
    )
    expect(overlap?.kind).toBe('insert')
    const [fuzzy] = planHaeWorkouts([parsedWorkout({}, 'other')], [stored({ id: 'xml-3', activityType: 'Run' })])
    expect(fuzzy?.kind).toBe('insert')
  })

  it('fails closed when more than one canonical workout has the same identity', () => {
    const [ambiguous] = planHaeWorkouts(
      [parsedWorkout()],
      [stored({ id: 'xml-1' }), stored({ id: 'xml-2' })],
    )
    expect(ambiguous?.kind).toBe('ambiguous')
  })

  it('keeps one provider id idempotent and does not rewrite a conflicting linked workout', () => {
    const first = parsedWorkout({ activeEnergyBurned: { qty: 10, units: 'kcal' } })
    const second = parsedWorkout({ activeEnergyBurned: { qty: 80, units: 'kcal' } })
    expect(haeWorkoutFingerprint(first.providerId)).toBe(haeWorkoutFingerprint(second.providerId))
    const inserted = planHaeWorkouts([first], [])
    expect(inserted[0]?.kind).toBe('insert')
    const again = planHaeWorkouts(
      [second],
      [
        {
          id: 'canonical-1',
          activityType: first.activityType,
          startAt: first.startAt,
          endAt: first.endAt,
          haeProviderId: first.providerId,
        },
      ],
    )
    expect(again[0]?.kind).toBe('already')
    const conflict = planHaeWorkouts(
      [parsedWorkout({ end: '2024-02-06 09:00:00 -0800', duration: 7200 })],
      [
        {
          id: 'canonical-1',
          activityType: first.activityType,
          startAt: first.startAt,
          endAt: first.endAt,
          haeProviderId: first.providerId,
        },
      ],
    )
    expect(conflict[0]?.kind).toBe('conflict')
  })

  it('does not delete a stored workout that a later payload omits', () => {
    const dispositions = planHaeWorkouts([], [stored({ id: 'kept', haeProviderId: 'old' })])
    expect(dispositions).toEqual([])
    expect(JSON.stringify(dispositions)).not.toContain('delete')
  })

  it('classifies persisted rows without treating optional differences as a new workout', () => {
    const workoutRow = parsedWorkout()
    expect(classifyPersistedWorkout(workoutRow, { outcome: 'inserted', entity_id: '1', existing_start: null, existing_end: null, existing_type: null })).toBe(
      'workoutsInserted',
    )
    expect(classifyPersistedWorkout(workoutRow, { outcome: 'existing', entity_id: '1', existing_start: null, existing_end: null, existing_type: null })).toBe(
      'workoutsMatchedExisting',
    )
    expect(classifyPersistedWorkout(workoutRow, { outcome: 'ambiguous', entity_id: null, existing_start: null, existing_end: null, existing_type: null })).toBe(
      'workoutsAmbiguous',
    )
    expect(
      classifyPersistedWorkout(workoutRow, {
        outcome: 'hae',
        entity_id: '1',
        existing_start: workoutRow.startAt,
        existing_end: workoutRow.endAt,
        existing_type: 'HKWorkoutActivityTypeRunning',
      }),
    ).toBe('workoutsMatchedHae')
    expect(
      classifyPersistedWorkout(workoutRow, {
        outcome: 'hae',
        entity_id: '1',
        existing_start: workoutRow.startAt,
        existing_end: '2024-02-06T18:00:00.000Z',
        existing_type: 'HKWorkoutActivityTypeRunning',
      }),
    ).toBe('workoutsConflict')
  })
})

describe('Health Auto Export workout persistence contract', () => {
  it('claims a provider fingerprint, links an existing row, and does not delete or rewrite history', () => {
    expect(HAE_WORKOUT_LOCK_SQL).toContain('pg_advisory_xact_lock')
    expect(HAE_WORKOUT_PERSIST_SQL).toContain('ON CONFLICT (source_id, external_fingerprint) DO NOTHING')
    expect(HAE_WORKOUT_PERSIST_SQL).toContain('INSERT INTO activity_workouts')
    expect(HAE_WORKOUT_PERSIST_SQL).toContain('INSERT INTO source_record_links')
    expect(HAE_WORKOUT_PERSIST_SQL).not.toContain('UPDATE activity_workouts')
    expect(HAE_WORKOUT_PERSIST_SQL).not.toContain('DELETE FROM activity_workouts')
    expect(HAE_WORKOUT_PERSIST_SQL).not.toContain('workout_sessions')
    expect(HAE_WORKOUT_PERSIST_SQL).toContain('NULL,\n         NULL,\n         NULL')
    const service = readFileSync('server/apple-health/hae-workout-service.ts', 'utf8')
    const domain = readFileSync('src/domain/apple-health/hae-workouts.ts', 'utf8')
    expect(domain).toContain("export const HAE_WORKOUT_STRATEGY = 'health_auto_export_workouts'")
    expect(service).toContain('HAE_WORKOUT_STRATEGY')
    expect(service).not.toContain('workout_sessions')
    expect(service).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(service.indexOf('INSERT_APPLE_HEALTH_JOB_SQL')).toBeLessThan(service.indexOf('if (workouts.length > 0)'))
  })
})

describe('Health Auto Export ingest channels', () => {
  beforeEach(() => {
    vi.mocked(ingestHealthAutoExport).mockReset()
    vi.mocked(ingestHealthAutoExportSleep).mockReset()
    vi.mocked(ingestHealthAutoExportVitals).mockReset()
    vi.mocked(ingestHealthAutoExportWorkouts).mockReset()
    vi.mocked(ingestHealthAutoExport).mockResolvedValue({
      accepted: true,
      daysSeen: 1,
      daysInserted: 1,
      daysUpdated: 0,
      metricsApplied: { step_count: 1, active_energy: 0, apple_exercise_time: 0, resting_heart_rate: 0 },
      ignoredMetrics: [],
      ignoredDistanceCount: 0,
      jobId: 'activity-job',
    })
    vi.mocked(ingestHealthAutoExportSleep).mockResolvedValue({
      metricPresent: true,
      intervalsSeen: 1,
      intervalsInserted: 1,
      intervalsMatched: 0,
      intervalsRemoved: 0,
      nightsUpdated: 1,
      changedDates: ['2024-02-06'],
      jobId: 'sleep-job',
    } as never)
    vi.mocked(ingestHealthAutoExportVitals).mockResolvedValue(null as never)
    vi.mocked(ingestHealthAutoExportWorkouts).mockResolvedValue({
      accepted: true,
      jobId: 'workout-job',
      workoutsSeen: 1,
      workoutsInserted: 1,
      workoutsMatchedHae: 0,
      workoutsMatchedExisting: 0,
      workoutsAmbiguous: 0,
      workoutsConflict: 0,
      workoutsIgnored: 0,
    })
  })

  it('parses workouts without requiring data.metrics and still parses metrics when that channel is present', () => {
    const onlyWorkouts = parseHealthAutoExportRequest(payload([workout()]))
    expect(onlyWorkouts.hasActivityMetrics).toBe(false)
    expect(onlyWorkouts.sleep).toBeNull()
    expect(onlyWorkouts.workouts?.workouts).toHaveLength(1)
    const metrics = [{ name: 'step_count', units: 'count', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 100 }] }]
    const both = parseHealthAutoExportRequest(payload([workout()], metrics))
    expect(both.hasActivityMetrics).toBe(true)
    expect(both.workouts?.workouts).toHaveLength(1)
    const sleep = parseHealthAutoExportRequest(
      payload([workout()], [{ name: 'sleep_analysis', units: 'count', data: [] }]),
    )
    expect(sleep.sleep?.metricPresent).toBe(true)
    expect(sleep.workouts?.workouts).toHaveLength(1)
    expect(() => parseHealthAutoExportRequest({ data: {} })).toThrow(/data\.metrics/)
    expect(() => parseHealthAutoExportRequest(payload('nope'))).toThrow(/workouts must be an array/)
    expect(() => parseHealthAutoExportRequest(payload([workout({ duration: '20' })], metrics))).toThrow(/duration is invalid/)
  })

  it('writes only after every present channel parses', async () => {
    const previous = process.env.APPLE_HEALTH_SYNC_TOKEN
    process.env.APPLE_HEALTH_SYNC_TOKEN = TOKEN
    try {
      const malformed = capture('POST', { authorization: `Bearer ${TOKEN}` }, payload([workout({ id: '' })], []))
      await appleHealthSyncHandler(malformed.req, malformed.res)
      expect(malformed.status()).toBe(400)
      expect(ingestHealthAutoExport).not.toHaveBeenCalled()
      expect(ingestHealthAutoExportSleep).not.toHaveBeenCalled()
      expect(ingestHealthAutoExportVitals).not.toHaveBeenCalled()
      expect(ingestHealthAutoExportWorkouts).not.toHaveBeenCalled()
      expect(JSON.stringify(malformed.body())).not.toContain('heartRate')

      const workoutsOnly = capture('POST', { authorization: `Bearer ${TOKEN}` }, payload([workout({ route: [[1, 2]] })]))
      await appleHealthSyncHandler(workoutsOnly.req, workoutsOnly.res)
      expect(workoutsOnly.status()).toBe(200)
      expect(ingestHealthAutoExport).not.toHaveBeenCalled()
      expect(ingestHealthAutoExportSleep).not.toHaveBeenCalled()
      expect(ingestHealthAutoExportWorkouts).toHaveBeenCalledTimes(1)
      expect(JSON.stringify(workoutsOnly.body())).toContain('workoutsInserted')
      expect(JSON.stringify(workoutsOnly.body())).not.toContain('route')
      expect(JSON.stringify(workoutsOnly.body())).not.toContain(TOKEN)

      const metricsOnly = capture(
        'POST',
        { authorization: `Bearer ${TOKEN}` },
        payload(undefined, [{ name: 'step_count', units: 'count', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 10 }] }]),
      )
      await appleHealthSyncHandler(metricsOnly.req, metricsOnly.res)
      expect(metricsOnly.status()).toBe(200)
      expect(ingestHealthAutoExport).toHaveBeenCalledTimes(1)
      expect(ingestHealthAutoExportWorkouts).toHaveBeenCalledTimes(1)

      const combined = capture(
        'POST',
        { authorization: `Bearer ${TOKEN}` },
        payload([workout()], [{ name: 'step_count', units: 'count', data: [{ date: '2026-09-20 00:00:00 -0700', qty: 10 }] }]),
      )
      await appleHealthSyncHandler(combined.req, combined.res)
      expect(combined.status()).toBe(200)
      expect(ingestHealthAutoExport).toHaveBeenCalledTimes(2)
      expect(ingestHealthAutoExportWorkouts).toHaveBeenCalledTimes(2)
      const body = combined.body() as { workouts: { workoutsSeen: number }; daysSeen: number }
      expect(body.daysSeen).toBe(1)
      expect(body.workouts.workoutsSeen).toBe(1)
    } finally {
      if (previous === undefined) {
        delete process.env.APPLE_HEALTH_SYNC_TOKEN
      } else {
        process.env.APPLE_HEALTH_SYNC_TOKEN = previous
      }
    }
  })

  it('keeps the bearer write path on the existing endpoint', () => {
    const handler = readFileSync('server/handlers/apple-health-sync.ts', 'utf8')
    expect(handler.indexOf('parseHealthAutoExportRequest')).toBeLessThan(handler.indexOf('ingestHealthAutoExport('))
    expect(handler.indexOf('ingestHealthAutoExportSleep')).toBeLessThan(handler.indexOf('sendJson(res, 200'))
    expect(handler).toContain('appleHealthSyncAuthorized')
    expect(handler).not.toContain('console.')
    expect(readFileSync('server/dispatch.ts', 'utf8')).toContain("case '/api/ingest/apple-health':")
  })
})

describe('Today Activity workouts', () => {
  const now = new Date('2026-09-22T18:00:00.000Z')

  function sources(workouts: TodaySources['activityWorkouts'], activityDays: TodaySources['activityDays'] = []): TodaySources {
    return {
      now,
      activityDays,
      activityWorkouts: workouts,
      nutritionEntries: [],
      nutritionTargets: [],
      trainingToday: [],
      trainingSessions: [],
      sleepNights: [],
      latestCompleteSleep: null,
      bodyWeights: [],
      pendingJobs: [],
    }
  }

  function activityWorkout(id: string, startAt: string, activityType: string, durationMinutes: number | null, energyKcal: number | null = null) {
    return { id, activityType, startAt, endAt: startAt, durationMinutes, energyKcal }
  }

  it('shows current Phoenix-day workouts without adding them to the daily summary', () => {
    const view = buildTodayView(
      sources(
        [
          activityWorkout('late', '2026-09-22T20:00:00.000Z', 'Hiking', 73),
          activityWorkout('early', '2026-09-22T14:15:00.000Z', 'Walking', 42),
          activityWorkout('mid', '2026-09-22T16:00:00.000Z', 'Running', 30),
          activityWorkout('fourth', '2026-09-22T21:00:00.000Z', 'Cycling', 15),
          activityWorkout('yesterday', '2026-09-22T06:30:00.000Z', 'Yoga', 20),
        ],
        [
          {
            date: '2026-09-22',
            timezone: 'America/Phoenix',
            stepsCount: 7400,
            activeEnergyKcal: 320,
            exerciseMinutes: 28,
            walkingRunningDistanceM: null,
            restingHeartRateBpm: null,
          },
        ],
      ),
    )
    expect(view.activity.steps).toBe(7400)
    expect(view.activity.activeEnergyKcal).toBe(320)
    expect(view.activity.exerciseMinutes).toBe(28)
    expect(view.activity.workouts.map((item) => item.line)).toEqual(['Walking · 42 min', 'Running · 30 min', 'Hiking · 1h 13m'])
    expect(view.activity.additionalWorkoutCount).toBe(1)
    expect(view.training.logged).toBe(false)
  })

  it('does not use the empty Activity copy when the daily summary is missing', () => {
    const view = buildTodayView(sources([activityWorkout('walk', '2026-09-22T15:00:00.000Z', 'HKWorkoutActivityTypeWalking', 42, 500)]))
    expect(view.activity.steps).toBeNull()
    expect(view.activity.activeEnergyKcal).toBeNull()
    expect(view.activity.exerciseMinutes).toBeNull()
    expect(view.activity.inProgress).toBe(true)
    expect(view.activity.workouts[0]?.line).toBe('Walking · 42 min')
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(TodayBoard, { view })),
    )
    expect(html).toContain('Walking · 42 min')
    expect(html).not.toContain('No activity data received yet today.')
    expect(html).not.toContain('active kcal')
  })
})

describe('Activity workout timeline', () => {
  it('emits one Activity event and keeps it out of Training and All', () => {
    const timeline = buildProgressTimeline({
      asOf: '2026-09-22',
      range: '30d',
      exercises: [],
      sets: [],
      workouts: [
        {
          sessionId: 'session-1',
          sessionDate: '2026-09-22',
          createdAt: '2026-09-22T18:00:00.000Z',
          templateName: 'Lift',
        },
      ],
      bodyObservations: [],
      activityWorkouts: [
        {
          id: 'canonical-workout',
          activityType: 'Running',
          startAt: '2026-09-22T15:00:00.000Z',
          endAt: '2026-09-22T16:00:00.000Z',
          durationMinutes: 60,
          energyKcal: 400,
        },
      ],
    })
    const activity = timelineEventsForFocus(timeline, 'activity').filter((event) => event.kind === 'activity_workout')
    expect(activity.map((event) => event.id)).toEqual(['activity_workout:canonical-workout'])
    expect(timelineEventsForFocus(timeline, 'all').some((event) => event.kind === 'activity_workout')).toBe(false)
    expect(timelineEventsForFocus(timeline, 'training').some((event) => event.id === 'activity_workout:canonical-workout')).toBe(false)
    expect(timelineEventsForFocus(timeline, 'training').some((event) => event.kind === 'training_session')).toBe(true)
  })
})

describe('Health Auto Export workout backup', () => {
  it('keeps one canonical workout and Health Auto Export provenance in the full archive', () => {
    const haeSource = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
    const xmlSource = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
    const jobId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
    const workoutId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
    const rows = {
      data_sources: [
        {
          id: haeSource,
          key: 'health_auto_export',
          display_name: 'Health Auto Export',
          source_kind: 'integration',
          created_at: '2024-02-06T16:13:00.000Z',
        },
        {
          id: xmlSource,
          key: 'apple_health',
          display_name: 'Apple Health',
          source_kind: 'archive',
          created_at: '2024-02-06T16:13:00.000Z',
        },
      ],
      import_jobs: [
        {
          id: jobId,
          source_id: haeSource,
          imported_at: '2024-02-06T16:13:00.000Z',
          source_filename: 'health-auto-export-workouts.json',
          format_version: 'health_auto_export.v2+hae-workout-v1',
          status: 'completed',
          record_count: '1',
          inserted_count: '1',
          matched_count: '0',
          skipped_count: '0',
          error_count: '0',
          content_hash: null,
          metadata: '{"strategy":"health_auto_export_workouts","calculationVersion":"hae-workout-v1"}',
          created_at: '2024-02-06T16:13:00.000Z',
        },
      ],
      activity_workouts: [
        {
          id: workoutId,
          activity_type: 'Running',
          start_at: '2024-02-06T15:00:00.000Z',
          end_at: '2024-02-06T16:13:00.000Z',
          duration_min: '73',
          energy_kcal: '100',
          distance_m: '5000',
          source_name: null,
          source_version: null,
          device_name: null,
          source_id: haeSource,
          import_job_id: jobId,
          metadata: '{"transport":"health_auto_export","exportVersion":"v2","calculationVersion":"hae-workout-v1"}',
          created_at: '2024-02-06T16:13:00.000Z',
        },
      ],
      source_record_links: [
        {
          id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          source_id: haeSource,
          import_job_id: jobId,
          external_id: 'workout-alpha',
          external_fingerprint: 'health_auto_export|workout|v2|workout-alpha',
          entity_type: 'activity_workout',
          entity_id: workoutId,
          source_payload: '{"id":"workout-alpha","name":"Running"}',
          created_at: '2024-02-06T16:13:00.000Z',
        },
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          source_id: xmlSource,
          import_job_id: null,
          external_id: null,
          external_fingerprint: 'apple-health-xml-workout',
          entity_type: 'activity_workout',
          entity_id: workoutId,
          source_payload: '{"activityType":"HKWorkoutActivityTypeRunning"}',
          created_at: '2024-02-06T16:13:00.000Z',
        },
      ],
    }
    const full = verifyBackupArchive(
      buildBackupArchive({
        profile: 'full',
        createdAt: '2026-09-27T17:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: rows,
      }),
    )
    expect(full.errors).toEqual([])
    expect(full.tables.activity_workouts).toHaveLength(1)
    expect(full.tables.source_record_links).toHaveLength(2)
    expect(full.tables.activity_workouts?.[0]).toMatchObject({ activity_type: 'Running', duration_min: '73' })
    expect(JSON.stringify(full.tables.activity_workouts?.[0]?.metadata)).not.toContain('route')
    expect(full.tables.activity_workouts?.[0]).not.toHaveProperty('line')
    const portable = verifyBackupArchive(
      buildBackupArchive({
        profile: 'portable',
        createdAt: '2026-09-27T17:00:00.000Z',
        schemaMigration: LATEST_SCHEMA_MIGRATION,
        appVersionOrCommit: '1.0.0',
        rowsByTable: rows,
      }),
    )
    expect(portable.tables.activity_workouts?.[0]).toMatchObject({ activity_type: 'Running', duration_min: '73' })
    expect(portable.tables.source_record_links ?? []).toHaveLength(0)
    const plan = planRestore({
      verified: full,
      destinationSchema: LATEST_SCHEMA_MIGRATION,
      destinationCounts: Object.fromEntries(BACKUP_TABLES.map((definition) => [definition.name, 0])),
    })
    expect(plan.blocked).toBe(false)
    const statements = restoreStatements(full.tables)
    const workoutInserts = statements.filter((statement) => statement.text.includes('INSERT INTO activity_workouts'))
    expect(workoutInserts).toHaveLength(1)
    expect(JSON.stringify(workoutInserts[0]?.params)).toContain(workoutId)
    const linkInserts = statements.filter((statement) => statement.text.includes('INSERT INTO source_record_links'))
    expect(linkInserts).toHaveLength(1)
    expect(JSON.stringify(linkInserts[0]?.params)).toContain('health_auto_export|workout|v2|workout-alpha')
    expect(JSON.stringify(linkInserts[0]?.params)).toContain('apple-health-xml-workout')
    expect(BACKUP_TABLES.some((definition) => definition.name === 'activity_workouts')).toBe(true)
    expect(BACKUP_TABLES.some((definition) => definition.name === 'hae_workouts')).toBe(false)
  })
})

describe('Health Auto Export workout surfaces', () => {
  it('shows a demo Activity workout without calling a provider or logging Training', () => {
    const today = demoToday()
    expect(today.activity.workouts.some((item) => item.line === 'Walking · 42 min')).toBe(true)
    expect(today.training.logged).toBe(true)
    expect(today.training.sessions.some((session) => session.id === 'demo-walk-today')).toBe(false)
    const demoSource = readFileSync('src/demo/dataset.ts', 'utf8') + readFileSync('src/demo/repository.ts', 'utf8')
    expect(demoSource).not.toContain('/api/ingest/apple-health')
    expect(demoSource).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
  })

  it('accepts a workouts sync channel beside Activity and Sleep', () => {
    const parsed = appleHealthStatusSchema.parse({
      sourceKey: 'apple_health',
      job: null,
      autoExport: {
        importedAt: '2026-09-27T17:00:00.000Z',
        status: 'completed',
        latestDay: null,
        activity: null,
        sleep: null,
        workouts: {
          importedAt: '2026-09-27T17:00:00.000Z',
          status: 'completed',
          latestWorkoutAt: '2026-09-27T15:00:00.000Z',
        },
      },
      activitySampleCount: 0,
    })
    expect(parsed.autoExport?.workouts?.status).toBe('completed')
    const page = readFileSync('src/features/settings/SettingsPage.tsx', 'utf8')
    expect(page).toContain('Health Auto Export workouts')
    expect(page).toContain('Health Auto Export Workouts')
    expect(page).toContain('never become Training')
    expect(page).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    const status = readFileSync('server/apple-health/hae-service.ts', 'utf8')
    expect(status).toContain('latestHaeWorkoutStatus')
    expect(status).toContain('workouts')
  })
})
