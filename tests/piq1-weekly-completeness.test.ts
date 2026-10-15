import { describe, expect, it } from 'vitest'
import { buildWeeklyCoachBrief, type WeeklyCoachInput } from '../src/domain/weekly-coach/index.js'
import type { NutritionEntry } from '../src/domain/nutrition/types.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import { verifiedWeeklyNutritionDatesFromRows } from '../server/nutrition/maintenance-eligibility.js'

const AS_OF = '2026-10-15'
function meal(date: string, calories: number): NutritionEntry {
  return {
    id: date + '-entry', logDate: date, consumedAt: null, timezone: 'America/Phoenix',
    meal: null, foodId: null, foodName: 'Synthetic meal', brand: null,
    servingQuantity: 1, servingUnit: 'serving', grams: null,
    calories, protein: 60, carbs: 100, fat: 40, fiber: null, sourceKind: 'manual',
    notes: null, mealGroupId: null,
    createdAt: '2026-10-01T10:00:00.000Z', updatedAt: '2026-10-01T10:00:00.000Z',
  }
}
const dates = Array.from({ length: 14 }, (_, i) => addCalendarDays('2026-10-01', i))
const entries = dates.map((date, i) => meal(date, i < 7 ? 1800 : 900))

function input(verified: readonly string[] = []): WeeklyCoachInput {
  return {
    asOf: AS_OF, activityDays: [], sleepNights: [], nutritionEntries: entries,
    nutritionTargets: [], nutritionVerifiedCompleteDates: verified,
    trainingSessions: [], performanceBests: [], bodyObservations: [],
    supplements: [], goals: [], experiments: [], retests: [],
    benchmarkResults: [], reviewCaptures: [], cadenceDue: [], insights: [],
    sleepBaseline: null, activeBodyGoal: false,
  }
}
function comparison(inputData: WeeklyCoachInput) {
  const brief = buildWeeklyCoachBrief(inputData)
  return brief.facts.find((x) => x.id === 'fact:nutrition:verified-calorie-comparison')
}

describe('PIQ-1.1 Weekly Coach nutrition comparisons require whole-day confirmation', () => {
  it('T03: fourteen precisely logged one-meal days never count as verified intake by default', () => {
    const brief = buildWeeklyCoachBrief(input())
    expect(brief.facts.find((f) => f.id === 'fact:nutrition:coverage')?.text)
      .toContain('verified complete for 0 of 7')
    expect(brief.facts.find((f) => f.id === 'fact:nutrition:calories')?.text)
      .toContain('not necessarily all intake')
    expect(comparison(input())).toBeUndefined()
    expect(brief.canGenerate).toBe(false)
  })

  it('even seven confirmed days cannot establish a prior-week comparison', () => {
    const onlyCurrent = dates.slice(7)
    expect(comparison(input(onlyCurrent))).toBeUndefined()
    expect(buildWeeklyCoachBrief(input(onlyCurrent)).facts
      .find((f) => f.id === 'fact:nutrition:coverage')?.text).toContain('7 of 7')
  })

  it('compares only exact owner-complete, source-verified dates on both sides', () => {
    const actual = comparison(input(dates))
    expect(actual?.text).toContain('900 vs 1,800')
    expect(actual?.text).toContain('not a calorie-adjustment recommendation')
  })

  it('does not compare when there are only three verified dates in either week', () => {
    expect(comparison(input([...dates.slice(0, 3), ...dates.slice(7)]))).toBeUndefined()
    expect(comparison(input([...dates.slice(0, 7), ...dates.slice(7, 10)]))).toBeUndefined()
  })

  it('matches SQL candidate IDs and calorie totals to precisely the loaded log', () => {
    const row = { date: dates[0]!, calories: '1800', source_ids: [entries[0]!.id] }
    expect([...verifiedWeeklyNutritionDatesFromRows([row], entries)]).toEqual([dates[0]])
    expect(verifiedWeeklyNutritionDatesFromRows([{ ...row, calories: '600' }], entries).size).toBe(0)
    expect(verifiedWeeklyNutritionDatesFromRows([{ ...row, source_ids: ['another'] }], entries).size).toBe(0)
  })

  it('rejects an added food, duplicate ID, or absent calorie evidence rather than passing stale completion', () => {
    const target = dates[0]!
    const row = { date: target, calories: '1800', source_ids: [entries[0]!.id] }
    expect(verifiedWeeklyNutritionDatesFromRows([row], [...entries, meal(target, 300)]).size).toBe(0)
    expect(verifiedWeeklyNutritionDatesFromRows([{ ...row, source_ids: [entries[0]!.id, entries[0]!.id] }], entries).size).toBe(0)
    expect(verifiedWeeklyNutritionDatesFromRows([{ ...row, source_ids: null }], entries).size).toBe(0)
  })
})
