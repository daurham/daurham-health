import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, relationshipScreeningMetadataMatchesDefinition, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipCoefficientMatchesFrame, relationshipPairsBackedByFrame, relationshipReportedLabelsMatchCoefficient } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const asOf = '2026-10-15'
const observations: IntelligenceObservation[] = Array.from({ length: 16 }, (_, i) => {
  const date = addCalendarDays('2026-09-20', i)
  return [
    { key: 'sleep.total_minutes', date, value: 355 + i * 11,
      unit: 'min', provenance: 'device', sourceIds: [] },
    { key: 'wellness.energy', date, value: Math.floor(i / 4) + 1,
      unit: '1–5', provenance: 'owner', sourceIds: [] },
  ] as IntelligenceObservation[]
}).flat()
function fixture() {
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf, start: '2026-09-17', end: '2026-10-14',
    timezone: 'America/Phoenix', today: asOf, observations,
  })
  const brief = {
    canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
    coverage: { substantiveDomains: ['sleep', 'wellness'] }, focus: null,
  } as unknown as WeeklyCoachBrief
  const goals = [{ id: 'sleep', kind: 'sleep_duration', lifecycle: 'active',
    label: 'Sleep', targetState: 'satisfied', deadlineState: 'projected_before_deadline',
  }] as WeeklyGoalSnapshot[]
  return { intelligence, brief, goals }
}

describe('PIQ-1.6 exact relationship coefficient provenance', () => {
  it('verifies the original rho but rejects a changed or invalid reported statistic', () => {
    const source = fixture()
    const relation = source.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')!
    expect(relation.rho).not.toBeNull()
    expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, relation)).toBe(true)
    expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, {
      ...relation, rho: relation.rho! + 1e-12,
    })).toBe(true)
    expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, {
      ...relation, rho: relation.rho! - 0.1,
    })).toBe(false)
    for (const rho of [null, Number.NaN, 1.5, -1.1]) {
      expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, {
        ...relation, rho,
      })).toBe(false)
    }
  })

  it('withholds stale precision when a finite reading changes but its recorded pair still exists', () => {
    const source = fixture()
    const relation = source.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')!
    const frame = source.intelligence.frame.map((day) => day.date === '2026-09-21'
      ? { ...day, signals: { ...day.signals,
        'wellness.energy': { ...day.signals['wellness.energy']!, value: 5 } } }
      : day)
    expect(relationshipPairsBackedByFrame(frame, relation)).toBe(true)
    expect(relationshipCoefficientMatchesFrame(frame, relation)).toBe(false)
    const stale = buildGoalControlState({
      asOf, ...source, intelligence: { ...source.intelligence, frame },
    })
    const entry = stale.relationships.find((item) => item.id === relation.id)!
    expect(entry.sampleSize).toBe(16)
    expect(entry.confidence).toBe('unknown')
    expect(entry.evidence?.coefficientVerified).toBe(false)
    expect(entry.evidence?.rho).toBeNull()
    expect(entry.evidence?.strength).toBeNull()
    expect(entry.evidence?.pairCoverage).toBeNull()
    expect(entry.evidence?.changeSensitivity).toBeNull()
    const html = renderToStaticMarkup(
      <MemoryRouter><GoalControlCard state={stale} /></MemoryRouter>,
    )
    expect(html).toContain('could not be reproduced from its cited paired readings')
    expect(html).toContain('reported coefficient, strength and precise date diagnostics are withheld')
    expect(html).toContain('16 previously reported date pairs')
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
    expect(html).not.toContain('Pairing opportunity: 16 of')
    const current = buildGoalControlState({ asOf, ...source })
    expect(current.relationships[0]?.evidence?.coefficientVerified).toBe(true)
    expect(current.relationships[0]?.evidence?.rho).toBe(relation.rho)
  })
  it('withholds a reproducible coefficient paired with a forged direction or strength label', () => {
    const source = fixture()
    const relation = source.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')!
    expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, relation)).toBe(true)
    expect(relationshipReportedLabelsMatchCoefficient(relation)).toBe(true)

    const inaccurate = [
      { ...relation, strength: relation.strength === 'strong' ? 'weak' as const : 'strong' as const },
      { ...relation, direction: relation.direction === 'positive' ? 'negative' as const : 'positive' as const },
    ]
    for (const forged of inaccurate) {
      expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, forged)).toBe(true)
      expect(relationshipReportedLabelsMatchCoefficient(forged)).toBe(false)
      const stale = buildGoalControlState({
        asOf, ...source,
        intelligence: { ...source.intelligence,
          relationships: source.intelligence.relationships.map((item) =>
            item.id === relation.id ? forged : item),
        },
      })
      const entry = stale.relationships.find((item) => item.id === relation.id)!
      expect(entry.confidence).toBe('unknown')
      expect(entry.evidence?.coefficientVerified).toBe(false)
      expect(entry.evidence?.rho).toBeNull()
      expect(entry.evidence?.strength).toBeNull()
      expect(entry.evidence?.pairCoverage).toBeNull()
      const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={stale} /></MemoryRouter>)
      expect(html).toContain('reported strength/direction did not agree')
      expect(html).toContain('Spearman rank correlation (ρ): unavailable')
    }
    expect(relationshipReportedLabelsMatchCoefficient({ ...relation, rho: Number.NaN })).toBe(false)
    expect(relationshipReportedLabelsMatchCoefficient({ ...relation, rho: null })).toBe(false)
    expect(relationshipReportedLabelsMatchCoefficient({ ...relation, rho: 1.5 })).toBe(false)
  })

  it('rejects stale screening metadata even if the exact recorded correlation is reproducible', () => {
    const source = fixture()
    const original = source.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')!
    expect(original.sampleSize).toBe(16)
    expect(original.requiredSampleSize).toBe(10)
    expect(original.confidence).toBe('high')
    expect(relationshipScreeningMetadataMatchesDefinition(original)).toBe(true)
    expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, original)).toBe(true)

    const invalid = [
      { ...original, id: 'shared:sleep:hunger' },
      { ...original, xKey: 'activity.steps' as const },
      { ...original, yKey: 'wellness.hunger' as const },
      { ...original, lagDays: 1 },
      { ...original, requiredSampleSize: 14 },
      { ...original, requiredSampleSize: 17 },
      { ...original, sampleSize: 9 },
      { ...original, sampleSize: 16.5 },
      { ...original, confidence: 'moderate' as const },
      { ...original, state: 'below_threshold' as const },
      { ...original, rho: 0.1 },
    ]
    for (const altered of invalid) {
      expect(relationshipScreeningMetadataMatchesDefinition(altered)).toBe(false)
    }
    const untouched = buildGoalControlState({ asOf, ...source })
    expect(untouched.relationships[0]?.evidence?.coefficientVerified).toBe(true)

    // Both cases have the same actual X/Y observations and numerical rho.
    // Only the registered minimum or the count-based label has been changed.
    for (const altered of [
      { ...original, requiredSampleSize: 14 },
      { ...original, confidence: 'moderate' as const },
    ]) {
      expect(relationshipCoefficientMatchesFrame(source.intelligence.frame, altered)).toBe(true)
      const stale = buildGoalControlState({
        asOf, ...source,
        intelligence: {
          ...source.intelligence,
          relationships: source.intelligence.relationships.map((item) =>
            item.id === original.id ? altered : item),
        },
      })
      const entry = stale.relationships.find((item) => item.id === original.id)!
      expect(entry.confidence).toBe('unknown')
      expect(entry.evidence?.coefficientVerified).toBe(false)
      expect(entry.evidence?.rho).toBeNull()
      expect(entry.evidence?.pairCoverage).toBeNull()
      expect(entry.evidence?.singlePairSensitivity).toBeNull()
      expect(entry.evidence?.strength).toBeNull()
      const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={stale} /></MemoryRouter>)
      expect(html).toContain('registered signal pairing, lag, minimum sample or count grade')
      expect(html).toContain('Historical / unverified')
      expect(html).toContain('Spearman rank correlation (ρ): unavailable')
    }
  })

})
