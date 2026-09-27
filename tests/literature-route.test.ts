import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import literatureRoute, { handleLiteratureSearch } from '../server/handlers/ask-health-literature.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  searchLiterature: vi.fn(),
}))

vi.mock('../server/literature/service.ts', () => ({
  searchLiterature: service.searchLiterature,
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

function request(method: string, body?: unknown): ApiRequest {
  return { method, url: '/api/ask-health/literature', headers: {}, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; json: () => unknown } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown = null
  res.setHeader = (() => res) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = (body: unknown) => {
    payload = body
    return res
  }
  return { res, status: () => statusCode, json: () => payload }
}

describe('literature route', () => {
  beforeEach(() => {
    service.searchLiterature.mockReset()
    service.searchLiterature.mockResolvedValue({ sources: [], synthesis: null })
  })

  it('requires the owner and rejects the wrong method before a search', async () => {
    expect(matchHealthApiRoute('/api/ask-health/literature')).toBe('ask-health-literature')
    const anonymous = captureResponse()
    await withOwnerAuth(handleLiteratureSearch, {
      config: ownerConfig,
      readSession: async () => null,
    })(request('POST', { query: 'sleep' }), anonymous.res)
    expect(anonymous.status()).toBe(401)
    const other = captureResponse()
    await withOwnerAuth(handleLiteratureSearch, {
      config: ownerConfig,
      readSession: async () => ({ id: 'other', email: 'other@example.com' }),
    })(request('POST', { query: 'sleep' }), other.res)
    expect(other.status()).toBe(403)
    const wrong = captureResponse()
    await literatureRoute(request('GET'), wrong.res)
    expect(wrong.status()).toBe(405)
    expect(service.searchLiterature).not.toHaveBeenCalled()
    const owner = captureResponse()
    await withOwnerAuth(handleLiteratureSearch, {
      config: ownerConfig,
      readSession: async () => ({ id: 'owner-1', email: 'owner@example.com' }),
    })(request('POST', { query: 'sleep' }), owner.res)
    expect(owner.status()).toBe(200)
    expect(service.searchLiterature).toHaveBeenCalledTimes(1)
    const handler = readFileSync('server/handlers/ask-health-literature.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
  })
})
