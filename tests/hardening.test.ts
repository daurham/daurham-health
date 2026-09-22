import { describe, expect, it, vi } from 'vitest'
import { safeReturnPath } from '../src/auth/return-path.ts'
import { finiteChartDomain } from '../src/features/progress/chart-domain.ts'
import { OWNER_AUTH_REQUIRED, healthFetch, publicErrorMessage } from '../src/lib/health-api.ts'

describe('owner return path', () => {
  it('keeps in-app destinations and rejects external or auth paths', () => {
    expect(safeReturnPath('/nutrition?date=2026-09-22')).toBe('/nutrition?date=2026-09-22')
    expect(safeReturnPath('/progress/sleep?range=30d')).toBe('/progress/sleep?range=30d')
    expect(safeReturnPath('https://example.com/nutrition')).toBeNull()
    expect(safeReturnPath('//example.com')).toBeNull()
    expect(safeReturnPath('/sign-in')).toBeNull()
    expect(safeReturnPath('/reset-password?token=abc')).toBeNull()
  })
})

describe('public error copy', () => {
  it('hides database, credential, and stack details', () => {
    expect(publicErrorMessage('Workout was not found')).toBe('Workout was not found')
    expect(publicErrorMessage('select id from nutrition_entries')).toBe('Request failed')
    expect(publicErrorMessage('postgres://user:secret@host/db')).toBe('Request failed')
    expect(publicErrorMessage('at service.ts:12:3')).toBe('Request failed')
  })
})

describe('chart domains', () => {
  it('pads finite values and refuses an all-missing series', () => {
    expect(finiteChartDomain([10, 10])).toEqual([8, 12])
    expect(finiteChartDomain([Number.NaN, Number.POSITIVE_INFINITY])).toBeNull()
    expect(finiteChartDomain([])).toBeNull()
  })
})

describe('expired owner session', () => {
  it('signals the app when a private request returns 401', async () => {
    const target = new EventTarget()
    const heard = vi.fn()
    target.addEventListener(OWNER_AUTH_REQUIRED, heard)
    vi.stubGlobal('window', target)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 401 }))
    try {
      const response = await healthFetch('/api/today')
      expect(response.status).toBe(401)
      expect(heard).toHaveBeenCalledOnce()
    } finally {
      fetchMock.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})
