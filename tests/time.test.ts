import { describe, expect, it } from 'vitest'
import { calendarDateFromInstant } from '../src/domain/progress/dates.ts'
import {
  HEALTH_CALENDAR_TIME_ZONE,
  assertIanaTimeZone,
  healthCalendarDateFromInstant,
  parseWallClockInTimeZone,
} from '../src/domain/time.ts'

describe('timezone conversion', () => {
  it('rejects invalid timezones', () => {
    expect(() => assertIanaTimeZone('Not/AZone')).toThrow('Invalid timezone')
  })

  it('converts America/Phoenix wall-clock time to an absolute instant', () => {
    const instant = parseWallClockInTimeZone('09/20/2026 09:13:07', 'America/Phoenix')
    expect(instant.toISOString()).toBe('2026-09-20T16:13:07.000Z')
  })
})

describe('canonical Health timezone', () => {
  it('uses America/Phoenix for calendar-day bucketing', () => {
    expect(HEALTH_CALENDAR_TIME_ZONE).toBe('America/Phoenix')
  })

  it('does not shift Phoenix calendar dates across the Pacific DST boundary', () => {
    // 2026-11-01 02:00 America/Los_Angeles falls back from PDT to PST.
    // Phoenix stays UTC-7, so 07:30Z is 00:30 the next Phoenix calendar day.
    const afterFallback = new Date('2026-11-02T07:30:00.000Z')
    expect(healthCalendarDateFromInstant(afterFallback)).toBe('2026-11-02')
    expect(calendarDateFromInstant(afterFallback, 'America/Los_Angeles')).toBe('2026-11-01')
    expect(afterFallback.toISOString()).toBe('2026-11-02T07:30:00.000Z')
  })

  it('keeps Phoenix and Los Angeles on the same calendar day while PDT is in effect', () => {
    const summer = new Date('2026-09-21T06:30:00.000Z')
    expect(healthCalendarDateFromInstant(summer)).toBe('2026-09-20')
    expect(calendarDateFromInstant(summer, 'America/Los_Angeles')).toBe('2026-09-20')
  })
})
