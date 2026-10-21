import { describe, expect, it } from 'vitest'
import type { HydrationEvent } from '../src/domain/daily-signals.ts'
import type { TodayViewModel } from '../src/domain/today/index.ts'
import { applyTodayHydrationEvent } from '../src/features/today/hydration-update.ts'

function today(totalOz: number | null, count: number): TodayViewModel {
  return {
    date: '2026-10-21',
    dailySignals: {
      hydration: { tracked: count > 0, totalOz, goalOz: 80, eventCount: count },
      bowel: { tracked: false, eventCount: null, noMovement: false, latestBristolType: null },
      wellness: { recorded: false, energy: null, hunger: null, soreness: null, stress: null },
    },
  } as TodayViewModel
}

function hydrationEvent(amountOz: number, date = '2026-10-21'): HydrationEvent {
  return { date, amountOz } as HydrationEvent
}

describe('Today immediate hydration feedback', () => {
  it('updates only water and goal progress after a server-confirmed quick log', () => {
    const before = today(24, 3)
    const after = applyTodayHydrationEvent(before, hydrationEvent(16))
    expect(after.dailySignals?.hydration).toEqual({ tracked: true, totalOz: 40, goalOz: 80, eventCount: 4 })
    expect(after.dailySignals?.bowel).toBe(before.dailySignals?.bowel)
    expect(after.dailySignals?.wellness).toBe(before.dailySignals?.wellness)
    expect(before.dailySignals?.hydration.totalOz).toBe(24)
  })
  it('accepts the first log with no earlier hydration events', () => {
    const after = applyTodayHydrationEvent(today(null, 0), hydrationEvent(8))
    expect(after.dailySignals?.hydration.totalOz).toBe(8)
    expect(after.dailySignals?.hydration.tracked).toBe(true)
  })
  it('never adds another date\'s event to the displayed day', () => {
    const before = today(24, 3)
    expect(applyTodayHydrationEvent(before, hydrationEvent(16, '2026-10-20'))).toBe(before)
  })
})
