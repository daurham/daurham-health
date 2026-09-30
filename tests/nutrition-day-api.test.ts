import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleNutritionDay } from '../server/handlers/nutrition-day.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  parseNutritionDayQuery: vi.fn(),
  getNutritionDay: vi.fn(),
}))

vi.mock('../server/nutrition/service.ts', () => service)

function request(url: string): ApiRequest {
  return { method: 'GET', url, headers: {}, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function response() {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let status = 200
  let body: unknown
  res.status = (code: number) => {
    status = code
    return res
  }
  res.json = ((value: unknown) => {
    body = value
    return res
  }) as ApiResponse['json']
  return { res, status: () => status, body: () => body }
}

describe('Nutrition day local/prod query parity', () => {
  beforeEach(() => {
    service.parseNutritionDayQuery.mockReset()
    service.getNutritionDay.mockReset()
    service.parseNutritionDayQuery.mockImplementation((value: string | null) => value)
    service.getNutritionDay.mockImplementation(async (date: string) => ({ date }))
  })

  it('reads the date from a Vite-style request URL when req.query is absent', async () => {
    const captured = response()
    await handleNutritionDay(request('/api/nutrition/day?date=2026-09-28'), captured.res)
    expect(captured.status()).toBe(200)
    expect(service.parseNutritionDayQuery).toHaveBeenCalledWith('2026-09-28')
    expect(service.getNutritionDay).toHaveBeenCalledWith('2026-09-28')
    expect(captured.body()).toEqual({ date: '2026-09-28' })
  })

  it('keeps a missing date missing rather than inventing one in the handler', async () => {
    const captured = response()
    await handleNutritionDay(request('/api/nutrition/day'), captured.res)
    expect(service.parseNutritionDayQuery).toHaveBeenCalledWith(null)
  })
})
