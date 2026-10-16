import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { spearmanRho } from '../src/domain/intelligence/spearman.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceFrameDay, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipSinglePairDeletionSensitivity } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const dates = Array.from({ length: 12 }, (_, i) => addCalendarDays('2026-09-25', i))
function pairFrame(ys: readonly number[], xs: readonly number[] = dates.map((_, i) => i + 1)) {
  const frame: IntelligenceFrameDay[] = dates.map((date, i) => ({
    date,
    signals: {
      'activity.steps': { key: 'activity.steps', date, value: xs[i]!, unit: 'steps', provenance: 'device', sourceIds: [] },
      'wellness.energy': { key: 'wellness.energy', date, value: ys[i]!, unit: '1–5', provenance: 'owner', sourceIds: [] },
    },
  }))
  const relation = {
    xKey: 'activity.steps' as const,
    yKey: 'wellness.energy' as const,
    evidenceDates: dates.map((date) => ({ xDate: date, yDate: date })),
    rho: spearmanRho(xs, ys),
  }
  return { frame, relation }
}

describe('PIQ-1.6 single-pair influence, descriptive only', () => {
  it('detects when removing one recorded pair changes the direction category', () => {
    const { frame, relation } = pairFrame([2, 5, 5, 1, 4, 3, 3, 4, 7, 2, 4, 4])
    const result = relationshipSinglePairDeletionSensitivity(frame, relation)
    expect(result?.testedRemovals).toBe(12)
    expect(result?.directionSensitive).toBe(true)
    expect(result?.minRho).toBeLessThan(-0.05)
    expect(result?.maxRho).toBeGreaterThan(0.05)
  })

  it('does not falsely report fragile direction for consistent rank association', () => {
    const { frame, relation } = pairFrame(dates.map((_, i) => i + 1))
    const result = relationshipSinglePairDeletionSensitivity(frame, relation)
    expect(result?.directionSensitive).toBe(false)
    expect(result?.minRho).toBeCloseTo(1)
    expect(result?.maxRho).toBeCloseTo(1)
  })

  it('reports unknown rather than stable when deleting a pair destroys variation', () => {
    const { frame, relation } = pairFrame(dates.map((_, i) => i + 1), dates.map((_, i) => i === 11 ? 10 : 1))
    const result = relationshipSinglePairDeletionSensitivity(frame, relation)
    expect(result).toEqual({ testedRemovals: 12, minRho: null, maxRho: null, directionSensitive: null })
  })

  it('withholds the sensitivity range if the underlying source coefficient is unverified', () => {
    const asOf = '2026-10-15'
    const observations: IntelligenceObservation[] = dates.flatMap((date, i) => [
      { key: 'sleep.total_minutes', date, value: 310 + i * 10, unit: 'min',
        provenance: 'device', sourceIds: [] },
      { key: 'wellness.energy', date, value: Math.floor(i / 3) + 1, unit: '1–5',
        provenance: 'owner', sourceIds: [] },
    ])
    const snapshot = buildHealthIntelligenceSnapshot({
      range: '30d', asOf, start: '2026-09-17', end: '2026-10-14',
      timezone: 'America/Phoenix', today: asOf, observations,
    })
    const brief = { canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
      coverage: { substantiveDomains: ['sleep', 'wellness'] }, focus: null } as unknown as WeeklyCoachBrief
    const goals = [{ id: 'sleep', kind: 'sleep_duration', lifecycle: 'active',
      label: 'Sleep', targetState: 'satisfied', deadlineState: 'projected_before_deadline' }] as WeeklyGoalSnapshot[]
    const good = buildGoalControlState({ asOf, intelligence: snapshot, brief, goals })
    const related = good.relationships.find((item) => item.id === 'shared:sleep:energy')!
    expect(related.evidence?.coefficientVerified).toBe(true)
    expect(related.evidence?.singlePairSensitivity?.testedRemovals).toBe(12)
    const goodHtml = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={good} /></MemoryRouter>)
    expect(goodHtml).toContain('Single-pair influence: omitting each of 12 matched pairs')
    expect(goodHtml).toContain('Observed relationships (')
    expect(goodHtml).toContain('Verified against loaded readings')
    expect(goodHtml).toContain('How Health selected these patterns</summary>')
    expect(goodHtml).toMatch(/<details[^>]*><summary[^>]*>Evidence and sensitivity checks<\/summary>[\s\S]*?Single-pair influence:/)
    // The technical statistics and screening context remain available in
    // native closed-by-default disclosure elements, not the default scan.
    expect(goodHtml).not.toMatch(/<details[^>]* open(?:=|>)/)
    expect(goodHtml).toContain('Review source 1</a>')

    const modified = { ...snapshot, asOf: '2026-10-14' }
    const stale = buildGoalControlState({ asOf, intelligence: modified, brief, goals })
    const bad = stale.relationships.find((item) => item.id === 'shared:sleep:energy')!
    expect(bad.evidence?.singlePairSensitivity).toBeNull()
    const badHtml = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={stale} /></MemoryRouter>)
    expect(badHtml).toContain('Single-pair influence: unavailable')
    expect(badHtml).not.toContain('omitting each of 12 matched pairs')
    expect(badHtml).toContain('Historical / unverified')
    expect(badHtml).toContain('Its reported coefficient, strength and precise date diagnostics are withheld')
    expect(badHtml).toContain('Evidence and sensitivity checks</summary>')
  })
})
