import { describe, expect, it } from 'vitest'
import {
  formatCalendarRange,
  formatCompactCalendarDate,
  formatFullCalendarDate,
  formatWeekdayCalendarDate,
} from '../src/domain/calendar-format.ts'
import { formatBodyMass } from '../src/domain/body-metrics.ts'

describe('calendar date presentation', () => {
  it('formats a date-only value without shifting the calendar day', () => {
    expect(formatCompactCalendarDate('2026-09-22')).toBe('Sep 22')
    expect(formatFullCalendarDate('2026-09-22')).toBe('Sep 22, 2026')
    expect(formatWeekdayCalendarDate('2026-09-22')).toBe('Tuesday, Sep 22')
  })

  it('formats same-month, cross-month, and cross-year ranges', () => {
    expect(formatCalendarRange('2026-09-15', '2026-09-21')).toBe('Sep 15–21')
    expect(formatCalendarRange('2026-08-29', '2026-09-04')).toBe('Aug 29–Sep 4')
    expect(formatCalendarRange('2025-12-29', '2026-01-04')).toBe('Dec 29, 2025–Jan 4, 2026')
  })
})

describe('body mass display', () => {
  it('converts stored kilograms to pounds and leaves pounds alone', () => {
    expect(formatBodyMass(86.6, 'kg')).toBe('190.9 lb')
    expect(formatBodyMass(190.94, 'lb')).toBe('190.9 lb')
    expect(formatBodyMass(29.6, 'percent')).toBe('29.6 percent')
  })
})
