import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/training-plan.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildGoalControlState, relationshipSourceCoverageMatchesFrame } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.js'

const asOf = '2026-10-15'
function fixture(nutrition = false) {
  const logged = new Set<string>()
  const observations: IntelligenceObservation[] = Array.from({ length: 16 }, (_, index) => {
    const date = addCalendarDays('2026-09-20', index)
    if (nutrition) {
      logged.add(date)
      return [
        { key: 'nutrition.protein_g', date, value: 85 + index * 6, unit: 'g',
          provenance: 'owner', sourceIds: [], quality: 'high_confidence' },
        { key: 'wellness.soreness', date: addCalendarDays(date, 1),
          value: Math.floor(index / 4) + 1, unit: '1–5', provenance: 'owner', sourceIds: [] },
      ] as IntelligenceObservation[]
    }
    return [
      { key: 'sleep.total_minutes', date, value: 360 + index * 11,
        unit: 'min', provenance: 'device', sourceIds: [] },
      { key: 'wellness.energy', date, value: Math.floor(index / 4) + 1,
        unit: '1–5', provenance: 'owner', sourceIds: [] },
    ] as IntelligenceObservation[]
  }).flat()
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf, start: '2026-09-17', end: '2026-10-14',
    timezone: 'America/Phoenix', today: asOf, observations,
    ...(nutrition ? { nutritionVerifiedCompleteDates: logged, nutritionVerificationStatus: 'available' as const } : {}),
  })
  const key = nutrition ? 'shared:protein:soreness:next_day' : 'shared:sleep:energy'
  const brief = {
    canGenerate: true, period: { start: '2026-10-08', end: '2026-10-14' },
    coverage: { substantiveDomains: ['sleep', 'wellness', 'nutrition'] }, focus: null,
  } as unknown as WeeklyCoachBrief
  const goals = [{
    id: 'goal', kind: nutrition ? 'nutrition_protein' : 'sleep_duration', lifecycle: 'active',
    label: nutrition ? 'Protein' : 'Sleep', targetState: 'satisfied',
    deadlineState: 'projected_before_deadline',
  }] as WeeklyGoalSnapshot[]
  return { intelligence, brief, goals, key }
}

describe('PIQ-1.6 observed relationship source coverage reconciliation', () => {
  it('keeps a complete, internally consistent source count and provenance report', () => {
    for (const nutrition of [false, true]) {
      const base = fixture(nutrition)
      const source = base.intelligence.relationships.find((r) => r.id === base.key)!
      expect(source.state).toBe('available')
      expect(relationshipSourceCoverageMatchesFrame(base.intelligence, source)).toBe(true)
      const state = buildGoalControlState({ asOf, ...base })
      const item = state.relationships.find((r) => r.id === base.key)!
      expect(item.evidence?.coefficientVerified).toBe(true)
      expect(item.evidence?.rho).not.toBeNull()
      expect(item.evidence?.sources).toHaveLength(2)
    }
  })

  it('withholds numeric conclusions when a source count, grade, label or provenance report is stale', () => {
    const base = fixture()
    const source = base.intelligence.relationships.find((r) => r.id === base.key)!
    const first = base.intelligence.coverage.find((s) => s.key === source.xKey)!
    for (const invalid of [
      { ...first, observedDays: first.observedDays - 1 },
      { ...first, eligibleDays: first.eligibleDays + 1 },
      { ...first, coveragePct: first.coveragePct + 1 },
      { ...first, provenance: { device: first.observedDays - 1 } },
      { ...first, confidence: 'moderate' as const },
      { ...first, label: 'A different sensor' },
      { ...first, excludedObservations: -1 },
    ]) {
      const altered = { ...base.intelligence,
        coverage: base.intelligence.coverage.map((item) => item.key === first.key ? invalid : item) }
      expect(relationshipSourceCoverageMatchesFrame(altered, source)).toBe(false)
      const state = buildGoalControlState({ asOf, ...base, intelligence: altered })
      const item = state.relationships.find((r) => r.id === base.key)!
      expect(item.evidence?.coefficientVerified).toBe(false)
      expect(item.confidence).toBe('unknown')
      expect(item.evidence?.rho).toBeNull()
      expect(item.evidence?.sources).toEqual([])
      const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={state} /></MemoryRouter>)
      expect(html).toContain('reported source coverage/provenance did not match loaded readings')
      expect(html).toContain('Historical / unverified')
      expect(html).toContain('Spearman rank correlation (ρ): unavailable')
      expect(html).toContain('Source observation counts are unavailable')
    }
  })

  it('treats missing or duplicate coverage for a cited signal as unverifiable, not zero', () => {
    const base = fixture()
    const source = base.intelligence.relationships.find((r) => r.id === base.key)!
    const cited = base.intelligence.coverage.find((s) => s.key === source.xKey)!
    expect(relationshipSourceCoverageMatchesFrame({
      ...base.intelligence, coverage: base.intelligence.coverage.filter((s) => s.key !== source.xKey),
    }, source)).toBe(false)
    expect(relationshipSourceCoverageMatchesFrame({
      ...base.intelligence, coverage: [...base.intelligence.coverage, { ...cited }],
    }, source)).toBe(false)
    // Unrelated source metadata does not invalidate the actual cited pair.
    expect(relationshipSourceCoverageMatchesFrame({
      ...base.intelligence, coverage: base.intelligence.coverage.map((s) =>
        s.key === 'body.weight_kg' ? { ...s, observedDays: 100 } : s),
    }, source)).toBe(true)
  })

  it('detects nutrition day-count and provenance drift even when its cited protein/soreness rho remains identical', () => {
    const base = fixture(true)
    const source = base.intelligence.relationships.find((r) => r.id === base.key)!
    const cited = base.intelligence.coverage.find((s) => s.key === 'nutrition.protein_g')!
    const corrupted = { ...base.intelligence, coverage: base.intelligence.coverage.map((s) =>
      s.key === 'nutrition.protein_g' ? { ...cited, loggedDays: (cited.loggedDays ?? 0) + 1 } : s),
    }
    expect(relationshipSourceCoverageMatchesFrame(corrupted, source)).toBe(false)
    const state = buildGoalControlState({ asOf, ...base, intelligence: corrupted })
    const item = state.relationships.find((r) => r.id === base.key)!
    expect(item.evidence?.coefficientVerified).toBe(false)
    expect(item.evidence?.rho).toBeNull()
    expect(item.evidence?.sources).toEqual([])
    expect(item.detailPaths.length).toBeGreaterThan(0)
  })
})
