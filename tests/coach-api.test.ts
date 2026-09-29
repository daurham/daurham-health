import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleCoach, matchCoachRoute } from '../server/handlers/coach.ts'
import { HttpError } from '../server/http.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  ensureCoach: vi.fn(),
  readCoach: vi.fn(),
  passCoachTask: vi.fn(),
  acceptCoachTask: vi.fn(),
  endCoachTask: vi.fn(),
  logCoachTraining: vi.fn(),
  logCoachSelfReport: vi.fn(),
  snoozeCoachLabItem: vi.fn(),
}))

vi.mock('../server/coach/service.ts', () => service)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const TASK = '11111111-1111-4111-8111-111111111111'

function request(method: string, url: string, body?: unknown): ApiRequest {
  return { method, url, headers: {}, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function response() {
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



function call(method: string, url: string, identity: { id: string; email: string } | null, body?: unknown) {
  const captured = response()
  return withOwnerAuth(handleCoach, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, body), captured.res).then(() => captured)
}

describe('Coach API routing', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset()
    const state = { date: '2026-09-29', weekStart: '2026-09-28', weekEnd: '2026-10-04', weeklyFocus: null, dailyQuest: null, activeCount: 0 }
    service.ensureCoach.mockResolvedValue(state)
    service.readCoach.mockResolvedValue(state)
    service.passCoachTask.mockResolvedValue(state)
    service.acceptCoachTask.mockResolvedValue(state)
    service.endCoachTask.mockResolvedValue(state)
    service.logCoachTraining.mockResolvedValue(state)
    service.logCoachSelfReport.mockResolvedValue(state)
    service.snoozeCoachLabItem.mockResolvedValue({ ...state, snoozedUntil: '2026-10-06' })
  })

  it('matches root, ensure, and task actions through the single API dispatcher', () => {
    expect(matchCoachRoute('/api/coach')).toEqual({ kind: 'root' })
    expect(matchCoachRoute('/api/coach/ensure')).toEqual({ kind: 'ensure' })
    expect(matchCoachRoute(`/api/coach/tasks/${TASK}/pass`)).toEqual({ kind: 'task', id: TASK, action: 'pass' })
    expect(matchCoachRoute('/api/coach/tasks/not-a-uuid/pass')).toBeNull()
    expect(matchHealthApiRoute('/api/coach')).toBe('coach')
    expect(matchHealthApiRoute('/api/coach/ensure')).toBe('coach')
    expect(matchCoachRoute('/api/coach/lab/snooze')).toEqual({ kind: 'lab-snooze' })
    expect(matchHealthApiRoute('/api/coach/lab/snooze')).toBe('coach')
    expect(matchHealthApiRoute(`/api/coach/tasks/${TASK}/log-training`)).toBe('coach')
  })

  it('keeps Coach owner-only and enforces methods', async () => {
    expect((await call('GET', '/api/coach', null)).status()).toBe(401)
    expect((await call('POST', '/api/coach/ensure', { id: 'someone', email: 'other@example.com' })).status()).toBe(403)
    const wrong = await call('GET', '/api/coach/ensure', { id: 'owner-1', email: 'owner@example.com' })
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('POST')
  })

  it('lets the owner ensure, pass, and log both completion modes', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/coach', owner)).status()).toBe(200)
    expect((await call('POST', '/api/coach/ensure', owner)).status()).toBe(200)
    expect((await call('POST', `/api/coach/tasks/${TASK}/pass`, owner, {})).status()).toBe(200)
    expect((await call('POST', `/api/coach/tasks/${TASK}/log-training`, owner, { submissionId: TASK, actualValue: 10 })).status()).toBe(200)
    expect((await call('POST', `/api/coach/tasks/${TASK}/log-self-report`, owner, { submissionId: TASK, durationMin: 10 })).status()).toBe(200)
    expect(service.readCoach).toHaveBeenCalledTimes(1)
    expect(service.ensureCoach).toHaveBeenCalledTimes(1)
    expect(service.passCoachTask).toHaveBeenCalledWith(TASK)
    expect(service.logCoachTraining).toHaveBeenCalledWith(TASK, { submissionId: TASK, actualValue: 10 })
    expect(service.logCoachSelfReport).toHaveBeenCalledWith(TASK, { submissionId: TASK, durationMin: 10 })
  })

  it.each(['accept', 'end', 'pass'] as const)('protects the %s lifecycle mutation and validates methods', async (action) => {
    const url = `/api/coach/tasks/${TASK}/${action}`
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect(matchCoachRoute(url)).toEqual({ kind: 'task', id: TASK, action })
    expect(matchHealthApiRoute(url)).toBe('coach')
    expect((await call('POST', url, null)).status()).toBe(401)
    expect((await call('POST', url, { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    const wrong = await call('GET', url, owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('POST')
    expect((await call('POST', url, owner)).status()).toBe(200)
    const mutation = action === 'accept' ? service.acceptCoachTask : action === 'end' ? service.endCoachTask : service.passCoachTask
    expect(mutation).toHaveBeenCalledWith(TASK)
    mutation.mockRejectedValueOnce(new HttpError(409, 'Invalid lifecycle transition'))
    expect((await call('POST', url, owner)).status()).toBe(409)
  })

  it('protects Lab snoozes, passes exact identity, validates methods and returns stale conflicts', async () => {
    const url = '/api/coach/lab/snooze'
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const body = { kind: 'benchmark_retest', sourceKey: 'benchmark-retest:benchmark:protocol', sourceFingerprint: 'a'.repeat(64) }
    expect((await call('POST', url, null, body)).status()).toBe(401)
    expect((await call('POST', url, { id: 'other', email: 'other@example.com' }, body)).status()).toBe(403)
    const wrong = await call('GET', url, owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('POST')
    expect((await call('POST', url, owner, body)).status()).toBe(200)
    expect(service.snoozeCoachLabItem).toHaveBeenCalledWith(body)
    service.snoozeCoachLabItem.mockRejectedValueOnce(new HttpError(409, 'Stale Lab fingerprint'))
    expect((await call('POST', url, owner, body)).status()).toBe(409)
  })
})
