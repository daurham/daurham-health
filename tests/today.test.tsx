import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { ActivityDailyRow } from '../src/domain/activity/analytics.ts'
import { SPEARMAN_MIN_PAIRS } from '../src/domain/intelligence/index.ts'
import { addCalendarDays } from '../src/domain/progress/dates.ts'
import type { BodyObservation } from '../src/domain/progress/types.ts'
import type { ProgressSleepObservation } from '../src/domain/progress/health-timeline.ts'
import { buildTodayView, type TodayNutritionEntry, type TodaySources } from '../src/domain/today/index.ts'
import { healthCalendarDateFromInstant } from '../src/domain/time.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

const PHOENIX_BOUNDARY = new Date('2026-09-22T06:30:00.000Z')

function activity(date: string, values: Partial<ActivityDailyRow> = {}): ActivityDailyRow {
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

function night(
  date: string,
  minutes: number | null,
  status: ProgressSleepObservation['observationStatus'],
): ProgressSleepObservation {
  return {
    sleepDate: date,
    sourceName: 'Apple Watch',
    startAt: `${date}T06:00:00.000Z`,
    endAt: `${date}T14:00:00.000Z`,
    totalSleepMinutes: minutes,
    timeInBedMinutes: minutes,
    coreMinutes: null,
    deepMinutes: null,
    remMinutes: null,
    unspecifiedSleepMinutes: null,
    analysisEligible: status === 'analysis_eligible',
    stageAnalysisEligible: false,
    observationStatus: status,
  }
}

function entry(date: string, values: Partial<TodayNutritionEntry>): TodayNutritionEntry {
  return {
    logDate: date,
    calories: 0,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
    ...values,
  }
}

function weight(date: string, value: number): BodyObservation {
  return {
    measurementId: date,
    measurementSessionId: date,
    key: 'weight',
    value,
    unit: 'lb',
    valueKind: 'scalar',
    measuredAt: `${date}T15:00:00.000Z`,
    timezone: 'America/Phoenix',
    calendarDate: date,
  }
}

function sources(partial: Partial<TodaySources> = {}): TodaySources {
  return {
    now: new Date('2026-09-22T18:00:00.000Z'),
    activityDays: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    sleepNights: [],
    latestCompleteSleep: null,
    bodyWeights: [],
    pendingJobs: [],
    ...partial,
  }
}

describe('today date', () => {
  it('uses the America/Phoenix calendar date across the UTC boundary', () => {
    expect(healthCalendarDateFromInstant(PHOENIX_BOUNDARY)).toBe('2026-09-21')
    const view = buildTodayView(sources({ now: PHOENIX_BOUNDARY }))
    expect(view.date).toBe('2026-09-21')
    expect(view.timezone).toBe('America/Phoenix')
    expect(SPEARMAN_MIN_PAIRS).toBe(20)
  })
})

describe('today activity', () => {
  it('shows provisional values, keeps an explicit zero, and omits missing metrics', () => {
    const view = buildTodayView(
      sources({
        activityDays: [activity('2026-09-22', { stepsCount: 129, activeEnergyKcal: 12.08, exerciseMinutes: 0 })],
      }),
    )
    expect(view.activity).toMatchObject({
      inProgress: true,
      steps: 129,
      activeEnergyKcal: 12.08,
      exerciseMinutes: 0,
      restingHeartRateBpm: null,
    })
    const empty = buildTodayView(sources())
    expect(empty.activity.inProgress).toBe(false)
    expect(empty.activity.steps).toBeNull()
  })
})

describe('today nutrition and training', () => {
  it('uses logged totals and targets, and does not treat an unlogged day as zero', () => {
    const logged = buildTodayView(
      sources({
        nutritionEntries: [entry('2026-09-22', { calories: 1540, protein: 92, carbs: 140, fat: 50 })],
        nutritionTargets: [
          {
            id: 'target',
            effectiveFrom: '2026-09-01',
            caloriesTarget: 2100,
            proteinTarget: 160,
            carbsTarget: 200,
            fatTarget: 70,
            fiberTarget: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
      }),
    )
    expect(logged.nutrition.logged).toBe(true)
    expect(logged.nutrition.totals?.calories.value).toBe(1540)
    expect(logged.nutrition.target?.calories).toBe(2100)
    const unlogged = buildTodayView(sources())
    expect(unlogged.nutrition.logged).toBe(false)
    expect(unlogged.nutrition.totals).toBeNull()
  })

  it('counts a canonical workout and ignores days that only have activity', () => {
    const logged = buildTodayView(
      sources({
        trainingToday: [{ id: 'session-1', name: 'Routine B', exerciseCount: 6, workingSetCount: 18 }],
        activityDays: [activity('2026-09-22', { stepsCount: 8000, exerciseMinutes: 40 })],
      }),
    )
    expect(logged.training.logged).toBe(true)
    expect(logged.training.sessions[0]?.name).toBe('Routine B')
    const none = buildTodayView(sources({ activityDays: [activity('2026-09-22', { exerciseMinutes: 30 })] }))
    expect(none.training.logged).toBe(false)
    expect(none.training.sessions).toEqual([])
  })
})

describe('today sleep and body', () => {
  it('shows a complete night, a partial night, or a labeled historical complete night', () => {
    const complete = buildTodayView(
      sources({
        sleepNights: [night('2026-09-22', 438, 'analysis_eligible')],
        latestCompleteSleep: night('2026-06-14', 592.05, 'analysis_eligible'),
      }),
    )
    expect(complete.sleep.kind).toBe('complete')
    expect(complete.sleep.latestComplete).toBeNull()
    const partial = buildTodayView(sources({ sleepNights: [night('2026-09-22', 81.52, 'partial_observation')] }))
    expect(partial.sleep).toMatchObject({ kind: 'partial', minutes: 81.52, sourceName: 'Apple Watch' })
    expect(partial.sleep.latestComplete).toBeNull()
    const missing = buildTodayView(
      sources({
        sleepNights: [night('2026-09-22', 90, 'in_bed_only')],
        latestCompleteSleep: night('2026-06-14', 592.05, 'analysis_eligible'),
      }),
    )
    expect(missing.sleep.kind).toBe('none')
    expect(missing.sleep.latestComplete).toMatchObject({ date: '2026-06-14', minutes: 592.05 })
  })

  it('labels the latest body measurement by age and omits a trend when the series is too short', () => {
    const view = buildTodayView(sources({ bodyWeights: [weight('2026-09-19', 187.4)] }))
    expect(view.body.latest).toMatchObject({ value: 187.4, unit: 'lb', ageDays: 3, measuredLabel: 'Measured 3 days ago' })
    expect(view.body.trendText).toBeNull()
    expect(buildTodayView(sources()).body.latest).toBeNull()
  })
})

describe('today attention, patterns, and payload', () => {
  it('shows review and retry jobs and hides in-flight or committed jobs', () => {
    const view = buildTodayView(
      sources({
        pendingJobs: [
          { id: '11111111-1111-4111-8111-111111111111', kind: 'meal_photo', status: 'completed' },
          { id: '22222222-2222-4222-8222-222222222222', kind: 'workout_transcription', status: 'failed' },
          { id: '33333333-3333-4333-8333-333333333333', kind: 'nutrition_label', status: 'processing' },
          { id: '44444444-4444-4444-8444-444444444444', kind: 'workout_transcription', status: 'committed' },
        ],
      }),
    )
    expect(view.pendingItems.map((item) => item.title)).toEqual([
      'Meal photo ready for review',
      'Workout photo failed',
    ])
    expect(view.pendingItems[0]?.href).toBe('/nutrition?date=2026-09-22')
    expect(view.pendingItems[1]?.href).toContain('/training/import?job=')
  })

  it('shows surfaced patterns only, and omits the section data when the engine has none', () => {
    const days = Array.from({ length: 20 }, (_, index) => addCalendarDays('2026-08-24', index))
    const surfaced = buildTodayView(
      sources({
        activityDays: days.flatMap((date, index) => [
          activity(date, {
            stepsCount: 1000 + index * 10,
            activeEnergyKcal: 200 + index,
            exerciseMinutes: 10 + index,
            restingHeartRateBpm: 50 + index,
          }),
        ]),
        sleepNights: days.map((date, index) => night(date, 400 + index, 'analysis_eligible')),
      }),
    )
    expect(surfaced.patterns.length).toBeGreaterThan(0)
    expect(surfaced.patterns.length).toBeLessThanOrEqual(3)
    expect(surfaced.patterns.some((item) => item.text.toLowerCase().includes('caused'))).toBe(false)
    const quiet = buildTodayView(sources())
    expect(quiet.patterns).toEqual([])
    expect(quiet.changedItems).toEqual([])
    expect(quiet).not.toHaveProperty('score')
  })
})

describe('today page', () => {
  it('renders provisional activity, unlogged nutrition, historical sleep, and no patterns section', () => {
    const view = buildTodayView(
      sources({
        activityDays: [activity('2026-09-22', { stepsCount: 129, activeEnergyKcal: 12 })],
        latestCompleteSleep: night('2026-06-14', 592.05, 'analysis_eligible'),
        pendingJobs: [{ id: '11111111-1111-4111-8111-111111111111', kind: 'meal_photo', status: 'completed' }],
      }),
    )
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TodayBoard view={view} />
      </MemoryRouter>,
    )
    expect(html).toContain('129 steps so far')
    expect(html).toContain('12 active kcal')
    expect(html).toContain('Today is still in progress')
    expect(html).not.toContain('final')
    expect(html).toContain('No food logged yet today')
    expect(html).not.toContain('0 calories')
    expect(html).toContain('No workout logged today')
    expect(html).toContain('No complete sleep observation for today')
    expect(html).toContain('Latest complete')
    expect(html).toContain('Jun 14')
    expect(html).not.toMatch(/last night/i)
    expect(html).toContain('Meal photo ready for review')
    expect(html).not.toContain('Patterns')
    expect(html).not.toMatch(/\bAI\b/)
    expect(html).toContain('No body measurement recorded yet.')
  })

  it('renders remaining, over, an explicit activity zero, and a partial sleep night', () => {
    const view = buildTodayView(
      sources({
        activityDays: [activity('2026-09-22', { stepsCount: 0, exerciseMinutes: 0 })],
        nutritionEntries: [entry('2026-09-22', { calories: 2200, protein: 92, carbs: null, fat: 80 })],
        nutritionTargets: [
          {
            id: 'target',
            effectiveFrom: '2026-09-01',
            caloriesTarget: 2100,
            proteinTarget: 160,
            carbsTarget: 200,
            fatTarget: 70,
            fiberTarget: null,
            createdAt: '2026-09-01T00:00:00.000Z',
            updatedAt: '2026-09-01T00:00:00.000Z',
          },
        ],
        sleepNights: [night('2026-09-22', 81.52, 'partial_observation')],
      }),
    )
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TodayBoard view={view} />
      </MemoryRouter>,
    )
    expect(html).toContain('0 steps so far')
    expect(html).toContain('0 exercise min so far')
    expect(html).toContain('+100')
    expect(html).toContain('68 left')
    expect(html).toContain('— / 200 g')
    expect(html).toContain('+10 g')
    expect(html).toContain('Partial observation')
    expect(html).not.toContain('0h')
  })
})

