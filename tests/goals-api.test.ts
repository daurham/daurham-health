import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleGoals, matchGoalRoute } from '../server/handlers/goals.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  listGoals: vi.fn(),
  getGoal: vi.fn(),
  createGoal: vi.fn(),
  reviseGoal: vi.fn(),
  archiveGoal: vi.fn(),
  changeGoalLifecycle: vi.fn(),
  readGoalProjection: vi.fn(),
}))

vi.mock('../server/goals/service.ts', () => service)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const GOAL = '11111111-1111-4111-8111-111111111111'

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

function call(method: string, url: string, identity: { id: string; email: string } | null, body?: unknown) {
  const captured = captureResponse()
  return withOwnerAuth(handleGoals, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, {}, body), captured.res).then(() => captured)
}

describe('goal API auth', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset()
    service.listGoals.mockResolvedValue({ goals: [] })
    service.createGoal.mockResolvedValue({ id: GOAL })
    service.getGoal.mockResolvedValue({ id: GOAL })
    service.reviseGoal.mockResolvedValue({ id: GOAL })
    service.archiveGoal.mockResolvedValue({ ok: true, disposition: 'deleted' })
    service.changeGoalLifecycle.mockResolvedValue({ id: GOAL, status: 'paused' })
    service.readGoalProjection.mockResolvedValue({ id: GOAL, state: 'not_applicable' })
  })

  it('rejects anonymous, non-owner, and the wrong method', async () => {
    const anonymous = await call('GET', '/api/goals', null)
    expect(anonymous.status()).toBe(401)
    const other = await call('POST', '/api/goals', { id: 'someone', email: 'other@example.com' }, {})
    expect(other.status()).toBe(403)
    const wrong = await call('PUT', '/api/goals', { id: 'owner-1', email: 'owner@example.com' }, {})
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, POST')
    expect(service.createGoal).not.toHaveBeenCalled()
  })

  it('lets the owner list, create, revise, remove, and pause', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/goals', owner)).status()).toBe(200)
    expect((await call('POST', '/api/goals', owner, { goalKind: 'body_metric' })).status()).toBe(201)
    expect((await call('POST', `/api/goals/${GOAL}/versions`, owner, { sourceVersionId: GOAL })).status()).toBe(201)
    expect((await call('DELETE', `/api/goals/${GOAL}`, owner)).status()).toBe(200)
    expect(service.archiveGoal).toHaveBeenCalledWith(GOAL)
    expect((await call('POST', `/api/goals/${GOAL}/pause`, owner, {})).status()).toBe(200)
    expect(service.changeGoalLifecycle).toHaveBeenCalledWith(GOAL, 'pause')
    expect((await call('GET', `/api/goals/${GOAL}/projection`, owner)).status()).toBe(200)
    expect(service.readGoalProjection).toHaveBeenCalledTimes(1)
    const future = await call('GET', `/api/goals/${GOAL}/projection?asOf=2999-01-01`, owner)
    expect(future.status()).toBe(400)
    expect(service.readGoalProjection).toHaveBeenCalledTimes(1)
    const wrongProjection = await call('POST', `/api/goals/${GOAL}/projection`, owner, {})
    expect(wrongProjection.status()).toBe(405)
    expect(matchGoalRoute('/api/goals')?.kind).toBe('list')
    expect(matchHealthApiRoute('/api/goals')).toBe('goals')
    expect(readFileSync('server/handlers/goals.ts', 'utf8')).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
  })
})
