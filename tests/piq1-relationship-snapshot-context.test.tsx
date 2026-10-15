import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipCoefficientMatchesFrame, relationshipSnapshotContextIsCurrent } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const asOf = '2026-10-15'
const dates = Array.from({ length: 16 }, (_, i) => addCalendarDays('2026-09-20', i))
const observations: IntelligenceObservation[] = dates.flatMap((date, i) => [
  { key: 'nutrition.protein_g', date, value: 80 + i * 5, unit: 'g',
    provenance: 'owner', sourceIds: ['food-' + i], quality: 'high_confidence' },
  { key: 'wellness.soreness', date: addCalendarDays(date, 1), value: 1 + Math.floor(i / 4),
    unit: '1–5', provenance: 'owner', sourceIds: ['check-' + i] },
])
const brief = { canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
  coverage: { substantiveDomains: ['nutrition', 'wellness'] }, focus: null } as unknown as WeeklyCoachBrief
const goals = [{ id: 'protein', kind: 'nutrition_protein', lifecycle: 'active', label: 'Protein',
  targetState: 'satisfied', deadlineState: 'projected_before_deadline' }] as WeeklyGoalSnapshot[]

function source() {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf, start: '2026-09-17', end: '2026-10-14',
    timezone: 'America/Phoenix', today: asOf, observations,
    nutritionVerifiedCompleteDates: new Set(dates),
  })
}

describe('PIQ-1.6 exact source snapshot context for present-tense observed relationships', () => {
  it('accepts matching as-of context and valid bounded historical source window', () => {
    const snapshot = source()
    expect(relationshipSnapshotContextIsCurrent(snapshot, asOf)).toBe(true)
    const state = buildGoalControlState({ asOf, intelligence: snapshot, brief, goals })
    const observed = state.relationships.find((item) => item.id === 'shared:protein:soreness:next_day')!
    expect(observed.evidence?.snapshotCurrent).toBe(true)
    expect(observed.evidence?.coefficientVerified).toBe(true)
    expect(observed.evidence?.rho).not.toBeNull()
  })

  it('withholds old exact coefficient even when all recorded pairs remain unchanged', () => {
    const original = source()
    const candidate = original.relationships.find((item) => item.id === 'shared:protein:soreness:next_day')!
    const outdated = { ...original, asOf: '2026-10-14' }
    expect(relationshipSnapshotContextIsCurrent(outdated, asOf)).toBe(false)
    const state = buildGoalControlState({ asOf, intelligence: outdated, brief, goals })
    const observed = state.relationships.find((item) => item.id === candidate.id)!
    expect(observed.sampleSize).toBe(candidate.sampleSize)
    expect(observed.evidence?.snapshotCurrent).toBe(false)
    expect(observed.evidence?.coefficientVerified).toBe(false)
    expect(observed.evidence?.rho).toBeNull()
    expect(observed.evidence?.strength).toBeNull()
    expect(observed.evidence?.pairCoverage).toBeNull()
    expect(observed.evidence?.dateClustering).toBeNull()
    expect(observed.evidence?.changeSensitivity).toBeNull()
    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={state} /></MemoryRouter>)
    expect(html).toContain('source snapshot is from another Health date')
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
  })

  it('fails closed for malformed, reversed and future observation windows', () => {
    const original = source()
    for (const period of [
      { ...original.period, start: '2026-02-30' },
      { ...original.period, start: '2026-10-16', end: '2026-10-14' },
      { ...original.period, end: '2026-10-16' },
    ]) {
      const changed = { ...original, period }
      expect(relationshipSnapshotContextIsCurrent(changed, asOf)).toBe(false)
      const state = buildGoalControlState({ asOf, intelligence: changed, brief, goals })
      const match = state.relationships.find((item) => item.id === 'shared:protein:soreness:next_day')!
      expect(match.evidence?.coefficientVerified).toBe(false)
      expect(match.evidence?.rho).toBeNull()
    }
    expect(relationshipSnapshotContextIsCurrent(original, '2026-02-30')).toBe(false)
  })
  it('withholds interpretation when calendar frame, day count or expected range disagrees with the snapshot', () => {
    const original = source()
    const selected = original.relationships.find((item) => item.id === 'shared:protein:soreness:next_day')!
    expect(relationshipCoefficientMatchesFrame(original.frame, selected)).toBe(true)

    const tampered = [
      { ...original, frame: [...original.frame].reverse() }, // unordered, same readings
      { ...original, frame: original.frame.slice(1) }, // a non-cited day missing
      { ...original, frame: [original.frame[0]!, ...original.frame.slice(0, -1)] }, // duplicated day
      { ...original, period: { ...original.period, dayCount: original.period.dayCount + 1 } },
      { ...original, range: '90d' as const },
    ]
    for (const [index, snapshot] of tampered.entries()) {
      // A duplicated row already fails the existing pair-provenance check.
      // All other cases retain a reproducible rho yet fail full-frame context.
      expect(relationshipCoefficientMatchesFrame(snapshot.frame, selected)).toBe(index !== 2)
      expect(relationshipSnapshotContextIsCurrent(snapshot, asOf)).toBe(false)
      const state = buildGoalControlState({ asOf, intelligence: snapshot, brief, goals })
      const observed = state.relationships.find((item) => item.id === selected.id)!
      expect(observed.evidence?.snapshotCurrent).toBe(false)
      expect(observed.evidence?.coefficientVerified).toBe(false)
      expect(observed.evidence?.rho).toBeNull()
      expect(observed.evidence?.pairCoverage).toBeNull()
      expect(observed.evidence?.dateClustering).toBeNull()
    }

    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={
      buildGoalControlState({ asOf, intelligence: tampered[0]!, brief, goals })
    } /></MemoryRouter>)
    expect(html).toContain('invalid or inconsistent observation window')
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
    expect(html).not.toContain('Pairing opportunity: 16 of')
  })

})
