import { describe, expect, it } from 'vitest'
import {
  dailySignalDateError,
  millilitersToOunces,
  normalizeBowelWrite,
  normalizeHydrationWrite,
  normalizeWellnessWrite,
  ouncesToMilliliters,
  todayDailySignalsFromDay,
} from '../src/domain/daily-signals.ts'

describe('I2 Daily Signals domain', () => {
  it('round-trips owner-facing water ounces through canonical milliliters', () => {
    expect(millilitersToOunces(ouncesToMilliliters(16))).toBeCloseTo(16, 8)
  })

  it('keeps missing different from zero', () => {
    const snapshot = todayDailySignalsFromDay(null)
    expect(snapshot.hydration.tracked).toBe(false)
    expect(snapshot.hydration.totalOz).toBeNull()
    expect(snapshot.bowel.tracked).toBe(false)
    expect(snapshot.bowel.eventCount).toBeNull()
  })

  it('represents explicit no-BM as a tracked zero day', () => {
    const snapshot = todayDailySignalsFromDay({
      date: '2026-10-06',
      hydrationEvents: [],
      bowelEvents: [],
      noBowelMovement: true,
      wellness: null,
    })
    expect(snapshot.bowel.tracked).toBe(true)
    expect(snapshot.bowel.eventCount).toBe(0)
    expect(snapshot.bowel.noMovement).toBe(true)
  })

  it('validates canonical writes', () => {
    expect(normalizeHydrationWrite({ date: '2026-10-06', amountOz: 16 })).toMatchObject({ date: '2026-10-06' })
    expect(normalizeBowelWrite({ date: '2026-10-06', bristolType: 4 })).toMatchObject({ bristolType: 4 })
    expect(normalizeWellnessWrite({ energy: 3, hunger: 4, soreness: 2, stress: null })).toEqual({
      energy: 3,
      hunger: 4,
      soreness: 2,
      stress: null,
    })
  })

  it('rejects future Health dates', () => {
    expect(dailySignalDateError('2026-10-07', '2026-10-06')).toMatch(/today or an earlier/)
  })
})
