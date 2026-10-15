import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState, type MaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'

const AS_OF = '2026-10-15'
const START = '2026-10-05'
const dates = Array.from({ length: 10 }, (_, i) => addCalendarDays(START, i))
const baseline = dates.slice(0, 7)
const recent = dates.slice(7)

function observation(
  key: IntelligenceObservation['key'], date: string, value: number,
  opts: Partial<IntelligenceObservation> = {},
): IntelligenceObservation {
  const units: Partial<Record<IntelligenceObservation['key'], string>> = {
    'nutrition.calories': 'kcal', 'nutrition.sodium_mg': 'mg',
    'nutrition.carbs_g': 'g', 'hydration.ml': 'ml', 'bowel.count': 'count',
  }
  return {
    key, date, value, unit: units[key] ?? 'unit',
    provenance: 'owner', quality: 'high_confidence',
    sourceIds: [date + '-food'],
    ...opts,
  }
}

function logs() {
  return dates.flatMap((date, i) => [
    observation('nutrition.calories', date, 2000),
    observation('nutrition.sodium_mg', date, i < 7 ? 1800 : 2800),
    observation('nutrition.carbs_g', date, i < 7 ? 150 : 240),
  ])
}

function state(input: {
  observations?: IntelligenceObservation[]
  verified?: ReadonlySet<string>
  today?: string
} = {}): MaintenanceState {
  const observations = input.observations ?? logs()
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, start: '2026-09-16', end: AS_OF,
    today: AS_OF, timezone: 'America/Phoenix', observations,
    nutritionVerifiedCompleteDates: input.verified,
  })
  return buildMaintenanceState({
    asOf: AS_OF, today: input.today ?? AS_OF,
    intelligence, contexts: [], weightGoal: null,
    eligibleNutritionDates: input.verified,
  })
}

function kinds(result: MaintenanceState) {
  return result.noiseFactors.map((item) => item.kind)
}

describe('PIQ-1.2 nutrient-driven scale context requires complete, source-matched days', () => {
  it('T03/T19: precise full-week one-meal logs cannot claim a sodium or carb intake shift without owner confirmation', () => {
    const s = state({ verified: new Set() })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
    expect(s.estimate.state).toBe('insufficient_evidence')
  })

  it('treats undefined/unavailable verification as unavailable, not permission to compare nutrients', () => {
    expect(kinds(state())).not.toContain('sodium')
    expect(kinds(state())).not.toContain('carbohydrate')
  })

  it('compares only reliably confirmed days with aligned food source IDs', () => {
    const s = state({ verified: new Set(dates) })
    expect(kinds(s)).toEqual(expect.arrayContaining(['sodium', 'carbohydrate']))
    const sodium = s.noiseFactors.find((item) => item.kind === 'sodium')
    const carbs = s.noiseFactors.find((item) => item.kind === 'carbohydrate')
    expect(sodium?.dates).toEqual(recent)
    expect(carbs?.dates).toEqual(recent)
    expect(sodium?.detail).toContain('3 owner-confirmed, source-reliable days versus 7 prior days')
    expect(carbs?.detail).toContain('not proof of the cause')
    expect(sodium?.title).toContain('Logged sodium')
    expect(carbs?.title).toContain('Logged carbohydrates')
    expect(s.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('an unconfirmed recent spike cannot be compared against an otherwise confirmed baseline', () => {
    const s = state({ verified: new Set(baseline) })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
  })

  it('no confirmed baseline cannot make a recent complete week into a comparison', () => {
    const s = state({ verified: new Set(recent) })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
  })

  it('does not infer a trend from a single recent day or fewer than four baseline observations', () => {
    const oneRecent = state({ verified: new Set([...baseline, recent[0]!]) })
    const threeBase = state({ verified: new Set([...baseline.slice(0, 3), ...recent]) })
    for (const s of [oneRecent, threeBase]) {
      expect(kinds(s)).not.toContain('sodium')
      expect(kinds(s)).not.toContain('carbohydrate')
    }
  })

  it('rejects stale nutrient source IDs, missing values, and estimate-heavy nutrients independently', () => {
    const changed = logs().filter((item) =>
      !(item.key === 'nutrition.sodium_mg' && recent.slice(0, 2).includes(item.date)),
    ).map((item) => {
      if (item.key === 'nutrition.carbs_g' && recent.slice(0, 2).includes(item.date)) {
        return { ...item, sourceIds: ['an-unrelated-meal'], quality: 'estimate_heavy' }
      }
      return item
    })
    const s = state({ observations: changed, verified: new Set(dates) })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
    // Trusted totals for earlier dates remain intact; do not replace unknowns with zeros.
    expect(s.noiseFactors).toHaveLength(0)
  })

  it('rejects source-mismatched or duplicated nutrient entry IDs even if kcal totals match', () => {
    const changed = logs().map((item) =>
      item.key === 'nutrition.sodium_mg' && recent.slice(0, 2).includes(item.date)
        ? { ...item, sourceIds: [item.date + '-food', item.date + '-food'] }
        : item,
    )
    const s = state({ observations: changed, verified: new Set(dates) })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).toContain('carbohydrate')
  })

  it('a provisional current-day spike is never part of the previous three completed dates', () => {
    const flat = logs().map((item) =>
      item.date >= recent[0]! && item.key === 'nutrition.sodium_mg'
        ? { ...item, value: 1800 }
        : item.date >= recent[0]! && item.key === 'nutrition.carbs_g'
          ? { ...item, value: 150 } : item,
    )
    flat.push(observation('nutrition.calories', AS_OF, 2000))
    flat.push(observation('nutrition.sodium_mg', AS_OF, 5000))
    flat.push(observation('nutrition.carbs_g', AS_OF, 450))
    const s = state({ observations: flat, verified: new Set([...dates, AS_OF]) })
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
  })

  it('non-nutrition hydration or owner-tag context is not erased by unverified food days', () => {
    const withHydration = [
      ...logs(),
      ...baseline.map((date) => observation('hydration.ml', date, 1500, { sourceIds: [date + '-water'] })),
      ...recent.map((date) => observation('hydration.ml', date, 2600, { sourceIds: [date + '-water'] })),
    ]
    const s = state({ observations: withHydration, verified: new Set() })
    expect(kinds(s)).toContain('hydration')
    expect(kinds(s)).not.toContain('sodium')
    expect(kinds(s)).not.toContain('carbohydrate')
    expect(s.noiseFactors.find((item) => item.kind === 'hydration')?.detail).toContain('Logged water')
  })
})
