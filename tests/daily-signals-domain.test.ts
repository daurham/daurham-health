import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  dailySignalDateError,
  millilitersToOunces,
  hydrationGoalProgress,
  normalizeHydrationGoalWrite,
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


describe('check-in mobile controls', () => {
  it('uses bounded rating buttons and a click-to-view Bristol reference', () => {
    const source = readFileSync('src/features/daily-signals/DailyCheckInPage.tsx', 'utf8')
    const guide = readFileSync('src/features/daily-signals/BristolReferenceChart.tsx', 'utf8')
    expect(source).toContain('grid-cols-5 gap-2')
    expect(source).toContain('aria-pressed={wellness[key] === value}')
    expect(source).toContain('BristolReferenceChart')
    expect(guide).toContain('Watery')
  })
})

describe('daily water goal preference', () => {
  it('validates configurable ounces with a bounded value and canonical ml storage', () => {
    expect(normalizeHydrationGoalWrite({ goalOz: 80 })).toEqual({
      targetMl: Math.round(ouncesToMilliliters(80) * 100) / 100,
    })
    for (const goalOz of [0, -2, NaN, Infinity, 400, '80']) {
      expect(normalizeHydrationGoalWrite({ goalOz })).toHaveProperty('error')
    }
  })

  it('keeps missing/unconfigured data distinct from tracked intake and supports over-goal progress', () => {
    expect(hydrationGoalProgress(null, 80)).toBeNull()
    expect(hydrationGoalProgress(20, null)).toBeNull()
    expect(hydrationGoalProgress(40, 80)).toEqual({
      progressPercent: 50, remainingOz: 40, overGoalOz: 0,
    })
    expect(hydrationGoalProgress(96, 80)).toEqual({
      progressPercent: 120, remainingOz: 0, overGoalOz: 16,
    })
    expect(todayDailySignalsFromDay({
      date: '2026-10-11', hydrationEvents: [], hydrationGoalOz: 80,
      bowelEvents: [], noBowelMovement: false, wellness: null,
    }).hydration).toEqual({ tracked: false, totalOz: null, goalOz: 80, eventCount: 0 })
  })
})
