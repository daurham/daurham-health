import { describe, expect, it } from 'vitest'
import {
  buildCoachFollowUpQuestion,
  buildCoachRecommendationDrafts,
  recommendationIsSuppressed,
  type CoachRecommendationMemory,
} from '../src/domain/coach-intelligence.js'
import type { GoalControlState } from '../src/domain/goal-control.js'

function control(overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1',
    asOf: '2026-10-06',
    period: { start: '2026-09-29', end: '2026-10-05' },
    state: 'act',
    headline: 'One thing is worth your attention',
    summary: 'Review training.',
    noChangeRecommended: false,
    confidence: 'moderate',
    primaryOpportunity: {
      id: 'training-progression:bench',
      kind: 'training_progression',
      domain: 'training',
      title: 'Bench Press may be stalled',
      detail: 'Exact-exercise performance has stayed in a narrow band.',
      actionText: 'Review Training',
      detailPath: '/training',
      sourceCandidateId: null,
      evidenceRefs: ['training:exercise:bench'],
    },
    goals: [],
    nutritionQuality: {
      state: 'met',
      period: { start: '2026-09-29', end: '2026-10-05' },
      loggedDays: 7,
      reliableDays: 7,
      estimateHeavyDays: 0,
      unknownQualityDays: 0,
      requiredLoggedDays: 4,
      requiredReliableDays: 4,
      detail: 'Reliable.',
    },
    trainingAdherence: {
      configured: true,
      completedProgrammedSessions: 1,
      weeklyFrequencyTarget: 3,
      remainingSessions: 2,
      todayIntent: 'rest_preferred',
      futureTrainingDates: ['2026-10-07', '2026-10-09'],
      state: 'rest_day_on_track',
      detail: 'Today is a rest day and the plan is on track.',
    },
    relationships: [],
    limitations: [],
    maintenance: null,
    trainingProgression: null,
    ...overrides,
  }
}

describe('I9 Coach intelligence', () => {
  it('keeps training advice rest-aware instead of turning rest into a miss', () => {
    const drafts = buildCoachRecommendationDrafts(control())
    expect(drafts).toHaveLength(1)
    expect(drafts[0]?.actionText).toBe('Review next session')
    expect(drafts[0]?.detail).toContain('Do not add work just to satisfy Coach')
  })

  it('emits an explicit no-change state without inventing actions', () => {
    const drafts = buildCoachRecommendationDrafts(control({
      state: 'maintain',
      headline: 'Stay the course',
      summary: 'No change recommended.',
      noChangeRecommended: true,
      primaryOpportunity: null,
    }))
    expect(drafts).toEqual([])
  })

  it('uses evidence gaps for one context-sensitive question only when evidence is insufficient', () => {
    const state = control({
      state: 'insufficient_evidence',
      primaryOpportunity: null,
      limitations: [{ code: 'nutrition_quality_floor', text: 'Nutrition evidence is limited.', detailPath: '/nutrition' }],
    })
    expect(buildCoachFollowUpQuestion(state)?.title).toContain('food logging')
    expect(buildCoachFollowUpQuestion(control())).toBeNull()
  })

  it('honors owner response memory and lets an expired not-now resurface', () => {
    const memory: CoachRecommendationMemory = {
      id: '00000000-0000-4000-8000-000000000001',
      fingerprint: 'coach:i9:x',
      recommendationKind: 'training_progression',
      responseState: 'not_now',
      suppressUntil: '2026-10-13',
      followUpOn: null,
      outcomeState: null,
      lastSurfacedOn: '2026-10-06',
    }
    expect(recommendationIsSuppressed(memory, '2026-10-12')).toBe(true)
    expect(recommendationIsSuppressed(memory, '2026-10-13')).toBe(false)
    expect(recommendationIsSuppressed({ ...memory, responseState: 'not_relevant', suppressUntil: null }, '2027-01-01')).toBe(true)
  })
})
