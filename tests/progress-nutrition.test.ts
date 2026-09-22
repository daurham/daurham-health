import { describe, expect, it } from 'vitest'
import type { NutritionEntry, NutritionTarget } from '../src/domain/nutrition/types.ts'
import { resolveNutritionTarget } from '../src/domain/nutrition/targets.ts'
import { TARGET_FOR_DATE_SQL, LIST_ALL_ENTRIES_SQL } from '../server/nutrition/queries.ts'
import {
  buildProgressCompare,
  buildProgressOverview,
  buildProgressTimeline,
  buildSinceCheckpointCompare,
  comparePeriod,
  nutritionDailyObservations,
  nutritionFindings,
  nutritionPeriodSummary,
  timelineEventsForFocus,
  timelineSeriesForFocus,
  type ProgressCanonicalInput,
} from '../src/domain/progress/index.ts'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

function entry(
  partial: Partial<NutritionEntry> & Pick<NutritionEntry, 'id' | 'logDate' | 'calories'>,
): NutritionEntry {
  return {
    consumedAt: null,
    timezone: 'America/Los_Angeles',
    meal: 'breakfast',
    foodId: null,
    foodName: 'Food',
    brand: null,
    servingQuantity: 1,
    servingUnit: 'serving',
    grams: null,
    protein: null,
    carbs: null,
    fat: null,
    fiber: null,
    sourceKind: 'migrated',
    notes: null,
    mealGroupId: null,
    createdAt: `${partial.logDate}T12:00:00.000Z`,
    updatedAt: `${partial.logDate}T12:00:00.000Z`,
    ...partial,
  }
}

function target(partial: Partial<NutritionTarget> & Pick<NutritionTarget, 'id' | 'effectiveFrom'>): NutritionTarget {
  return {
    caloriesTarget: 2000,
    proteinTarget: 150,
    carbsTarget: null,
    fatTarget: null,
    fiberTarget: null,
    createdAt: `${partial.effectiveFrom}T00:00:00.000Z`,
    updatedAt: `${partial.effectiveFrom}T00:00:00.000Z`,
    ...partial,
  }
}

function emptyCanonical(asOf = '2026-09-21', range: ProgressCanonicalInput['range'] = '30d'): ProgressCanonicalInput {
  return {
    asOf,
    range,
    exercises: [],
    workouts: [],
    sets: [],
    bodyObservations: [],
  }
}

const SEP_20_ENTRIES: NutritionEntry[] = [
  entry({ id: 'e1', logDate: '2026-09-20', calories: 200, foodName: 'Oats' }),
  entry({ id: 'e2', logDate: '2026-09-20', calories: 150, foodName: 'Coffee' }),
  entry({ id: 'e3', logDate: '2026-09-20', calories: 131, foodName: 'Apple' }),
  entry({ id: 'e4', logDate: '2026-09-20', calories: 100, foodName: 'Yogurt' }),
]

describe('nutrition target resolution', () => {
  it('uses the latest effective_from on or before the date, never a later target', () => {
    const targets = [
      target({ id: 't-old', effectiveFrom: '2026-09-01', caloriesTarget: 1800, proteinTarget: 140 }),
      target({ id: 't-new', effectiveFrom: '2026-09-21', caloriesTarget: 2200, proteinTarget: 170 }),
    ]
    expect(resolveNutritionTarget(targets, '2026-09-20')?.id).toBe('t-old')
    expect(resolveNutritionTarget(targets, '2026-09-21')?.id).toBe('t-new')
    expect(resolveNutritionTarget(targets, '2026-08-31')).toBeNull()
  })

  it('shares ORDER BY effective_from DESC with the daily Nutrition SQL', () => {
    expect(TARGET_FOR_DATE_SQL).toContain('effective_from <= $1')
    expect(TARGET_FOR_DATE_SQL).toContain('ORDER BY effective_from DESC')
    expect(TARGET_FOR_DATE_SQL).toContain('LIMIT 1')
  })
})

describe('nutrition daily observations', () => {
  it('creates an observation for a logged day and preserves unavailable macros', () => {
    const observations = nutritionDailyObservations({
      entries: SEP_20_ENTRIES,
      targets: [],
      start: '2026-09-01',
      end: '2026-09-21',
    })
    expect(observations).toHaveLength(1)
    expect(observations[0]?.date).toBe('2026-09-20')
    expect(observations[0]?.entryCount).toBe(4)
    expect(observations[0]?.calories).toEqual({ status: 'available', value: 581 })
    expect(observations[0]?.protein).toEqual({ status: 'unavailable' })
    expect(observations[0]?.carbs).toEqual({ status: 'unavailable' })
    expect(observations[0]?.fat).toEqual({ status: 'unavailable' })
    expect(observations[0]?.fiber).toEqual({ status: 'unavailable' })
  })

  it('does not create a zero observation for an unlogged day', () => {
    const observations = nutritionDailyObservations({
      entries: SEP_20_ENTRIES,
      targets: [target({ id: 't1', effectiveFrom: '2026-09-21', caloriesTarget: 2000, proteinTarget: 150 })],
      start: '2026-09-20',
      end: '2026-09-21',
    })
    expect(observations.map((item) => item.date)).toEqual(['2026-09-20'])
    expect(observations.some((item) => item.date === '2026-09-21')).toBe(false)
    expect(observations.some((item) => item.calories.value === 0)).toBe(false)
    expect(observations[0]?.protein.status).not.toBe('available')
    expect(observations[0]?.target).toBeNull()
  })

  it('resolves the target effective on that logged date', () => {
    const observations = nutritionDailyObservations({
      entries: SEP_20_ENTRIES,
      targets: [
        target({ id: 't-sep20', effectiveFrom: '2026-09-20', caloriesTarget: 1900, proteinTarget: 140 }),
        target({ id: 't-sep21', effectiveFrom: '2026-09-21', caloriesTarget: 2200, proteinTarget: 170 }),
      ],
      start: '2026-09-20',
      end: '2026-09-21',
    })
    expect(observations[0]?.target?.calories).toBe(1900)
    expect(observations[0]?.target?.protein).toBe(140)
  })
})

describe('nutrition period summary', () => {
  it('averages calories on logged days and macros only on observed days', () => {
    const entries = [
      ...SEP_20_ENTRIES,
      entry({
        id: 'e5',
        logDate: '2026-09-18',
        calories: 2000,
        protein: 140,
        carbs: 180,
        fat: 70,
        fiber: 20,
        sourceKind: 'manual',
        foodName: 'Complete day',
      }),
    ]
    const summary = nutritionPeriodSummary({
      entries,
      targets: [target({ id: 't1', effectiveFrom: '2026-09-01', caloriesTarget: 1900, proteinTarget: 154 })],
      start: '2026-08-23',
      end: '2026-09-21',
    })
    expect(summary.calendarDays).toBe(30)
    expect(summary.loggedDays).toBe(2)
    expect(summary.coveragePct).toBeCloseTo((2 / 30) * 100)
    expect(summary.calories.averageOnLoggedDays).toBeCloseTo((581 + 2000) / 2)
    expect(summary.calories.observedDays).toBe(2)
    expect(summary.protein.averageOnObservedDays).toBe(140)
    expect(summary.protein.observedDays).toBe(1)
    expect(summary.calories.targetContext?.daysWithTarget).toBe(2)
    expect(summary.calories.targetContext?.averageDifference).toBeCloseTo((581 - 1900 + (2000 - 1900)) / 2)
    expect(summary.protein.targetContext?.daysWithTarget).toBe(1)
    expect(summary.protein.targetContext?.averageDifference).toBe(140 - 154)
  })

  it('treats a sparse window as one logged day with no fake zeroes', () => {
    const summary = nutritionPeriodSummary({
      entries: SEP_20_ENTRIES,
      targets: [],
      start: '2026-08-23',
      end: '2026-09-21',
    })
    expect(summary.loggedDays).toBe(1)
    expect(summary.calendarDays).toBe(30)
    expect(summary.observations).toHaveLength(1)
    expect(summary.observations[0]?.calories.value).toBe(581)
    expect(summary.protein.averageOnObservedDays).toBeNull()
    expect(summary.protein.observedDays).toBe(0)
    expect(summary.observations.some((item) => item.protein.status === 'available' && item.protein.value === 0)).toBe(
      false,
    )
  })

  it('does not emit findings for every macro', () => {
    const summary = nutritionPeriodSummary({
      entries: [
        entry({
          id: 'full',
          logDate: '2026-09-20',
          calories: 2000,
          protein: 150,
          carbs: 200,
          fat: 60,
          fiber: 25,
          sourceKind: 'manual',
        }),
      ],
      targets: [],
      start: '2026-09-01',
      end: '2026-09-21',
    })
    const findings = nutritionFindings(summary)
    expect(findings.map((item) => item.kind)).toEqual(['nutrition_logging_summary', 'nutrition_period_average'])
    expect(findings.some((item) => item.nutrient === 'protein')).toBe(false)
  })
})

describe('nutrition timeline', () => {
  it('emits one nutrition_day event per logged day, not per entry', () => {
    const grouped = [
      entry({
        id: 'g1',
        logDate: '2026-09-20',
        calories: 200,
        meal: 'lunch',
        mealGroupId: 'mg1',
        foodName: 'Chicken',
        sourceKind: 'photo_ai',
      }),
      entry({
        id: 'g2',
        logDate: '2026-09-20',
        calories: 180,
        meal: 'lunch',
        mealGroupId: 'mg1',
        foodName: 'Rice',
        sourceKind: 'photo_ai',
      }),
      entry({ id: 'g3', logDate: '2026-09-20', calories: 80, meal: 'lunch', foodName: 'Broccoli' }),
    ]
    const timeline = buildProgressTimeline({
      ...emptyCanonical(),
      nutritionEntries: grouped,
    })
    const nutritionEvents = timeline.events.filter((event) => event.kind === 'nutrition_day')
    expect(nutritionEvents).toHaveLength(1)
    const event = nutritionEvents[0]
    expect(event && event.kind === 'nutrition_day' ? event.data.entryCount : 0).toBe(3)
    expect(event && event.kind === 'nutrition_day' ? event.data.mealGroupCount : 0).toBe(1)
    expect(event && event.kind === 'nutrition_day' ? event.data.entries.map((item) => item.id) : []).toEqual([
      'g1',
      'g2',
      'g3',
    ])
    expect(event?.occurredAt).toBeUndefined()
    expect(event?.timePrecision).toBe('date')
    expect(timeline.series.nutritionCalories).toHaveLength(1)
  })

  it('hides the nutrition lane and filter series when the period has no logs', () => {
    const timeline = buildProgressTimeline(emptyCanonical())
    expect(timeline.series.nutritionCalories).toEqual([])
    expect(timelineEventsForFocus(timeline, 'nutrition')).toEqual([])
    expect(timelineSeriesForFocus(timeline, 'all').nutritionCalories).toEqual([])
    expect(timelineSeriesForFocus(timeline, 'nutrition').nutritionCalories).toEqual([])
  })

  it('keeps nutrition events in All and the Nutrition filter', () => {
    const timeline = buildProgressTimeline({
      ...emptyCanonical(),
      nutritionEntries: SEP_20_ENTRIES,
    })
    expect(timelineEventsForFocus(timeline, 'all').some((event) => event.kind === 'nutrition_day')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'nutrition').every((event) => event.kind === 'nutrition_day')).toBe(true)
    expect(timelineEventsForFocus(timeline, 'training').some((event) => event.kind === 'nutrition_day')).toBe(false)
  })
})

describe('nutrition compare and checkpoints', () => {
  it('compares normalized averages and exposes coverage, including unequal windows', () => {
    const laterEntries = Array.from({ length: 9 }, (_, index) =>
      entry({
        id: `b${index + 1}`,
        logDate: `2026-08-${String(index + 1).padStart(2, '0')}`,
        calories: 2000 + index * 10,
        protein: 150 + index,
        carbs: 200,
        fat: 60,
        fiber: 20,
        sourceKind: 'manual',
        foodName: 'Logged day',
      }),
    )
    const compare = buildProgressCompare({
      canonical: { ...emptyCanonical(), nutritionEntries: [...SEP_20_ENTRIES, ...laterEntries] },
      periodA: comparePeriod('2026-08-23', '2026-09-21'),
      periodB: comparePeriod('2026-08-01', '2026-08-30'),
    })
    expect(compare.nutrition.a.loggedDays).toBe(1)
    expect(compare.nutrition.a.calendarDays).toBe(30)
    expect(compare.nutrition.b.loggedDays).toBe(9)
    expect(compare.nutrition.b.calendarDays).toBe(30)
    expect(compare.nutrition.a.calories.averageOnLoggedDays).toBe(581)
    expect(compare.nutrition.b.calories.averageOnLoggedDays).toBeCloseTo(
      laterEntries.reduce((sum, item) => sum + item.calories, 0) / 9,
    )
    expect(compare.nutrition.a.protein.observedDays).toBe(0)
    expect(compare.nutrition.b.protein.observedDays).toBe(9)
    expect(compare.nutrition.coverageDiffers).toBe(true)
  })

  it('summarizes nutrition after a checkpoint without inventing a baseline intake', () => {
    const compare = buildSinceCheckpointCompare({
      canonical: {
        ...emptyCanonical('2026-09-21'),
        nutritionEntries: SEP_20_ENTRIES,
      },
      checkpoint: {
        id: 'cp1',
        checkpointDate: '2026-09-20',
        label: 'Started cut',
        notes: null,
        createdAt: '2026-09-20T08:00:00.000Z',
        updatedAt: '2026-09-20T08:00:00.000Z',
      },
      asOf: '2026-09-21',
    })
    expect(compare.nutrition.b.loggedDays).toBe(1)
    expect(compare.nutrition.b.calendarDays).toBe(2)
    expect(compare.nutrition.b.calories.averageOnLoggedDays).toBe(581)
    expect(compare.periodB.start).toBe('2026-09-20')
    expect(compare.periodB.end).toBe('2026-09-21')
  })
})

describe('nutrition overview wiring', () => {
  it('attaches nutrition to Progress overview without zero-filling unlogged days', () => {
    const overview = buildProgressOverview({
      ...emptyCanonical('2026-09-21', '30d'),
      nutritionEntries: SEP_20_ENTRIES,
    })
    expect(overview.nutrition.loggedDays).toBe(1)
    expect(overview.nutrition.calendarDays).toBe(30)
    expect(overview.nutrition.observations).toHaveLength(1)
    expect(overview.findings.some((item) => item.kind === 'nutrition_logging_summary')).toBe(true)
    expect(overview.findings.some((item) => item.kind === 'nutrition_period_average')).toBe(true)
  })
})

describe('nutrition progress infrastructure', () => {
  it('batch-loads entries instead of querying per day', () => {
    expect(LIST_ALL_ENTRIES_SQL).toContain('FROM nutrition_entries')
    expect(LIST_ALL_ENTRIES_SQL).not.toContain('log_date = $1')
  })

  it('keeps Progress Nutrition behind owner auth and a single API function', () => {
    const overviewHandler = readFileSync(join(process.cwd(), 'server/handlers/progress-overview.ts'), 'utf8')
    expect(overviewHandler).toContain('withOwnerAuth')
    expect(readdirSync(join(process.cwd(), 'api'))).toEqual(['index.ts'])
  })

  it('does not add analytics persistence or a new Vercel function', () => {
    const names = readdirSync(join(process.cwd(), 'migrations'))
    const sql = names
      .filter((name) => name.endsWith('.sql'))
      .map((name) => readFileSync(join(process.cwd(), 'migrations', name), 'utf8'))
      .join('\n')
    expect(sql).not.toContain('nutrition_daily_totals')
    expect(sql).not.toContain('progress_nutrition_cache')
    expect(readdirSync(join(process.cwd(), 'api'))).toEqual(['index.ts'])
  })
})
