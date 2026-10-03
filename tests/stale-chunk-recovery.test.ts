import { describe, expect, it, vi } from 'vitest'
import { isStaleChunkError, reloadForStaleChunkOnce } from '../src/lib/stale-chunk-recovery'

function storage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value)
    },
  }
}

function location() {
  return {
    pathname: '/nutrition',
    search: '?date=2026-10-03',
    hash: '',
    reload: vi.fn(),
  }
}

describe('stale chunk recovery', () => {
  it('recognizes stale deployment module failures', () => {
    expect(isStaleChunkError(new TypeError("'text/html' is not a valid JavaScript MIME type."))).toBe(true)
    expect(isStaleChunkError(new TypeError('Failed to fetch dynamically imported module: /assets/Nutrition-abc.js'))).toBe(true)
    expect(isStaleChunkError(new Error('ordinary application failure'))).toBe(false)
  })

  it('reloads only once for the same route inside the recovery window', () => {
    const session = storage()
    const page = location()
    const error = new TypeError("'text/html' is not a valid JavaScript MIME type.")

    expect(reloadForStaleChunkOnce(error, { storage: session, location: page, now: 10_000 })).toBe(true)
    expect(page.reload).toHaveBeenCalledTimes(1)

    expect(reloadForStaleChunkOnce(error, { storage: session, location: page, now: 20_000 })).toBe(false)
    expect(page.reload).toHaveBeenCalledTimes(1)

    expect(reloadForStaleChunkOnce(error, { storage: session, location: page, now: 80_001 })).toBe(true)
    expect(page.reload).toHaveBeenCalledTimes(2)
  })
})
