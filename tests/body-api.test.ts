import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { handleBodyCadences, matchBodyCadenceRoute } from '../server/handlers/body-cadences.ts'
import { handleBodyMeasurements, matchBodyMeasurementRoute } from '../server/handlers/body-measurements.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const { listBodyMeasurements, createManualMeasurement, updateManualMeasurement, deleteManualMeasurement, listCadences, saveCadence, deleteCadence } =
  vi.hoisted(() => ({
    listBodyMeasurements: vi.fn(),
    createManualMeasurement: vi.fn(),
    updateManualMeasurement: vi.fn(),
    deleteManualMeasurement: vi.fn(),
    listCadences: vi.fn(),
    saveCadence: vi.fn(),
    deleteCadence: vi.fn(),
  }))

vi.mock('../server/body/fit-profile-import.ts', () => ({
  listBodyMeasurements,
}))

vi.mock('../server/body/manual-service.ts', () => ({
  createManualMeasurement,
  updateManualMeasurement,
  deleteManualMeasurement,
}))

vi.mock('../server/body/cadence-service.ts', () => ({
  listCadences,
  saveCadence,
  deleteCadence,
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const SESSION = '11111111-1111-4111-8111-111111111111'

function request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): ApiRequest {
  return { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; allow: () => string | undefined } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = () => res
  return { res, status: () => statusCode, allow: () => headers.get('allow') }
}

function call(
  handler: (req: ApiRequest, res: ApiResponse) => Promise<void>,
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  headers?: Record<string, string>,
  body?: unknown,
) {
  const captured = captureResponse()
  return withOwnerAuth(handler, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('body measurement routes', () => {
  beforeEach(() => {
    listBodyMeasurements.mockReset()
    createManualMeasurement.mockReset()
    updateManualMeasurement.mockReset()
    deleteManualMeasurement.mockReset()
    listCadences.mockReset()
    saveCadence.mockReset()
    deleteCadence.mockReset()
    listBodyMeasurements.mockResolvedValue({ sessions: [] })
    listCadences.mockResolvedValue({ asOf: '2026-09-26', items: [] })
    createManualMeasurement.mockResolvedValue({ id: SESSION })
    saveCadence.mockResolvedValue({ metricKey: 'waist_circumference' })
  })

  it('keeps manual body routes on owner auth and away from machine ingest', () => {
    expect(matchHealthApiRoute('/api/body/measurements')).toBe('body-measurements')
    expect(matchHealthApiRoute(`/api/body/measurements/${SESSION}`)).toBe('body-measurements')
    expect(matchHealthApiRoute('/api/body/cadences')).toBe('body-cadences')
    expect(matchHealthApiRoute('/api/body/cadences/waist_circumference')).toBe('body-cadences')
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    expect(matchBodyMeasurementRoute(`/api/body/measurements/${SESSION}`)).toEqual({ kind: 'detail', id: SESSION })
    expect(matchBodyCadenceRoute('/api/body/cadences/left_upper_arm_circumference')?.kind).toBe('metric')
    const measurements = readFileSync('server/handlers/body-measurements.ts', 'utf8')
    const cadences = readFileSync('server/handlers/body-cadences.ts', 'utf8')
    const cadenceService = readFileSync('server/body/cadence-service.ts', 'utf8')
    expect(measurements).toContain('withOwnerAuth')
    expect(cadences).toContain('withOwnerAuth')
    expect(measurements).not.toContain('sync-auth')
    expect(cadences).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(cadenceService).toContain('ON CONFLICT (metric_key) DO UPDATE')
  })

  it('rejects anonymous callers, non-owners, and the wrong method', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call(handleBodyMeasurements, 'GET', '/api/body/measurements', null)).status()).toBe(401)
    expect(
      (await call(handleBodyMeasurements, 'POST', '/api/body/measurements', null, { authorization: 'Bearer machine-token' }, { metrics: [] })).status(),
    ).toBe(401)
    expect((await call(handleBodyCadences, 'PUT', '/api/body/cadences/waist_circumference', null, { authorization: 'Bearer machine-token' }, { intervalDays: 14 })).status()).toBe(401)
    expect(createManualMeasurement).not.toHaveBeenCalled()
    expect(saveCadence).not.toHaveBeenCalled()
    expect((await call(handleBodyMeasurements, 'POST', '/api/body/measurements', { id: 'other', email: 'other@example.com' }, undefined, { metrics: [] })).status()).toBe(403)
    expect((await call(handleBodyMeasurements, 'POST', '/api/body/measurements', owner, undefined, { metrics: [] })).status()).toBe(201)
    expect((await call(handleBodyMeasurements, 'PUT', '/api/body/measurements', owner)).status()).toBe(405)
    expect((await call(handleBodyMeasurements, 'PUT', '/api/body/measurements', owner)).allow()).toBe('GET, POST')
    expect((await call(handleBodyCadences, 'POST', '/api/body/cadences', owner)).status()).toBe(405)
    expect((await call(handleBodyCadences, 'GET', '/api/body/cadences', owner)).status()).toBe(200)
  })
})
