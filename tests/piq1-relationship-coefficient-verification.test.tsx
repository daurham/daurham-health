import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipCoefficientMatchesFrame, relationshipPairsBackedByFrame } from '../src/domain/goal-control.js'
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
})
