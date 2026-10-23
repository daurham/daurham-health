import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import { todayWeeklyHealth } from '../src/domain/today/recent-health.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/view.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import type { ActivityDailyRow } from '../src/domain/activity/analytics.ts'
import type { ProgressSleepObservation } from '../src/domain/progress/health-timeline.ts'

const asOf = '2026-10-22'
const tz = 'America/Phoenix'
const day = (date: string, bpm: number | null): ActivityDailyRow => ({
  date, timezone: tz, stepsCount: null, activeEnergyKcal: null, exerciseMinutes: null,
  walkingRunningDistanceM: null, restingHeartRateBpm: bpm,
})
const sleep = (date: string, minutes: number | null, complete = true): ProgressSleepObservation => ({
  sleepDate: date, sourceName: 'Apple Watch', startAt: date + 'T02:00:00Z',
  endAt: date + 'T11:00:00Z', totalSleepMinutes: minutes, timeInBedMinutes: minutes,
  coreMinutes: null, deepMinutes: null, remMinutes: null, unspecifiedSleepMinutes: null,
  analysisEligible: complete, stageAnalysisEligible: false,
  observationStatus: complete ? 'analysis_eligible' : 'partial_observation',
})
const currentDays = Array.from({ length: 7 }, (_, i) => addCalendarDays(asOf, i - 7))
const previousDays = Array.from({ length: 7 }, (_, i) => addCalendarDays(asOf, i - 14))

describe('Today weekly observed health', () => {
  it('uses medians for completed RHR days and only compares windows with sufficient coverage', () => {
    const rows = [
      ...previousDays.map((date) => day(date, 70)),
      ...currentDays.map((date, i) => day(date, [56, 58, 60, 62, 64, 66, 120][i]!)),
      day(asOf, 95),
    ]
    const week = todayWeeklyHealth({ asOf, timezone: tz, activityDays: rows, sleepNights: [] }).restingHeartRate
    expect(week.value).toBe(62)
    expect(week.changeBpm).toBe(-8)
    expect(week.start).toBe('2026-10-15')
    expect(week.end).toBe('2026-10-21')
    expect(week.points).toHaveLength(7)
    expect(week.points.every((point) => point.date !== asOf)).toBe(true)
  })

  it('shows sparse coverage but declines comparison and never treats missing as zero', () => {
    const week = todayWeeklyHealth({
      asOf, timezone: tz, activityDays: [day(currentDays[0]!, 57), day(currentDays[3]!, null), day(asOf, 99)],
      sleepNights: [],
    }).restingHeartRate
    expect(week.value).toBe(57)
    expect(week.observedDays).toBe(1)
    expect(week.changeBpm).toBeNull()
    expect(week.points.filter((point) => point.value === null)).toHaveLength(6)
  })

  it('uses complete observed sleep only, keeping partial records as missing gaps', () => {
    const week = todayWeeklyHealth({
      asOf, timezone: tz, activityDays: [],
      sleepNights: [sleep(currentDays[0]!, 450), sleep(currentDays[1]!, 600),
        sleep(currentDays[2]!, 80, false), sleep(asOf, 700)],
    }).sleep
    expect(week.value).toBe(525)
    expect(week.observedDays).toBe(2)
    expect(week.points[2]?.value).toBeNull()
    expect(week.points.filter((point) => point.value !== null)).toHaveLength(2)
  })

  it('renders actual coverage, quick actions and themed bars in Today', () => {
    const activityDays = currentDays.map((date) => day(date, 58))
    const view = buildTodayView({
      now: new Date('2026-10-22T18:00:00Z'), calendarTimeZone: tz, activityDays,
      nutritionEntries: [], nutritionTargets: [], trainingToday: [], trainingSessions: [],
      sleepNights: [sleep(currentDays[0]!, 480)], latestCompleteSleep: null,
      bodyWeights: [], pendingJobs: [],
    } satisfies TodaySources)
    const html = renderToStaticMarkup(<MemoryRouter><TodayBoard view={view} /></MemoryRouter>)
    expect(html).toContain('58')
    expect(html).toContain('bpm median')
    expect(html).toContain('7/7 days observed')
    expect(html).toContain('8h')
    expect(html).toContain('1/7 complete nights')
    expect(html).toContain('today-week-bars')
    expect(html).toContain('Add food')
    expect(html).toContain('Daily Essentials')
  })
})
