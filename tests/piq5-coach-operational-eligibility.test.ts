import { describe, expect, it } from 'vitest'
import { isOperationalCoachOpportunity } from '../src/domain/coach-opportunity-eligibility.js'
import { buildGoalControlState, type GoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import type { WeeklyCandidate, WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'
import type { HealthIntelligenceSnapshot } from '../src/domain/intelligence/shared.js'

const day = '2026-10-17'
const period = { start: '2026-10-10', end: '2026-10-16' }
const source = {
  period: { start: '2026-09-18', end: day, dayCount: 30 },
  frame: [], coverage: [], relationships: [], context: { knows: [], missing: [] },
} as unknown as HealthIntelligenceSnapshot

function focus(kind: string): WeeklyCandidate {
  return {
    id: 'focus:' + kind, section: 'focus', kind,
    fact: 'Synthetic focus: ' + kind,
    actionText: 'Review ' + kind,
    evidenceRefs: ['synthetic:focus'], detailPath: '/training', rank: 1,
  }
}
function brief(item: WeeklyCandidate): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1',
    asOf: day, period,
    previousPeriod: { start: '2026-10-03', end: '2026-10-09' },
    state: 'deterministic', canGenerate: true,
    coverage: {
      activity: true, sleep: true, nutrition: false, training: true,
      supplements: false, body: false,
      substantiveDomains: ['activity', 'sleep', 'training'],
    },
    facts: [], wentWell: [], worthWatching: [], candidates: [item],
    focus: item,
  }
}
function control(item: WeeklyCandidate): GoalControlState {
  return buildGoalControlState({
    asOf: day, brief: brief(item), intelligence: source, goals: [],
  })
}

describe('PIQ-5.1 Coach operates on decisions, not scheduled tasks', () => {
  it('classifies only explicit operational focus kinds, never entire domains', () => {
    for (const kind of [
      'training_plan_today', 'body_cadence', 'benchmark_retest',
      'review_capture', 'nutrition_coverage',
    ]) {
      expect(isOperationalCoachOpportunity(kind), kind).toBe(true)
    }
    for (const kind of [
      'goal_review', 'goal_off_track', 'experiment_review',
      'training_progression', 'review_goal_plan',
      'review_intake_adjustment', 'unknown_future_evidence',
    ]) {
      expect(isOperationalCoachOpportunity(kind), kind).toBe(false)
    }
  })

  it('does not promote due tasks to decision-grade Goal Control or Coach actions', () => {
    for (const kind of [
      'training_plan_today', 'body_cadence', 'benchmark_retest',
      'review_capture', 'nutrition_coverage',
    ]) {
      const state = control(focus(kind))
      expect(state.primaryOpportunity, kind).toBeNull()
      expect(buildCoachRecommendationDrafts(state).some(x => x.kind === kind), kind).toBe(false)
    }
  })

  it('keeps genuinely time-sensitive goal reviews and finished experiment analysis eligible', () => {
    for (const kind of ['goal_review', 'goal_off_track', 'experiment_review']) {
      const state = control(focus(kind))
      expect(state.primaryOpportunity?.kind).toBe(kind)
      expect(buildCoachRecommendationDrafts(state)[0]?.kind).toBe(kind)
    }
  })

  it('also refuses a stale or directly constructed operational control response', () => {
    const current = control(focus('goal_review'))
    const stale: GoalControlState = {
      ...current, state: 'act',
      primaryOpportunity: {
        id: 'focus:training-plan:today', kind: 'training_plan_today',
        domain: 'training', title: 'Complete workout',
        detail: 'Complete your planned workout',
        actionText: 'Train now', detailPath: '/training',
        sourceCandidateId: 'focus:training-plan:today',
        evidenceRefs: ['training-plan:qualified-days'],
      },
    }
    expect(buildCoachRecommendationDrafts(stale)).toEqual([])
  })

  it('does not remove a scheduled task from the Weekly Coach source list', () => {
    const task = focus('training_plan_today')
    const input = brief(task)
    expect(input.focus?.kind).toBe('training_plan_today')
    expect(input.candidates).toHaveLength(1)
    // Routing is deliberately view-specific; don't mutate the source.
    control(task)
    expect(input.candidates[0]).toEqual(task)
  })
})
