import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipCoefficientMatchesFrame, relationshipNutritionPairsRemainEligible } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const asOf = '2026-10-15'
const nutritionDates = Array.from({ length: 16 }, (_, i) => addCalendarDays('2026-09-20', i))
const observations: IntelligenceObservation[] = nutritionDates.flatMap((date, i) => [
  { key: 'nutrition.protein_g', date, value: 80 + i * 5,
    unit: 'g', provenance: 'owner', sourceIds: ['food-entry-' + i], quality: 'high_confidence' },
  { key: 'wellness.soreness', date: addCalendarDays(date, 1), value: 1 + Math.floor(i / 4),
    unit: '1–5', provenance: 'owner', sourceIds: ['daily-check-' + i] },
])
const brief = {
  canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
  coverage: { substantiveDomains: ['nutrition', 'wellness'] }, focus: null,
} as unknown as WeeklyCoachBrief
const goals = [{ id: 'protein', kind: 'nutrition_protein', lifecycle: 'active',
  label: 'Protein', targetState: 'satisfied', deadlineState: 'projected_before_deadline',
}] as WeeklyGoalSnapshot[]
function source() {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf, start: '2026-09-17', end: '2026-10-14', timezone: 'America/Phoenix',
    today: asOf, observations, nutritionVerifiedCompleteDates: new Set(nutritionDates),
  })
}

describe('PIQ-1.6 owner-confirmed nutrition relationship eligibility', () => {
  it('displays a fully verified recorded protein/recovery association', () => {
    const intelligence = source()
    const candidate = intelligence.relationships.find((x) => x.id === 'shared:protein:soreness:next_day')!
    expect(candidate.state).toBe('available')
    expect(relationshipCoefficientMatchesFrame(intelligence.frame, candidate)).toBe(true)
    expect(relationshipNutritionPairsRemainEligible(intelligence.frame, candidate)).toBe(true)
    const current = buildGoalControlState({ asOf, intelligence, brief, goals })
    const selected = current.relationships.find((x) => x.id === candidate.id)!
    expect(selected.evidence?.coefficientVerified).toBe(true)
    expect(selected.evidence?.rho).toBe(candidate.rho)
  })

  it('withholds unchanged numeric association after full-day nutrition confirmation is revoked', () => {
    const intelligence = source()
    const candidate = intelligence.relationships.find((x) => x.id === 'shared:protein:soreness:next_day')!
    const changedFrame = intelligence.frame.map((day) => day.date !== nutritionDates[4]
      ? day
      : { ...day, signals: { ...day.signals,
        'nutrition.protein_g': { ...day.signals['nutrition.protein_g']!, dayCompleteness: 'unverified' as const },
      } })
    // Values and cited dates still match, so a coefficient-only recheck is insufficient.
    expect(relationshipCoefficientMatchesFrame(changedFrame, candidate)).toBe(true)
    expect(relationshipNutritionPairsRemainEligible(changedFrame, candidate)).toBe(false)
    const current = buildGoalControlState({ asOf, intelligence: { ...intelligence, frame: changedFrame }, brief, goals })
    const changed = current.relationships.find((x) => x.id === candidate.id)!
    expect(changed.sampleSize).toBe(candidate.sampleSize)
    expect(changed.confidence).toBe('unknown')
    expect(changed.evidence?.rho).toBeNull()
    expect(changed.evidence?.coefficientVerified).toBe(false)
    expect(changed.evidence?.pairCoverage).toBeNull()
    expect(changed.evidence?.dateClustering).toBeNull()
    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={current} /></MemoryRouter>)
    expect(html).toContain('nutrition day is not both confirmed complete and source-reliable')
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
  })

  it.each([
    { quality: 'estimate_heavy', provenance: 'ai' as const, reason: 'estimate-heavy log' },
    { quality: 'mixed', provenance: 'mixed' as const, reason: 'mixed source reliability' },
    { quality: 'unknown', provenance: 'unknown' as const, reason: 'unknown nutrition source' },
    { quality: null, provenance: 'owner' as const, reason: 'missing quality metadata' },
  ])('withholds verified-looking rho for a complete day with $reason', ({ quality, provenance }) => {
    const intelligence = source()
    const candidate = intelligence.relationships.find((x) => x.id === 'shared:protein:soreness:next_day')!
    const changedFrame = intelligence.frame.map((day) => day.date !== nutritionDates[4]
      ? day
      : { ...day, signals: { ...day.signals,
        'nutrition.protein_g': {
          ...day.signals['nutrition.protein_g']!,
          quality, provenance,
        },
      } })
    // Values, dates, confirmed-day status and original correlation all match.
    expect(changedFrame.find((day) => day.date === nutritionDates[4])?.signals['nutrition.protein_g']?.dayCompleteness)
      .toBe('verified_complete')
    expect(relationshipCoefficientMatchesFrame(changedFrame, candidate)).toBe(true)
    expect(relationshipNutritionPairsRemainEligible(changedFrame, candidate)).toBe(false)
    const state = buildGoalControlState({
      asOf, intelligence: { ...intelligence, frame: changedFrame }, brief, goals,
    })
    const selected = state.relationships.find((item) => item.id === candidate.id)!
    expect(selected.sampleSize).toBe(candidate.sampleSize)
    expect(selected.confidence).toBe('unknown')
    expect(selected.evidence?.coefficientVerified).toBe(false)
    expect(selected.evidence?.rho).toBeNull()
    expect(selected.evidence?.pairCoverage).toBeNull()
    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={state} /></MemoryRouter>)
    expect(html).toContain('nutrition day is not both confirmed complete and source-reliable')
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
  })

  it('checks nutrition reliability on either endpoint, not just X-side protein', () => {
    const intelligence = source()
    const date = nutritionDates[1]!
    const relation = {
      xKey: 'wellness.soreness' as const, yKey: 'nutrition.protein_g' as const,
      evidenceDates: [{ xDate: date, yDate: date }],
    }
    expect(relationshipNutritionPairsRemainEligible(intelligence.frame, relation)).toBe(true)
    const changedFrame = intelligence.frame.map((day) =>
      day.date === date
        ? { ...day, signals: { ...day.signals,
          'nutrition.protein_g': { ...day.signals['nutrition.protein_g']!, quality: 'mixed' },
        } } : day)
    expect(relationshipNutritionPairsRemainEligible(changedFrame, relation)).toBe(false)
    expect(relationshipNutritionPairsRemainEligible(intelligence.frame, {
      ...relation, evidenceDates: [],
    })).toBe(false)
  })

  it('does not impose a nutrition confirmation rule on unrelated sleep/recovery pairs', () => {
    const intelligence = source()
    const nonNutrition = {
      xKey: 'sleep.total_minutes' as const,
      yKey: 'wellness.energy' as const,
      evidenceDates: [{ xDate: '2026-09-20', yDate: '2026-09-20' }],
    }
    expect(relationshipNutritionPairsRemainEligible(intelligence.frame, nonNutrition)).toBe(true)
  })
})
