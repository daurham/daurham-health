import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, type GoalControlState } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const asOf = '2026-10-15'
const sourceWindow = { start: '2026-09-17', end: '2026-10-14' }

function observationDates(pairs: number): IntelligenceObservation[] {
  return Array.from({ length: pairs }, (_, i) => {
    const date = addCalendarDays('2026-09-20', i)
    return [
      { key: 'sleep.total_minutes', date, value: 355 + i * 11,
        unit: 'min', provenance: 'device', sourceIds: [] },
      { key: 'wellness.energy', date, value: Math.floor(i / 4) + 1,
        unit: '1–5', provenance: 'owner', sourceIds: [] },
    ] as IntelligenceObservation[]
  }).flat()
}
function inputs(pairs: number) {
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf, start: sourceWindow.start, end: sourceWindow.end,
    timezone: 'America/Phoenix', today: asOf, observations: observationDates(pairs),
  })
  const brief = {
    canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
    coverage: { substantiveDomains: ['sleep', 'wellness', 'activity'] },
    focus: null,
  } as unknown as WeeklyCoachBrief
  const goals = [{
    id: 'sleep-goal', kind: 'sleep_duration', lifecycle: 'active', label: 'Sleep',
    targetState: 'satisfied', deadlineState: 'projected_before_deadline',
  }] as WeeklyGoalSnapshot[]
  return { intelligence, brief, goals }
}
function render(state: GoalControlState) {
  return renderToStaticMarkup(
    <MemoryRouter><GoalControlCard state={state} /></MemoryRouter>,
  )
}

describe('PIQ-1.6 paired relationship evidence is observational', () => {
  it('shows verified pair window and separate per-signal source provenance, without claiming causation', () => {
    const state = buildGoalControlState({ asOf, ...inputs(16) })
    const rel = state.relationships.find((item) => item.id === 'shared:sleep:energy')
    expect(rel).toBeDefined()
    expect(rel?.sampleSize).toBe(16)
    expect(rel?.confidence).toBe('high')
    expect(rel?.evidence).toMatchObject({
      sourceWindow,
      pairedWindow: { start: '2026-09-20', end: '2026-10-05' },
      lagDays: 0, requiredPairs: 10,
      sources: [
        { label: 'Sleep duration', observedDays: 16, eligibleDays: 28,
          provenance: { device: 16 }, confidence: 'moderate' },
        { label: 'Energy', observedDays: 16, eligibleDays: 28,
          provenance: { owner: 16 }, confidence: 'moderate' },
      ],
    })
    expect(state.period).toEqual({ start: '2026-10-08', end: '2026-10-14' })
    const html = render(state)
    expect(html).toContain('Observed relationships (1) · not causal')
    expect(html).toContain('Paired-sample confidence: high · 16 matched date pairs')
    expect(html).toContain('screening minimum 10 pairs')
    expect(html).toContain('Source observation window: 2026-09-17 to 2026-10-14')
    expect(html).toContain('Matched dates: 2026-09-20 to 2026-10-05')
    expect(html).toContain('Sleep duration: 16/28 observed dates')
    expect(html).toContain('source coverage confidence moderate')
    expect(html).toContain('device 16')
    expect(html).toContain('owner 16')
    expect(html).toContain('not evidence that changing one factor will change another')
    expect(html).toContain('Review source 1')
    expect(html).not.toContain('proves that sleep')
  })

  it('does not promote too few pairs into a displayed association', () => {
    const state = buildGoalControlState({ asOf, ...inputs(8) })
    expect(state.relationships).toEqual([])
    expect(render(state)).not.toContain('Observed relationships (')
  })

  it('reports unavailable provenance as unavailable, never invented zero-coverage evidence', () => {
    const source = inputs(16)
    const state = buildGoalControlState({
      asOf, ...source, intelligence: { ...source.intelligence, coverage: [] },
    })
    expect(state.relationships).toHaveLength(1)
    expect(state.relationships[0]?.evidence?.sources).toEqual([])
    const html = render(state)
    expect(html).toContain('Source observation counts are unavailable')
    expect(html).not.toContain('0/28 observed dates')
  })
})
