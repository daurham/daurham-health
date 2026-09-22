import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { activityRangeSummary, activityShortTermChange, type ActivityDailyRow } from '../src/domain/activity/index.ts'
import { buildActivityProgressView } from '../src/domain/activity/progress-view.ts'
import { healthCalendarDateFromInstant } from '../src/domain/time.ts'
import { buildProgressCompare, buildSinceCheckpointCompare, comparePeriod } from '../src/domain/progress/compare.ts'
import { buildProgressTimeline, timelineEventsForFocus } from '../src/domain/progress/timeline.ts'
import type { ProgressCanonicalInput, ProgressCheckpoint } from '../src/domain/progress/index.ts'
import type { ProgressSleepObservation } from '../src/domain/progress/health-timeline.ts'
import { ActivitySection } from '../src/features/progress/ActivitySection.tsx'
import { TimelineSection } from '../src/features/progress/TimelineSection.tsx'

function day(date: string, values: Partial<ActivityDailyRow> = {}): ActivityDailyRow {
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

function night(partial: Partial<ProgressSleepObservation> & Pick<ProgressSleepObservation, 'sleepDate' | 'observationStatus'>): ProgressSleepObservation {
  return {
    sourceName: 'Apple Watch',
    startAt: `${partial.sleepDate}T06:00:00.000Z`,
    endAt: `${partial.sleepDate}T14:00:00.000Z`,
    totalSleepMinutes: partial.observationStatus === 'partial_observation' ? 82 : 592,
    timeInBedMinutes: 600,
    coreMinutes: null,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
    analysisEligible: partial.observationStatus === 'analysis_eligible',
    stageAnalysisEligible: false,
    ...partial,
  }
}

function canonical(extra: Partial<ProgressCanonicalInput> = {}): ProgressCanonicalInput {
  return {
    asOf: '2026-09-22',
    range: '30d',
    exercises: [],
    sets: [],
    workouts: [],
    bodyObservations: [],
    today: '2026-09-22',
    ...extra,
  }
}

describe('current-day activity semantics', () => {
  const rows = [
    day('2026-09-21', { stepsCount: 8000, activeEnergyKcal: 400, exerciseMinutes: 30, restingHeartRateBpm: 60 }),
    day('2026-09-22', { stepsCount: 129, activeEnergyKcal: 20, exerciseMinutes: 2, restingHeartRateBpm: 70 }),
    day('2026-09-20', { stepsCount: 0, restingHeartRateBpm: 50 }),
  ]

  it('keeps today visible and provisional without using it in completed-day aggregates', () => {
    const summary = activityRangeSummary(rows, '2026-09-20', '2026-09-22', 'America/Phoenix', '2026-09-22')
    expect(summary.calendarDays).toBe(3)
    expect(summary.completedCalendarDays).toBe(2)
    expect(summary.steps.observedDays).toBe(2)
    expect(summary.steps.coveragePct).toBe(100)
    if (summary.steps.status === 'available') {
      expect(summary.steps.value).toBe(4000)
    }
    expect(summary.restingHeartRate.status).toBe('available')
    if (summary.restingHeartRate.status === 'available') {
      expect(summary.restingHeartRate.value).toBe(55)
    }
    const view = buildActivityProgressView(rows, { range: '30d', asOf: '2026-09-22', today: '2026-09-22' })
    const todayPoint = view.steps.series.find((point) => point.date === '2026-09-22')
    expect(todayPoint).toMatchObject({ value: 129, provisional: true })
    expect(view.provisionalDay?.stepsCount).toBe(129)
    const recent = activityShortTermChange(
      [
        ...['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13', '2026-09-14'].map((date) =>
          day(date, { stepsCount: 2000 }),
        ),
        ...['2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21'].map((date) =>
          day(date, { stepsCount: 1000 }),
        ),
        day('2026-09-22', { stepsCount: 129 }),
      ],
      '2026-09-22',
      '2026-09-22',
    )
    expect(recent.currentEnd).toBe('2026-09-21')
    expect(recent.currentStart).toBe('2026-09-15')
    expect(recent.previousEnd).toBe('2026-09-14')
    expect(recent.previousStart).toBe('2026-09-08')
    expect(recent.steps.status).toBe('available')
    if (recent.steps.status === 'available') {
      expect(recent.steps.value.current).toBe(1000)
      expect(recent.steps.value.previous).toBe(2000)
    }
    const html = renderToStaticMarkup(<ActivitySection view={view} />)
    expect(html).toContain('Today · 129 so far')
    expect(html).toContain('4,000 avg/day')
    expect(html).toContain('completed days observed')
  })

  it('does not treat a historical end date as provisional and keeps an explicit zero', () => {
    const summary = activityRangeSummary(rows, '2026-09-20', '2026-09-22', 'America/Phoenix', '2026-09-23')
    expect(summary.completedCalendarDays).toBe(3)
    if (summary.steps.status === 'available') {
      expect(summary.steps.value).toBeCloseTo((0 + 8000 + 129) / 3)
    }
    const historical = activityShortTermChange(rows, '2026-09-21', '2026-09-22')
    expect(historical.currentEnd).toBe('2026-09-21')
    expect(healthCalendarDateFromInstant(new Date('2026-09-22T06:30:00.000Z'))).toBe('2026-09-21')
    const phoenixToday = activityRangeSummary(
      [day('2026-09-21', { stepsCount: 100 }), day('2026-09-22', { stepsCount: 9000 })],
      '2026-09-21',
      '2026-09-21',
      'America/Phoenix',
      '2026-09-21',
    )
    expect(phoenixToday.steps.observedDays).toBe(0)
    expect(phoenixToday.completedCalendarDays).toBe(0)
  })
})

describe('activity and sleep timeline', () => {
  it('adds activity days, partial and complete sleep, and keeps Apple workouts out of training', () => {
    const timeline = buildProgressTimeline(
      canonical({
        range: '1y',
        workouts: [
          {
            sessionId: 'session-1',
            sessionDate: '2026-09-20',
            createdAt: '2026-09-20T18:00:00.000Z',
            templateName: 'Upper',
          },
        ],
        activityDays: [
          day('2026-09-21', { stepsCount: 7431, activeEnergyKcal: 428, exerciseMinutes: 37, restingHeartRateBpm: 58 }),
          day('2026-09-22', { stepsCount: 129 }),
        ],
        sleepNights: [
          night({ sleepDate: '2026-06-14', observationStatus: 'analysis_eligible', totalSleepMinutes: 592 }),
          night({ sleepDate: '2026-08-21', observationStatus: 'partial_observation', totalSleepMinutes: 82 }),
          night({ sleepDate: '2026-08-20', observationStatus: 'in_bed_only', analysisEligible: false, totalSleepMinutes: null }),
        ],
        activityWorkouts: [
          {
            id: 'walk-1',
            activityType: 'HKWorkoutActivityTypeWalking',
            startAt: '2026-09-21T18:00:00.000Z',
            endAt: '2026-09-21T18:40:00.000Z',
            durationMinutes: 40,
            energyKcal: 180,
          },
          {
            id: 'strength-1',
            activityType: 'HKWorkoutActivityTypeTraditionalStrengthTraining',
            startAt: '2026-09-20T17:00:00.000Z',
            endAt: '2026-09-20T18:00:00.000Z',
            durationMinutes: 60,
            energyKcal: 300,
          },
        ],
      }),
    )
    const activity = timeline.events.find((event) => event.kind === 'activity_day' && event.date === '2026-09-21')
    expect(activity && activity.kind === 'activity_day' ? activity.data.stepsCount : null).toBe(7431)
    expect(activity && activity.kind === 'activity_day' ? activity.data.activeEnergyKcal : null).toBe(428)
    expect(activity && activity.kind === 'activity_day' ? activity.timePrecision : null).toBe('date')
    expect(activity && activity.kind === 'activity_day' ? activity.occurredAt : 'present').toBeUndefined()
    const today = timeline.events.find((event) => event.kind === 'activity_day' && event.date === '2026-09-22')
    expect(today && today.kind === 'activity_day' ? today.data.provisional : false).toBe(true)
    expect(today && today.kind === 'activity_day' ? today.data.activeEnergyKcal : 0).toBeNull()
    const sleep = timeline.events.filter((event) => event.kind === 'sleep_night')
    expect(sleep.map((event) => (event.kind === 'sleep_night' ? event.data.status : ''))).toEqual([
      'partial_observation',
      'analysis_eligible',
    ])
    expect(timeline.events.some((event) => event.kind === 'sleep_night' && event.date === '2026-08-20')).toBe(false)
    const apple = timeline.events.find((event) => event.kind === 'activity_workout' && event.id.endsWith('strength-1'))
    expect(apple?.domain).toBe('activity')
    expect(apple && apple.kind === 'activity_workout' ? apple.data.label : '').toBe('Strength')
    expect(timeline.events.filter((event) => event.kind === 'training_session')).toHaveLength(1)
    expect(timelineEventsForFocus(timeline, 'activity').every((event) => event.domain === 'activity')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'activity').some((event) => event.kind === 'activity_workout')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'all').some((event) => event.kind === 'activity_workout')).toBe(false)
    expect(timelineEventsForFocus(timeline, 'all').some((event) => event.kind === 'activity_day')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'sleep').every((event) => event.kind === 'sleep_night')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'training').some((event) => event.kind === 'activity_workout')).toBe(false)
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TimelineSection timeline={timeline} range="1y" onEvidence={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Today · in progress')
    expect(html).toContain('7,431 steps')
    expect(html).not.toContain('0 active kcal')
    expect(html).toContain('Sleep observation')
    expect(html).toContain('Partial')
    expect(html).toContain('Activity')
    expect(html).toContain('Sleep')
  })
})

describe('activity and sleep compare and checkpoints', () => {
  const checkpoint: ProgressCheckpoint = {
    id: '11111111-1111-4111-8111-111111111111',
    checkpointDate: '2026-09-01',
    label: 'Cut',
    notes: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  }

  it('compares completed-day averages and excludes today, partial sleep, and raw totals', () => {
    const activityDays = [
      day('2026-09-01', { stepsCount: 1000, restingHeartRateBpm: 50 }),
      day('2026-09-02', { stepsCount: 1000, restingHeartRateBpm: 70 }),
      day('2026-09-03', { stepsCount: 1000, restingHeartRateBpm: 60 }),
      day('2026-09-11', { stepsCount: 2000 }),
      day('2026-09-12', { stepsCount: 2000 }),
      day('2026-09-22', { stepsCount: 129, restingHeartRateBpm: 99 }),
    ]
    const result = buildProgressCompare({
      canonical: canonical({
        activityDays,
        sleepNights: [
          night({ sleepDate: '2026-09-02', observationStatus: 'analysis_eligible', totalSleepMinutes: 480 }),
          night({ sleepDate: '2026-09-12', observationStatus: 'partial_observation', totalSleepMinutes: 82 }),
          night({ sleepDate: '2026-09-13', observationStatus: 'analysis_eligible', totalSleepMinutes: 420, stageAnalysisEligible: false }),
        ],
      }),
      periodA: comparePeriod('2026-09-01', '2026-09-03'),
      periodB: comparePeriod('2026-09-11', '2026-09-22'),
    })
    expect(result.health.activity.b.completedCalendarDays).toBe(11)
    expect(result.health.activity.b.steps.status).toBe('available')
    if (result.health.activity.b.steps.status === 'available') {
      expect(result.health.activity.b.steps.value).toBe(2000)
    }
    expect(result.health.activity.a.restingHeartRate.status).toBe('available')
    if (result.health.activity.a.restingHeartRate.status === 'available') {
      expect(result.health.activity.a.restingHeartRate.value).toBe(60)
    }
    expect(result.health.activity.steps.status).toBe('available')
    if (result.health.activity.steps.status === 'available') {
      expect(result.health.activity.steps.value.absolute).toBe(1000)
    }
    expect(JSON.stringify(result.health.activity)).not.toContain('cumulative')
    expect(result.health.sleep.b.analysisEligibleNights).toBe(1)
    if (result.health.sleep.b.averageTotalSleepMinutes.status === 'available') {
      expect(result.health.sleep.b.averageTotalSleepMinutes.value).toBe(420)
    }
    expect(result.health.sleep.b.partialObservations).toBe(1)
    expect(result.health.sleep.stagesComparable).toBe(false)
    const unequal = buildProgressCompare({
      canonical: canonical({
        today: '2026-10-01',
        activityDays: [
          day('2026-09-01', { stepsCount: 1000 }),
          day('2026-09-02', { stepsCount: 1000 }),
          day('2026-09-03', { stepsCount: 1000 }),
          day('2026-09-04', { stepsCount: 1000 }),
          day('2026-09-05', { stepsCount: 1000 }),
          day('2026-09-06', { stepsCount: 1000 }),
          day('2026-09-07', { stepsCount: 1000 }),
          day('2026-09-08', { stepsCount: 1000 }),
          day('2026-09-09', { stepsCount: 1000 }),
          day('2026-09-10', { stepsCount: 1000 }),
          day('2026-09-11', { stepsCount: 1000 }),
          day('2026-09-12', { stepsCount: 1000 }),
          day('2026-09-13', { stepsCount: 1000 }),
        ],
      }),
      periodA: comparePeriod('2026-09-01', '2026-09-10'),
      periodB: comparePeriod('2026-09-11', '2026-09-13'),
    })
    expect(unequal.health.activity.a.steps.status).toBe('available')
    expect(unequal.health.activity.b.steps.status).toBe('available')
    if (unequal.health.activity.a.steps.status === 'available' && unequal.health.activity.b.steps.status === 'available') {
      expect(unequal.health.activity.a.steps.value).toBe(1000)
      expect(unequal.health.activity.b.steps.value).toBe(1000)
    }
    if (unequal.health.activity.steps.status === 'available') {
      expect(unequal.health.activity.steps.value.absolute).toBe(0)
    }
  })

  it('summarizes the checkpoint interval and does not invent a sleep baseline', () => {
    const result = buildSinceCheckpointCompare({
      canonical: canonical({
        activityDays: [
          day('2026-09-01', { stepsCount: 5000 }),
          day('2026-09-10', { stepsCount: 7000 }),
          day('2026-09-22', { stepsCount: 129 }),
        ],
        sleepNights: [night({ sleepDate: '2026-09-10', observationStatus: 'partial_observation', totalSleepMinutes: 82 })],
      }),
      checkpoint,
      asOf: '2026-09-22',
    })
    expect(result.health.activity.a.steps.status).toBe('not_applicable')
    expect(result.health.activity.steps.status).toBe('not_applicable')
    expect(result.health.activity.b.steps.status).toBe('available')
    if (result.health.activity.b.steps.status === 'available') {
      expect(result.health.activity.b.steps.value).toBe(6000)
    }
    expect(result.health.sleep.a.averageTotalSleepMinutes.status).toBe('not_applicable')
    expect(result.health.sleep.b.analysisEligibleNights).toBe(0)
    expect(result.health.sleep.b.partialObservations).toBe(1)
    expect(result.health.sleep.totalSleep.status).toBe('not_applicable')
  })
})
