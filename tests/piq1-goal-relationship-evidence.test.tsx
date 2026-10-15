import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation, type IntelligenceFrameDay } from '../src/domain/intelligence/shared.js'
import { spearmanRho } from '../src/domain/intelligence/spearman.js'
import { buildGoalControlState, relationshipDateClustering, relationshipDayToDaySensitivity, type GoalControlState } from '../src/domain/goal-control.js'
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
    const data = inputs(16)
    const state = buildGoalControlState({ asOf, ...data })
    const rel = state.relationships.find((item) => item.id === 'shared:sleep:energy')
    const measured = data.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')
    expect(rel?.evidence?.rho).toBe(measured?.rho)
    expect(rel?.evidence?.strength).toBe(measured?.strength)
    expect(typeof rel?.evidence?.rho).toBe('number')
    expect(rel).toBeDefined()
    expect(rel?.sampleSize).toBe(16)
    expect(rel?.confidence).toBe('high')
    expect(rel?.evidence).toMatchObject({
      sourceWindow,
      pairedWindow: { start: '2026-09-20', end: '2026-10-05' },
      lagDays: 0, requiredPairs: 10,
      screening: { evaluatedPairs: 10, evidenceQualifiedPairs: 1, goalRelevantPairs: 1, shownPairs: 1 },
      dateClustering: { distinctDates: 16, contiguousRuns: 1, longestRunDays: 16 },
      changeSensitivity: { adjacentTransitions: 15, rho: null },
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
    expect(html).toContain('Selection context:')
    expect(html).toContain('10 candidate relationship definitions examined')
    expect(html).toContain('met the configured observation and association display rules')
    expect(html).toContain('not by effect magnitude')
    expect(html).toContain('not a multiple-comparisons adjustment')
    expect(html).toContain('Matched-pair count grade: high · 16 matched date pairs')
    expect(html).toContain('This grade describes sample availability, not statistical certainty')
    expect(html).toContain('Spearman rank correlation (ρ): ')
    expect(html).toContain('reported strength: ')
    expect(html).toContain('statistical significance,')
    expect(html).toContain('a causal effect have not been established')
    expect(html).toContain('Matched-date clustering: 16 distinct tracked dates')
    expect(html).toContain('across 1 consecutive-day run')
    expect(html).toContain('longest run 16 days')
    expect(html).toContain('not independent trials')
    expect(html).toContain('Day-to-day sensitivity: 15 consecutive matched-day transitions')
    expect(html).toContain('first-difference Spearman ρ: unavailable')
    expect(html).toContain('not a test of significance')
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

  it('discloses screening before choosing three cards rather than implying three independent discoveries', () => {
    const source = inputs(16)
    const seed = source.intelligence.relationships.find((item) => item.id === 'shared:sleep:energy')!
    // Synthetic definitions: five meet the existing display filters, four
    // match the active Sleep goal, and the visible list is capped at three.
    const relationships = source.intelligence.relationships.map((item, index) => index < 5
      ? {
        ...item,
        id: `synthetic:screen:${index}`,
        xKey: index === 4 ? 'hydration.ml' as const : 'sleep.total_minutes' as const,
        yKey: index === 4 ? 'bowel.count' as const : 'wellness.energy' as const,
        state: 'available' as const,
        confidence: 'high' as const,
        rho: 0.6,
        sampleSize: 16,
        evidenceDates: [...seed.evidenceDates],
      }
      : item)
    const state = buildGoalControlState({
      asOf, ...source,
      intelligence: { ...source.intelligence, relationships },
    })
    expect(state.relationships).toHaveLength(3)
    expect(state.relationships.map((item) => item.evidence?.screening)).toEqual([
      { evaluatedPairs: 10, evidenceQualifiedPairs: 5, goalRelevantPairs: 4, shownPairs: 3 },
      { evaluatedPairs: 10, evidenceQualifiedPairs: 5, goalRelevantPairs: 4, shownPairs: 3 },
      { evaluatedPairs: 10, evidenceQualifiedPairs: 5, goalRelevantPairs: 4, shownPairs: 3 },
    ])
    const html = render(state)
    expect(html).toContain('10 candidate relationship definitions examined')
    expect(html).toContain('4 also matched active goals')
    expect(html).toContain('3 displayed (maximum three)')
    expect(html).toContain('displaying a selected subset can exaggerate apparent patterns')
    expect(html).not.toContain('statistically significant')
  })

  it('does not promote too few pairs into a displayed association', () => {
    const state = buildGoalControlState({ asOf, ...inputs(8) })
    expect(state.relationships).toEqual([])
    expect(render(state)).not.toContain('Observed relationships (')
  })

  it('does not invent a coefficient when its source evidence lacks one', () => {
    const state = buildGoalControlState({ asOf, ...inputs(16) })
    const relationship = state.relationships[0]!
    const noCoefficient: GoalControlState = {
      ...state, relationships: [{
        ...relationship, evidence: { ...relationship.evidence!, rho: null, strength: null },
      }],
    }
    const html = render(noCoefficient)
    expect(html).toContain('Spearman rank correlation (ρ): unavailable')
    expect(html).toContain('reported strength: unavailable')
    expect(html).not.toContain('NaN')
  })

  it('separates lagged pairs, repeated source dates and distant runs without claiming independent samples', () => {
    const pairs = [
      { xDate: '2026-09-20', yDate: '2026-09-21' },
      { xDate: '2026-09-21', yDate: '2026-09-22' },
      { xDate: '2026-09-21', yDate: '2026-09-22' },
      { xDate: '2026-09-24', yDate: '2026-09-25' },
      { xDate: '2026-09-26', yDate: '2026-09-27' },
      { xDate: '2026-09-27', yDate: '2026-09-28' },
    ]
    expect(relationshipDateClustering(pairs)).toEqual({
      distinctDates: 5, contiguousRuns: 3, longestRunDays: 2,
    })
    expect(relationshipDateClustering([])).toBeNull()
    expect(relationshipDateClustering([{ xDate: 'not-a-date', yDate: '2026-09-22' }])).toBeNull()
  })

  it('keeps unavailable date-clustering evidence visibly unavailable, not zero or independent', () => {
    const original = buildGoalControlState({ asOf, ...inputs(16) })
    const updated: GoalControlState = {
      ...original,
      relationships: original.relationships.map((rel) => ({
        ...rel, evidence: rel.evidence ? { ...rel.evidence, dateClustering: null } : undefined,
      })),
    }
    const html = render(updated)
    expect(html).toContain('Matched-date clustering is unavailable')
    expect(html).not.toContain('0 distinct tracked dates')
    expect(html).not.toContain('independent trials,')
  })

  it('separates shared time trends from opposite day-to-day changes', () => {
    let x = 350
    let y = 3000
    const frame: IntelligenceFrameDay[] = Array.from({ length: 16 }, (_, i) => {
      if (i > 0) {
        x += i % 2 === 0 ? 2 : 5
        y += i % 2 === 0 ? 500 : 200
      }
      const date = addCalendarDays('2026-09-20', i)
      return { date, signals: {
        'sleep.total_minutes': { key: 'sleep.total_minutes', date, value: x,
          unit: 'min', provenance: 'device' as const, sourceIds: [] },
        'activity.steps': { key: 'activity.steps', date, value: y,
          unit: 'steps', provenance: 'device' as const, sourceIds: [] },
      } }
    })
    const spec = {
      xKey: 'sleep.total_minutes' as const, yKey: 'activity.steps' as const,
      lagDays: 0, evidenceDates: frame.map(({ date }) => ({ xDate: date, yDate: date })),
    }
    const raw = spearmanRho(
      frame.map((day) => day.signals['sleep.total_minutes']!.value),
      frame.map((day) => day.signals['activity.steps']!.value),
    )
    expect(raw).toBeCloseTo(1)
    const sensitivity = relationshipDayToDaySensitivity(frame, spec)
    expect(sensitivity?.adjacentTransitions).toBe(15)
    expect(sensitivity?.rho).toBeCloseTo(-1, 8)

    const gaps = { ...spec, evidenceDates: spec.evidenceDates.filter((_, i) => i % 2 === 0) }
    expect(relationshipDayToDaySensitivity(frame, gaps)).toEqual({
      adjacentTransitions: 0, rho: null,
    })
    const tooFew = { ...spec, evidenceDates: spec.evidenceDates.slice(0, 6) }
    expect(relationshipDayToDaySensitivity(frame, tooFew)).toEqual({
      adjacentTransitions: 5, rho: null,
    })
  })

  it('fails closed on malformed/duplicate pairs and preserves lagged X anchor continuity', () => {
    const data = inputs(16)
    const frame = data.intelligence.frame
    const dates = Array.from({ length: 12 }, (_, i) => addCalendarDays('2026-09-20', i))
    const source = { xKey: 'sleep.total_minutes' as const, yKey: 'wellness.energy' as const,
      lagDays: 0, evidenceDates: dates.map((d) => ({ xDate: d, yDate: d })) }
    expect(relationshipDayToDaySensitivity(frame, {
      ...source, evidenceDates: [...source.evidenceDates, source.evidenceDates[0]!],
    })).toBeNull()
    expect(relationshipDayToDaySensitivity(frame, {
      ...source, evidenceDates: [
        { xDate: '2026-02-30', yDate: '2026-02-30' }, source.evidenceDates[0]!,
      ],
    })).toBeNull()
    expect(relationshipDayToDaySensitivity(frame, {
      ...source, evidenceDates: [
        { xDate: '2026-09-20', yDate: '2026-09-21' }, source.evidenceDates[1]!,
      ],
    })).toBeNull()
    const shifted = dates.slice(0, 11).map((xDate) => ({
      xDate, yDate: addCalendarDays(xDate, 1),
    }))
    expect(relationshipDayToDaySensitivity(frame, {
      ...source, lagDays: 1, evidenceDates: shifted,
    })).toMatchObject({ adjacentTransitions: 10 })
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
