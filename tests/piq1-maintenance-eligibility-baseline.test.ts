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
    eligibleNutritionDates,
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

  it('T03 KNOWN GAP: 28 precisely sourced SINGLE-600-kcal-meal days can yield a maintenance estimate', () => {
    const prior = state(series(600, -0.075))
    expect(prior.estimate.state).toBe('available')
    expect(prior.estimate.averageIntakeKcal).toBe(600)
    expect(prior.estimate.observedMaintenanceKcal).not.toBeNull()
    // This green test documents a PRODUCT FAILURE, not correct behavior.
  })

  it('with no owner complete-day confirmations, applying the future strict gate would withhold that estimate', () => {
    const records = series(600, -0.075)
    const protectedState = state(safeFixtureFilter(records, new Set()))
    expect(protectedState.estimate.state).toBe('insufficient_evidence')
    expect(protectedState.estimate.observedMaintenanceKcal).toBeNull()
    expect(protectedState.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    // This filter is test-only until owner storage and read integration land.
  })

  it('single-meal days can otherwise create a flat-weight calorie-reduction recommendation', () => {
    const records = series(1400, 0)
    const prior = state(records)
    expect(prior.estimate.state).toBe('available')
    expect(prior.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(true)
    const confirmedSubset = new Set([addCalendarDays('2026-09-10', 0), addCalendarDays('2026-09-10', 1)])
    const protectedState = state(safeFixtureFilter(records, confirmedSubset))
    expect(protectedState.estimate.state).toBe('insufficient_evidence')
    expect(protectedState.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })
})
