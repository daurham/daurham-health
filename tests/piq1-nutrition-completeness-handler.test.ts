import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, wrapNodeResponse, type ApiRequest } from '../server/http.js'
import handler from '../server/handlers/nutrition-day-completeness.js'

const fixtures = vi.hoisted(() => ({
  auth: vi.fn(),
  get: vi.fn(),
  save: vi.fn(),
}))
vi.mock('../server/auth/owner.js', () => ({ requireHealthOwner: fixtures.auth }))
vi.mock('../server/nutrition/day-completeness.js', () => ({
  getNutritionDayCompleteness: fixtures.get,
  saveNutritionDayCompleteness: fixtures.save,
}))

function request(method: string, url: string, body?: unknown): ApiRequest {
  return {
    method, url, body, headers: body ? { 'content-type': 'application/json' } : {},
    async *[Symbol.asyncIterator]() {},
  } as ApiRequest
}
function response() {
  const response = wrapNodeResponse(new ServerResponse(new IncomingMessage(new Socket())))
  let status = 200
  let body: unknown
  response.status = (code: number) => { status = code; return response }
  response.json = (data: unknown) => { body = data } 
  return { res: response, status: () => status, body: () => body }
}

describe('PIQ-1.1 authenticated nutrition day confirmation HTTP route', () => {
  beforeEach(() => {
    fixtures.auth.mockReset().mockResolvedValue({ owner: true })
    fixtures.get.mockReset().mockResolvedValue({ date: '2026-10-13', ownerReport: null })
    fixtures.save.mockReset().mockResolvedValue({ date: '2026-10-13', ownerReport: 'partial' })
  })

  it('GET requires owner authorization before any DB read', async () => {
    fixtures.auth.mockRejectedValue(new HttpError(401, 'Sign-in required', undefined, 'OWNER_REQUIRED'))
    const result = response()
    await handler(request('GET', '/api/nutrition/day/completeness?date=2026-10-13'), result.res)
    expect(result.status()).toBe(401)
    expect(result.body()).toMatchObject({ code: 'OWNER_REQUIRED' })
    expect(fixtures.get).not.toHaveBeenCalled()
  })

  it('authenticated GET looks up precisely the requested calendar date', async () => {
    const result = response()
    await handler(request('GET', '/api/nutrition/day/completeness?date=2026-10-13'), result.res)
    expect(result.status()).toBe(200)
    expect(fixtures.auth).toHaveBeenCalledTimes(1)
    expect(fixtures.get).toHaveBeenCalledWith('2026-10-13')
    expect(result.body()).toEqual({ day: { date: '2026-10-13', ownerReport: null } })
  })

  it('authenticated PUT passes a revision/version-bound confirmation payload to the service', async () => {
    const payload = { date: '2026-10-13', ownerReport: 'partial',
      expectedRevision: 'a'.repeat(64), expectedVersion: 0 }
    const result = response()
    await handler(request('PUT', '/api/nutrition/day/completeness', payload), result.res)
    expect(result.status()).toBe(200)
    expect(fixtures.save).toHaveBeenCalledWith(payload)
    expect(result.body()).toEqual({ day: { date: '2026-10-13', ownerReport: 'partial' } })
  })

  it('PUT cannot write without owner authorization', async () => {
    fixtures.auth.mockRejectedValue(new HttpError(403, 'Forbidden', undefined, 'OWNER_FORBIDDEN'))
    const result = response()
    await handler(request('PUT', '/api/nutrition/day/completeness',
      { date: '2026-10-13', ownerReport: 'complete' }), result.res)
    expect(result.status()).toBe(403)
    expect(fixtures.save).not.toHaveBeenCalled()
  })

  it('passes through stale-write 409 without leaking SQL internals', async () => {
    fixtures.save.mockRejectedValue(new HttpError(409,
      'Food log or confirmation changed. Refresh and review again.',
      undefined, 'NUTRITION_COMPLETENESS_STALE'))
    const result = response()
    await handler(request('PUT', '/api/nutrition/day/completeness', { date: '2026-10-13' }), result.res)
    expect(result.status()).toBe(409)
    expect(result.body()).toMatchObject({ code: 'NUTRITION_COMPLETENESS_STALE' })
  })

  it('rejects unsupported methods and absent calendar date', async () => {
    const badMethod = response()
    await handler(request('DELETE', '/api/nutrition/day/completeness'), badMethod.res)
    expect(badMethod.status()).toBe(405)
    expect(fixtures.save).not.toHaveBeenCalled()
    const badDate = response()
    await handler(request('GET', '/api/nutrition/day/completeness'), badDate.res)
    expect(badDate.status()).toBe(400)
    expect(fixtures.get).not.toHaveBeenCalled()
  })
})
