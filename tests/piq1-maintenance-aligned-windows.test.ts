import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'

const AS_OF = '2026-10-15'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))

function calorie(date: string, value = 2000): IntelligenceObservation {
  return {
    key: 'nutrition.calories', date, value, unit: 'kcal',
    quality: 'high_confidence', provenance: 'owner', sourceIds: ['food-' + date],
  }
}
function weight(date: string, value = 85): IntelligenceObservation {
  return {
    key: 'body.weight_kg', date, value, unit: 'kg',
    quality: 'usual', provenance: 'owner', sourceIds: ['scale-' + date],
  }
}

function analyze(input: {
  nutritionDates?: readonly string[]
  weightDates?: readonly string[]
  calories?: (date: string, index: number) => number
  body?: (date: string, index: number) => number
  extra?: readonly IntelligenceObservation[]
} = {}) {
  const nutritionDates = input.nutritionDates ?? dates
  const weightDates = input.weightDates ?? dates
  const observations = [
    ...nutritionDates.map((date, i) => calorie(date, input.calories?.(date, i) ?? 2000)),
    ...weightDates.map((date, i) => weight(date, input.body?.(date, i) ?? 85)),
    ...(input.extra ?? []),
  ]
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF,
    start: '2026-09-16', end: AS_OF, today: AS_OF,
    timezone: 'America/Phoenix', observations,
    nutritionVerifiedCompleteDates: new Set(nutritionDates),
  })
  return buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence,
    contexts: [], eligibleNutritionDates: new Set(nutritionDates),
    weightGoal: {
      goalId: 'weight-goal', goalVersionId: 'weight-v1',
      label: 'Weight', targetState: 'unmet', direction: 'lose',
    },
  })
}

describe('PIQ-1.2 aligned maintenance estimate sampling (synthetic)', () => {
  it('still estimates from a genuinely aligned 28-day record, with source and date evidence', () => {
    const s = analyze({ body: (_, index) => 85 - index * 0.03 })
    expect(s.estimate.state).toBe('available')
    expect(s.estimate.period).toMatchObject({
      start: '2026-09-17', end: '2026-10-14', days: 28,
    })
    expect(s.estimate.averageIntakeKcal).toBe(2000)
    expect(s.estimate.confidence).toBe('high')
    expect(s.estimate.weightSlopeKgPerWeek).toBeCloseTo(-0.21)
    expect(s.interventions.some((i) => i.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('withholds a false maintenance estimate when all logged calories come from the first 19 days', () => {
    // 19 / 28 meets the OLD aggregate 65% threshold, and all weigh-ins exist,
    // but the final 7-day block has no intake observations.
    const s = analyze({ nutritionDates: dates.slice(0, 19) })
    expect(s.estimate.state).toBe('insufficient_evidence')
    expect(s.estimate.observedMaintenanceKcal).toBeNull()
    expect(s.estimate.explanation).toContain('concentrated unevenly')
    expect(s.plateau.state).toBe('insufficient_evidence')
    expect(s.interventions.some((i) => i.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('withholds a missing middle-week sample even when three other weeks were perfectly logged', () => {
    const s = analyze({
      nutritionDates: [...dates.slice(0, 7), ...dates.slice(14)],
    })
    expect(s.estimate.state).toBe('insufficient_evidence')
    expect(s.estimate.explanation).toContain('seven-day block')
  })

  it('withholds a full logged-intake window when scale measurements only cover its first half', () => {
    const s = analyze({ weightDates: dates.slice(0, 14) })
    expect(s.estimate.state).toBe('insufficient_evidence')
    expect(s.estimate.explanation).toContain('more than four days apart')
    expect(s.estimate.latestWeightKg).toBe(85)
  })

  it('rejects five scale readings clustered into the first half plus one distant late anchor', () => {
    const s = analyze({
      weightDates: [dates[0]!, dates[1]!, dates[2]!, dates[3]!, dates[27]!],
    })
    expect(s.estimate.state).toBe('insufficient_evidence')
    expect(s.estimate.explanation).toContain('concentrated on one side')
  })

  it('uses a shorter 21-day trailing window when an older unobserved intake week blocks 28 days', () => {
    const s = analyze({ nutritionDates: dates.slice(9) })
    expect(s.estimate.state).toBe('available')
    expect(s.estimate.period?.days).toBe(21)
    expect(s.estimate.confidence).toBe('moderate')
    expect(s.estimate.averageIntakeKcal).toBe(2000)
  })

  it('keeps an empirically plausible estimate at moderate confidence when only three recent days are verified', () => {
    const s = analyze({
      nutritionDates: [...dates.slice(0, 21), ...dates.slice(21, 24)],
    })
    expect(s.estimate.state).toBe('available')
    expect(s.estimate.period?.days).toBe(28)
    expect(s.estimate.confidence).toBe('moderate')
    expect(s.estimate.quality.nutrition.reliableDays).toBe(24)
  })

  it('does not count provisional today to repair missing completed-day coverage', () => {
    const s = analyze({
      nutritionDates: dates.slice(0, 19),
      extra: [calorie(AS_OF, 5000), weight(AS_OF, 90)],
    })
    expect(s.completeThrough).toBe('2026-10-14')
    expect(s.estimate.state).toBe('insufficient_evidence')
    expect(s.estimate.latestWeightKg).toBe(85)
    expect(s.estimate.observedMaintenanceKcal).toBeNull()
  })

  it('does not treat an unverified but numerically precise last-week meal as eligible', () => {
    const verified = dates.slice(0, 19)
    const allObservations = [...dates.map((date) => calorie(date)), ...dates.map((date) => weight(date))]
    const snapshot = buildHealthIntelligenceSnapshot({
      range: '30d', asOf: AS_OF, start: '2026-09-16', end: AS_OF,
      today: AS_OF, timezone: 'America/Phoenix', observations: allObservations,
      nutritionVerifiedCompleteDates: new Set(verified),
    })
    const result = buildMaintenanceState({
      asOf: AS_OF, today: AS_OF, intelligence: snapshot, contexts: [],
      eligibleNutritionDates: new Set(verified),
    })
    expect(result.estimate.state).toBe('insufficient_evidence')
    expect(result.estimate.quality.nutrition.reliableDays).toBe(19)
  })
})
