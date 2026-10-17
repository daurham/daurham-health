import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { assessNutritionDayCompleteness } from '../src/domain/nutrition/day-completeness.js'
import { nutritionDayQuality } from '../src/domain/nutrition/quality.js'

const AS_OF = '2026-10-08'
function series(kcal: number, weightDelta: number): IntelligenceObservation[] {
  const records: IntelligenceObservation[] = []
  for (let offset = 0; offset < 28; offset += 1) {
    const date = addCalendarDays('2026-09-10', offset)
    records.push({
      key: 'nutrition.calories', date, value: kcal, unit: 'kcal',
      quality: 'high_confidence', provenance: 'reference', sourceIds: ['meal-' + offset],
    })
    records.push({
      key: 'body.weight_kg', date, value: 85 + offset * weightDelta,
      unit: 'kg', quality: 'usual', provenance: 'owner', sourceIds: ['scale-' + offset],
    })
  }
  return records
}
function state(observations: IntelligenceObservation[], eligibleNutritionDates?: ReadonlySet<string>) {
  return buildMaintenanceState({
    asOf: AS_OF, today: AS_OF,
    intelligence: buildHealthIntelligenceSnapshot({
      range: '30d', start: '2026-09-09', end: AS_OF, asOf: AS_OF,
      timezone: 'America/Phoenix', today: AS_OF, observations,
    }),
    contexts: [],
    eligibleNutritionDates: eligibleNutritionDates ?? new Set<string>(),
    weightGoal: {
      goalId: 'synthetic-goal', goalVersionId: 'synthetic-version',
      label: 'Weight', targetState: 'unmet', direction: 'lose',
    },
  })
}
function safeFixtureFilter(items: IntelligenceObservation[], confirmations: ReadonlySet<string>) {
  return items.filter((item) => {
    if (item.key !== 'nutrition.calories') return true
    const assessment = assessNutritionDayCompleteness({
      date: item.date, today: AS_OF, entryRevision: 'v1',
      quality: nutritionDayQuality([{ calories: item.value, evidenceQuality: 'measured_reference' }]),
      confirmation: confirmations.has(item.date) ? { state: 'complete', entryRevision: 'v1' } : null,
    })
    return assessment.eligibleForMaintenance
  })
}

describe('PIQ-1.1 baseline: demonstrate existing maintenance hazard and future eligibility protection', () => {
  it('REAL engine gate: a 28-day single-meal log cannot calibrate or recommend calorie cuts with zero confirmations', () => {
    const missing = state(series(1400, 0), new Set())
    expect(missing.estimate.state).toBe('insufficient_evidence')
    expect(missing.estimate.observedMaintenanceKcal).toBeNull()
    expect(missing.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('REAL engine gate: only independently confirmed dates enter the maintenance window', () => {
    const all = series(1900, -0.05)
    const completeDates = new Set(all.filter((x) => x.key === 'nutrition.calories' && x.date < AS_OF).map((x) => x.date))
    expect(state(all, completeDates).estimate.state).toBe('available')
    const partial = new Set([...completeDates].slice(0, 6))
    expect(state(all, partial).estimate.state).toBe('insufficient_evidence')
  })

  it('REAL engine gate: high-quality source rows on unconfirmed dates cannot inflate the observed count', () => {
    const data = series(600, -0.075)
    const exactlyTwo = new Set([addCalendarDays('2026-09-10', 0), addCalendarDays('2026-09-10', 1)])
    const decision = state(data, exactlyTwo)
    expect(decision.estimate.quality.nutrition.reliableDays).toBeLessThanOrEqual(2)
    expect(decision.estimate.state).toBe('insufficient_evidence')
  })

  it('T03 FIXED: 28 precise single-meal days are not verified whole-day intake', () => {
    const missing = state(series(600, -0.075))
    expect(missing.estimate.state).toBe('insufficient_evidence')
    expect(missing.estimate.averageIntakeKcal).toBeNull()
    expect(missing.estimate.observedMaintenanceKcal).toBeNull()
    expect(missing.calorieAdjustmentSafety.status).toBe('blocked')
    expect(missing.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('T03 FIXED: untyped JS callers with missing or null whitelist also fail closed', () => {
    const records = series(2100, -0.05)
    const complete = new Set(records.filter((r) => r.key === 'nutrition.calories').map((r) => r.date))
    expect(state(records, complete).estimate.state).toBe('available')
    const input = {
      asOf: AS_OF, today: AS_OF,
      intelligence: buildHealthIntelligenceSnapshot({
        range: '30d', start: '2026-09-09', end: AS_OF,
        asOf: AS_OF, timezone: 'America/Phoenix', today: AS_OF, observations: records,
      }), contexts: [],
    }
    for (const untyped of [input, { ...input, eligibleNutritionDates: null }]) {
      const result = buildMaintenanceState(untyped as unknown as Parameters<typeof buildMaintenanceState>[0])
      expect(result.estimate.state).toBe('insufficient_evidence')
      expect(result.estimate.observedMaintenanceKcal).toBeNull()
      expect(result.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
    }
  })

  it('with no owner complete-day confirmations, applying the future strict gate would withhold that estimate', () => {
    const records = series(600, -0.075)
    const protectedState = state(safeFixtureFilter(records, new Set()))
    expect(protectedState.estimate.state).toBe('insufficient_evidence')
    expect(protectedState.estimate.observedMaintenanceKcal).toBeNull()
    expect(protectedState.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    // Real server maintenance also uses canonical day-completeness verification.
  })

  it('single-meal flat-weight baseline cannot estimate maintenance or authorize a cut', () => {
    const records = series(1400, 0)
    const prior = state(records)
    expect(prior.estimate.state).toBe('insufficient_evidence')
    expect(prior.estimate.observedMaintenanceKcal).toBeNull()
    expect(prior.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    expect(prior.calorieAdjustmentSafety.status).toBe('blocked')
    expect(prior.interventions.every((item) => item.suggestedDeltaKcal == null)).toBe(true)
    const confirmedSubset = new Set([addCalendarDays('2026-09-10', 0), addCalendarDays('2026-09-10', 1)])
    const protectedState = state(safeFixtureFilter(records, confirmedSubset))
    expect(protectedState.estimate.state).toBe('insufficient_evidence')
    expect(protectedState.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })
})
