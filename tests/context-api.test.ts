import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { handleContext, matchContextRoute } from '../server/handlers/context.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const { getDailyContext, listDailyContexts, putDailyContext, deleteDailyContext } = vi.hoisted(() => ({
  getDailyContext: vi.fn(),
  listDailyContexts: vi.fn(),
  putDailyContext: vi.fn(),
  deleteDailyContext: vi.fn(),
}))

vi.mock('../server/context/service.ts', () => ({
  getDailyContext,
  listDailyContexts,
  putDailyContext,
  deleteDailyContext,
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): ApiRequest {
  return { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; allow: () => string | undefined; body: () => unknown } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
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
  res.json = (value: unknown) => {
    payload = value
    return res
  }
  return { res, status: () => statusCode, allow: () => headers.get('allow'), body: () => payload }
}

function call(
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  headers?: Record<string, string>,
  body?: unknown,
) {
  const captured = captureResponse()
  return withOwnerAuth(handleContext, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('context API auth', () => {
  beforeEach(() => {
    getDailyContext.mockReset()
    listDailyContexts.mockReset()
    putDailyContext.mockReset()
    deleteDailyContext.mockReset()
    getDailyContext.mockResolvedValue(null)
    listDailyContexts.mockResolvedValue([])
    putDailyContext.mockResolvedValue({ id: 'ctx', contextDate: '2026-09-26', tags: ['travel'], note: null })
    deleteDailyContext.mockResolvedValue(true)
  })

  it('keeps context on owner auth and away from machine ingest', () => {
    expect(matchHealthApiRoute('/api/context/days')).toBe('context')
    expect(matchHealthApiRoute('/api/context/days/2026-09-26')).toBe('context')
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    expect(matchContextRoute('/api/context/days/2026-09-26')).toEqual({ kind: 'day', date: '2026-09-26' })
    const handler = readFileSync('server/handlers/context.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(handler).not.toContain('sync-auth')
  })

  it('rejects anonymous callers, non-owners, machine tokens, and the wrong method', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/context/days?start=2026-09-01&end=2026-09-26', null)).status()).toBe(401)
    expect(
      (await call('PUT', '/api/context/days/2026-09-26', null, { authorization: 'Bearer machine-token' }, { tags: ['travel'] }))
        .status(),
    ).toBe(401)
    expect(putDailyContext).not.toHaveBeenCalled()
    expect((await call('GET', '/api/context/days/2026-09-26', { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    const missing = await call('GET', '/api/context/days/2026-09-26', owner)
    expect(missing.status()).toBe(200)
    expect(missing.body()).toEqual({ context: null })
    const saved = await call('PUT', '/api/context/days/2026-09-26', owner, undefined, { tags: ['travel'], note: null })
    expect(saved.status()).toBe(200)
    expect(putDailyContext).toHaveBeenCalledWith('2026-09-26', { tags: ['travel'], note: null })
    expect((await call('DELETE', '/api/context/days/2026-09-26', owner)).status()).toBe(200)
    const range = await call('GET', '/api/context/days?start=2026-09-01&end=2026-09-26', owner)
    expect(range.status()).toBe(200)
    expect(listDailyContexts).toHaveBeenCalledWith('2026-09-01', '2026-09-26')
    const wrong = await call('POST', '/api/context/days/2026-09-26', owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, PUT, DELETE')
    expect((await call('POST', '/api/context/days', owner)).allow()).toBe('GET')
  })
})
