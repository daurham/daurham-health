import { describe, expect, it } from 'vitest'
import {
  activityRangeSummary,
  activityShortTermChange,
  type ActivityDailyRow,
} from '../src/domain/activity/index.ts'

function day(date: string, values: Partial<Omit<ActivityDailyRow, 'date' | 'timezone'>> = {}): ActivityDailyRow {
  return {
    date,
    timezone: 'America/Phoenix',
    stepsCount: null,
    activeEnergyKcal: null,
    exerciseMinutes: null,
    walkingRunningDistanceM: null,
    restingHeartRateBpm: null,
    ...values,
  }
}

describe('activity range analytics', () => {
  it('does not treat a missing or NULL day as zero', () => {
    const rows = [day('2026-01-01', { stepsCount: 1000 }), day('2026-01-03', { stepsCount: 2000 })]
    const summary = activityRangeSummary(rows, '2026-01-01', '2026-01-03')
    expect(summary.calendarDays).toBe(3)
    expect(summary.steps.observedDays).toBe(2)
    expect(summary.steps.coveragePct).toBeCloseTo((2 / 3) * 100)
    expect(summary.steps.status).toBe('available')
    if (summary.steps.status === 'available') {
      expect(summary.steps.value).toBe(1500)
    }

    const withNullRow = activityRangeSummary(
      [...rows, day('2026-01-02', { stepsCount: null, activeEnergyKcal: 400 })],
      '2026-01-01',
      '2026-01-03',
    )
    expect(withNullRow.steps.observedDays).toBe(2)
    if (withNullRow.steps.status === 'available') {
      expect(withNullRow.steps.value).toBe(1500)
    }
  })

  it('keeps an explicit observed zero in the average', () => {
    const summary = activityRangeSummary(
      [day('2026-01-01', { stepsCount: 0 }), day('2026-01-02', { stepsCount: 2000 })],
      '2026-01-01',
      '2026-01-02',
    )
    expect(summary.steps.observedDays).toBe(2)
    if (summary.steps.status === 'available') {
      expect(summary.steps.value).toBe(1000)
    }
  })

  it('computes per-metric coverage independently', () => {
    const summary = activityRangeSummary(
      [
        day('2026-01-01', { stepsCount: 1000, exerciseMinutes: 10 }),
        day('2026-01-02', { stepsCount: 2000, activeEnergyKcal: 300, exerciseMinutes: 20 }),
        day('2026-01-03', { exerciseMinutes: 30 }),
      ],
      '2026-01-01',
      '2026-01-03',
    )
    expect(summary.steps.observedDays).toBe(2)
    expect(summary.activeEnergy.observedDays).toBe(1)
    expect(summary.exercise.observedDays).toBe(3)
    expect(summary.restingHeartRate.observedDays).toBe(0)
    expect(summary.restingHeartRate.status).toBe('insufficient_data')
    if (summary.steps.status === 'available') {
      expect(summary.steps.value).toBe(1500)
    }
    if (summary.activeEnergy.status === 'available') {
      expect(summary.activeEnergy.value).toBe(300)
    }
    if (summary.exercise.status === 'available') {
      expect(summary.exercise.value).toBe(20)
    }
  })

  it('uses the median of observed resting heart-rate days', () => {
    const summary = activityRangeSummary(
      [
        day('2026-01-01', { restingHeartRateBpm: 50 }),
        day('2026-01-02', { restingHeartRateBpm: 90 }),
        day('2026-01-03', { restingHeartRateBpm: 70 }),
        day('2026-01-04', { restingHeartRateBpm: 80 }),
        day('2026-01-05', { restingHeartRateBpm: 60 }),
      ],
      '2026-01-01',
      '2026-01-05',
    )
    expect(summary.restingHeartRate.status).toBe('available')
    if (summary.restingHeartRate.status === 'available') {
      expect(summary.restingHeartRate.value).toBe(70)
      expect(summary.restingHeartRate.basis).toBe('observed_median')
    }
  })

  it('marks walking/running distance unsupported and does not derive it', () => {
    const summary = activityRangeSummary(
      [day('2026-01-01', { walkingRunningDistanceM: 5000, stepsCount: 8000 })],
      '2026-01-01',
      '2026-01-01',
    )
    expect(summary.walkingRunningDistance.status).toBe('unsupported')
    expect(summary.walkingRunningDistance.observedDays).toBe(0)
    expect(summary.steps.status).toBe('available')
  })
})

describe('activity 7d vs previous 7d', () => {
  it('compares observed-day averages and RHR medians when both windows have enough days', () => {
    const rows: ActivityDailyRow[] = []
    for (let dayOffset = 1; dayOffset <= 7; dayOffset += 1) {
      const date = `2026-02-0${dayOffset}`
      rows.push(
        day(date, {
          stepsCount: 1000,
          activeEnergyKcal: 200,
          exerciseMinutes: 10,
          restingHeartRateBpm: 60 + dayOffset,
        }),
      )
    }
    for (let dayOffset = 8; dayOffset <= 14; dayOffset += 1) {
      const date = `2026-02-${String(dayOffset).padStart(2, '0')}`
      rows.push(
        day(date, {
          stepsCount: 2000,
          activeEnergyKcal: 400,
          exerciseMinutes: 20,
          restingHeartRateBpm: 50 + (dayOffset - 7),
        }),
      )
    }
    const change = activityShortTermChange(rows, '2026-02-14')
    expect(change.currentStart).toBe('2026-02-08')
    expect(change.currentEnd).toBe('2026-02-14')
    expect(change.previousStart).toBe('2026-02-01')
    expect(change.previousEnd).toBe('2026-02-07')
    expect(change.steps.status).toBe('available')
    if (change.steps.status === 'available') {
      expect(change.steps.value.current).toBe(2000)
      expect(change.steps.value.previous).toBe(1000)
      expect(change.steps.value.absoluteDelta).toBe(1000)
      expect(change.steps.value.percentDelta).toBe(100)
      expect(change.steps.value.currentCoverage.observedDays).toBe(7)
      expect(change.steps.value.previousCoverage.observedDays).toBe(7)
    }
    expect(change.restingHeartRate.status).toBe('available')
    if (change.restingHeartRate.status === 'available') {
      expect(change.restingHeartRate.value.previous).toBe(64)
      expect(change.restingHeartRate.value.current).toBe(54)
      expect(change.restingHeartRate.value.absoluteDelta).toBe(-10)
    }
    expect(change.walkingRunningDistance.status).toBe('unsupported')
  })

  it('returns insufficient_data when a 7-day window has fewer than 4 observed days', () => {
    const rows = [
      day('2026-02-01', { stepsCount: 1000 }),
      day('2026-02-02', { stepsCount: 1000 }),
      day('2026-02-03', { stepsCount: 1000 }),
      day('2026-02-04', { stepsCount: 1000 }),
      day('2026-02-08', { stepsCount: 2000 }),
      day('2026-02-09', { stepsCount: 2000 }),
      day('2026-02-10', { stepsCount: 2000 }),
    ]
    const change = activityShortTermChange(rows, '2026-02-14')
    expect(change.steps.status).toBe('insufficient_data')
    if (change.steps.status === 'insufficient_data') {
      expect(change.steps.required).toBe(4)
    }
  })
})
