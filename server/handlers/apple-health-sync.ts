import { HealthAutoExportError, healthAutoExportHasActivityMetrics, parseHealthAutoExport } from '../../src/domain/apple-health/hae.js'
import { parseHealthAutoExportSleep, type HaeSleepParseResult } from '../../src/domain/apple-health/hae-sleep.js'
import { parseHealthAutoExportVitals } from '../../src/domain/apple-health/hae-vitals.js'
import {
  detectHealthAutoExportChannels,
  parseHealthAutoExportWorkouts,
  type HaeWorkoutParseResult,
} from '../../src/domain/apple-health/hae-workouts.js'
import { handleApiError, HttpError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { ingestHealthAutoExport } from '../apple-health/hae-service.js'
import { ingestHealthAutoExportSleep } from '../apple-health/hae-sleep-service.js'
import { ingestHealthAutoExportVitals } from '../apple-health/hae-vitals-service.js'
import { ingestHealthAutoExportWorkouts } from '../apple-health/hae-workout-service.js'
import { appleHealthSyncAuthorized, appleHealthSyncToken } from '../apple-health/sync-auth.js'

function authorizationHeader(req: ApiRequest): string | string[] | undefined {
  return req.headers.authorization ?? req.headers.Authorization
}

export function parseHealthAutoExportRequest(payload: unknown): {
  hasActivityMetrics: boolean
  sleep: HaeSleepParseResult | null
  workouts: HaeWorkoutParseResult | null
} {
  const channels = detectHealthAutoExportChannels(payload)
  const hasActivityMetrics = channels.metrics && healthAutoExportHasActivityMetrics(payload)
  if (hasActivityMetrics) {
    parseHealthAutoExport(payload)
  }
  const sleep = channels.metrics ? parseHealthAutoExportSleep(payload) : null
  if (channels.metrics) {
    parseHealthAutoExportVitals(payload)
  }
  const workouts = channels.workouts ? parseHealthAutoExportWorkouts(payload) : null
  return { hasActivityMetrics, sleep, workouts }
}

export default async function appleHealthSyncHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const configured = await appleHealthSyncToken()
    if (!configured) {
      throw new HttpError(503, 'Apple Health sync is not configured')
    }
    const authorized = await appleHealthSyncAuthorized(authorizationHeader(req))
    if (!authorized) {
      throw new HttpError(401, 'Unauthorized')
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    let payload: unknown
    try {
      payload = await readJsonBody(req)
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 400) {
        throw new HealthAutoExportError('Health Auto Export payload must contain data.metrics')
      }
      throw error
    }
    const parsed = parseHealthAutoExportRequest(payload)
    const activity = parsed.hasActivityMetrics
      ? await ingestHealthAutoExport({ payload, sourceFilename: 'health-auto-export-sync' })
      : null
    const sleep = parsed.sleep?.metricPresent ? await ingestHealthAutoExportSleep({ payload }) : null
    const sleepVitals = parsed.sleep ? await ingestHealthAutoExportVitals({ payload }) : null
    const workouts = parsed.workouts ? await ingestHealthAutoExportWorkouts(parsed.workouts) : null
    sendJson(res, 200, {
      accepted: 1 as const,
      ...(activity
        ? {
            daysSeen: activity.daysSeen,
            daysInserted: activity.daysInserted,
            daysUpdated: activity.daysUpdated,
            metricsApplied: activity.metricsApplied,
            ignoredMetrics: activity.ignoredMetrics,
          }
        : {}),
      ...(sleep ? { sleep } : {}),
      ...(sleepVitals ? { sleepVitals } : {}),
      ...(workouts
        ? {
            workouts: {
              workoutsSeen: workouts.workoutsSeen,
              workoutsInserted: workouts.workoutsInserted,
              workoutsMatchedHae: workouts.workoutsMatchedHae,
              workoutsMatchedExisting: workouts.workoutsMatchedExisting,
              workoutsAmbiguous: workouts.workoutsAmbiguous,
              workoutsConflict: workouts.workoutsConflict,
              workoutsIgnored: workouts.workoutsIgnored,
            },
          }
        : {}),
    })
  } catch (error) {
    if (error instanceof HealthAutoExportError) {
      handleApiError(res, new HttpError(400, error.message))
      return
    }
    handleApiError(res, error)
  }
}
