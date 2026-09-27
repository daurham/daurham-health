import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { handleSupplements, matchSupplementRoute } from '../server/handlers/supplements.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const {
  listSupplements,
  createSupplement,
  recordAdherence,
  updateSupplement,
  deleteSupplement,
  addSchedule,
  versionSchedule,
  stopSchedule,
  updateFutureSchedule,
  setLifecycleStatus,
} = vi.hoisted(() => ({
  listSupplements: vi.fn(),
  createSupplement: vi.fn(),
  recordAdherence: vi.fn(),
  updateSupplement: vi.fn(),
  deleteSupplement: vi.fn(),
  addSchedule: vi.fn(),
  versionSchedule: vi.fn(),
  stopSchedule: vi.fn(),
  updateFutureSchedule: vi.fn(),
  setLifecycleStatus: vi.fn(),
}))

vi.mock('../server/supplements/service.ts', () => ({
  listSupplements,
  createSupplement,
  recordAdherence,
  updateSupplement,
  deleteSupplement,
  addSchedule,
  versionSchedule,
  stopSchedule,
  updateFutureSchedule,
  setLifecycleStatus,
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const SUPPLEMENT = '11111111-1111-4111-8111-111111111111'
const SCHEDULE = '22222222-2222-4222-8222-222222222222'

function request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): ApiRequest {
  return { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; body: () => unknown; allow: () => string | undefined } {
  const socket = new Socket()
  const nodeRes = new ServerResponse(new IncomingMessage(socket))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = (body: unknown) => {
    payload = body
  }
  return {
    res,
    status: () => statusCode,
    body: () => payload,
    allow: () => headers.get('allow'),
  }
}

function call(
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  headers?: Record<string, string>,
  body?: unknown,
) {
  const captured = captureResponse()
  return withOwnerAuth(handleSupplements, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('supplement routes', () => {
  it('keeps supplement routes on owner auth and away from machine ingest', () => {
    expect(matchHealthApiRoute('/api/supplements')).toBe('supplements')
    expect(matchHealthApiRoute('/api/supplements/adherence')).toBe('supplements')
    expect(matchHealthApiRoute(`/api/supplements/${SUPPLEMENT}`)).toBe('supplements')
    expect(matchHealthApiRoute(`/api/supplements/${SUPPLEMENT}/schedules/${SCHEDULE}/version`)).toBe('supplements')
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    expect(matchSupplementRoute('/api/supplements/adherence')).toEqual({ kind: 'adherence' })
    const handler = readFileSync('server/handlers/supplements.ts', 'utf8')
    const service = readFileSync('server/supplements/service.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(handler).not.toContain('sync-auth')
    expect(service).toContain('ON CONFLICT (schedule_id, scheduled_date) DO UPDATE')
    expect(service).not.toContain('import_jobs')
  })
})

describe('supplement owner boundary', () => {
  beforeEach(() => {
    for (const fn of [
      listSupplements,
      createSupplement,
      recordAdherence,
      updateSupplement,
      deleteSupplement,
      addSchedule,
      versionSchedule,
      stopSchedule,
      updateFutureSchedule,
      setLifecycleStatus,
    ]) {
      fn.mockReset()
    }
    listSupplements.mockResolvedValue({ date: '2026-09-26', timezone: 'America/Phoenix', supplements: [] })
    recordAdherence.mockResolvedValue({ scheduleId: SCHEDULE, state: 'taken' })
  })

  it('rejects anonymous callers and a machine bearer token', async () => {
    const anonymous = await call('GET', '/api/supplements', null)
    expect(anonymous.status()).toBe(401)
    const machine = await call('POST', '/api/supplements/adherence', null, { authorization: 'Bearer machine-token' })
    expect(machine.status()).toBe(401)
    expect(recordAdherence).not.toHaveBeenCalled()
  })

  it('rejects an authenticated non-owner', async () => {
    const denied = await call('GET', '/api/supplements', { id: 'someone-else', email: 'other@example.com' })
    expect(denied.status()).toBe(403)
    expect(listSupplements).not.toHaveBeenCalled()
  })

  it('allows the owner and rejects the wrong method', async () => {
    const allowed = await call('GET', '/api/supplements', { id: 'owner-1', email: 'owner@example.com' })
    expect(allowed.status()).toBe(200)
    expect(allowed.body()).toMatchObject({ supplements: [] })
    const recorded = await call(
      'POST',
      '/api/supplements/adherence',
      { id: 'owner-1', email: 'owner@example.com' },
      undefined,
      { scheduleId: SCHEDULE, scheduledDate: '2026-09-26', action: 'taken' },
    )
    expect(recorded.status()).toBe(200)
    const wrong = await call('PUT', '/api/supplements', { id: 'owner-1', email: 'owner@example.com' })
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, POST')
    const wrongAdherence = await call('GET', '/api/supplements/adherence', { id: 'owner-1', email: 'owner@example.com' })
    expect(wrongAdherence.status()).toBe(405)
  })
})
