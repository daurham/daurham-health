import { HealthAutoExportError, healthAutoExportHasActivityMetrics } from '../../src/domain/apple-health/hae.js'
import { parseHealthAutoExportSleep } from '../../src/domain/apple-health/hae-sleep.js'
import { handleApiError, HttpError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { ingestHealthAutoExport } from '../apple-health/hae-service.js'
import { ingestHealthAutoExportSleep } from '../apple-health/hae-sleep-service.js'
import { appleHealthSyncAuthorized, appleHealthSyncToken } from '../apple-health/sync-auth.js'

function authorizationHeader(req: ApiRequest): string | string[] | undefined {
  return req.headers.authorization ?? req.headers.Authorization
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
    const sleepParsed = parseHealthAutoExportSleep(payload)
    const activity = healthAutoExportHasActivityMetrics(payload)
      ? await ingestHealthAutoExport({ payload, sourceFilename: 'health-auto-export-sync' })
      : null
    const sleep = sleepParsed.metricPresent ? await ingestHealthAutoExportSleep({ payload }) : null
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
    })
  } catch (error) {
    if (error instanceof HealthAutoExportError) {
      handleApiError(res, new HttpError(400, error.message))
      return
    }
    handleApiError(res, error)
  }
}
