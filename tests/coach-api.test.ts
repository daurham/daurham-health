import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { matchCoachRoute } from '../server/handlers/coach.ts'
import coachHandler from '../server/handlers/coach.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  ensureCoach: vi.fn(),
  readCoach: vi.fn(),
  passCoachTask: vi.fn(),
  logCoachTraining: vi.fn(),
  logCoachSelfReport: vi.fn(),
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
  return withOwnerAuth(async (req, res) => {
    const route = matchCoachRoute(req.url ?? '')
    if (!route) {
      res.status(404).json({ error: 'Not found' })
      return
    }
    // Invoke the same wrapped handler through a request whose auth has already been established.
    // The service module is mocked, so only route/method behavior is under test here.
    const unwrapped = (coachHandler as unknown as (req: ApiRequest, res: ApiResponse) => Promise<void>)
    await unwrapped(req, res)
  }, {
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
    service.logCoachTraining.mockResolvedValue(state)
    service.logCoachSelfReport.mockResolvedValue(state)
  })

  it('matches root, ensure, and task actions through the single API dispatcher', () => {
    expect(matchCoachRoute('/api/coach')).toEqual({ kind: 'root' })
    expect(matchCoachRoute('/api/coach/ensure')).toEqual({ kind: 'ensure' })
    expect(matchCoachRoute(`/api/coach/tasks/${TASK}/pass`)).toEqual({ kind: 'task', id: TASK, action: 'pass' })
    expect(matchCoachRoute('/api/coach/tasks/not-a-uuid/pass')).toBeNull()
    expect(matchHealthApiRoute('/api/coach')).toBe('coach')
    expect(matchHealthApiRoute('/api/coach/ensure')).toBe('coach')
    expect(matchHealthApiRoute(`/api/coach/tasks/${TASK}/log-training`)).toBe('coach')
  })

  it('keeps Coach owner-only', async () => {
    const captured = response()
    await withOwnerAuth(async () => {}, {
      config: ownerConfig,
      readSession: async () => null,
    })(request('GET', '/api/coach'), captured.res)
    expect(captured.status()).toBe(401)

    const other = response()
    await withOwnerAuth(async () => {}, {
      config: ownerConfig,
      readSession: async () => ({ id: 'someone', email: 'other@example.com' }),
    })(request('GET', '/api/coach'), other.res)
    expect(other.status()).toBe(403)
  })
})
