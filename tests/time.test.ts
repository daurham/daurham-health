import { describe, expect, it } from 'vitest'
import { assertIanaTimeZone, parseWallClockInTimeZone } from '../src/domain/time.ts'

describe('timezone conversion', () => {
  it('rejects invalid timezones', () => {
    expect(() => assertIanaTimeZone('Not/AZone')).toThrow('Invalid timezone')
  })

  it('converts America/Phoenix wall-clock time to an absolute instant', () => {
    const instant = parseWallClockInTimeZone('09/20/2026 09:13:07', 'America/Phoenix')
    expect(instant.toISOString()).toBe('2026-09-20T16:13:07.000Z')
  })
})
