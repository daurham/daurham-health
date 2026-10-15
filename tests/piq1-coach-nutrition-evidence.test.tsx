import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  buildCoachRecommendationDrafts,
  type CoachIntelligenceState,
  type CoachRecommendationView,
} from '../src/domain/coach-intelligence.js'
import type { GoalControlState } from '../src/domain/goal-control.js'
import { coachRecommendationContextRevision } from '../server/intelligence/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'

const period = { start: '2026-10-08', end: '2026-10-14' }
function control(overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1', asOf: '2026-10-15', period,
    state: 'insufficient_evidence', headline: 'Needs reliable food evidence',
    summary: 'Review entries before changing calories.', noChangeRecommended: true,
    confidence: 'high', primaryOpportunity: null, goals: [],
    nutritionQuality: {
      state: 'limited', period,
      loggedDays: 5, reliableDays: 1, estimateHeavyDays: 2, unknownQualityDays: 1,
      requiredLoggedDays: 4, requiredReliableDays: 4,
      detail: 'Only one day was verified complete and source reliable.',
    },
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0, qualifiedTrainingDays: null,
      weeklyFrequencyTarget: null, remainingQualifiedDays: null, remainingSessions: null,
      todayIntent: null, futureTrainingDates: [], state: 'unconfigured', detail: 'Unconfigured.',
    },
    relationships: [], maintenance: null, trainingProgression: null,
    limitations: [{
      code: 'nutrition_quality_floor',
      text: 'Recent intake evidence is too incomplete to change targets.',
      detailPath: '/nutrition',
    }],
    ...overrides,
  }
}
function renderCard(draft: ReturnType<typeof buildCoachRecommendationDrafts>[number]): string {
  const item: CoachRecommendationView = {
    ...draft,
    id: '11111111-1111-4111-8111-111111111111',
    responseState: null, responseAt: null,
  }
  const state: CoachIntelligenceState = {
    version: 'coach-intelligence-v1', asOf: '2026-10-15',
    state: 'insufficient_evidence', headline: 'Evidence first',
    summary: 'Do not infer unlogged calories.', noChangeRecommended: true,
    nextBestActions: [item], followUps: [], question: null, questionBudgetDays: 3,
  }
  return renderToStaticMarkup(
    <MemoryRouter>
      <CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} />
    </MemoryRouter>,
  )
}

describe('PIQ-1.6 recent nutrition evidence confidence and source coverage', () => {
  it('refuses to borrow overall high confidence for an incomplete nutrition-quality recommendation', () => {
    const drafts = buildCoachRecommendationDrafts(control())
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      kind: 'improve_evidence', confidence: 'limited', experimentEligible: false,
      nutritionEvidence: {
        state: 'limited', period,
        loggedDays: 5, reliableDays: 1,
        estimateHeavyDays: 2, unknownQualityDays: 1,
        requiredLoggedDays: 4, requiredReliableDays: 4,
      },
    })
  })

  it('shows source-specific counts and rejects the inference that entry days are complete intake days', () => {
    const html = renderCard(buildCoachRecommendationDrafts(control())[0]!)
    expect(html).toContain('Recent food-log coverage')
    expect(html).toContain('2026-10-08 to 2026-10-14')
    expect(html).toContain('Days with calorie entries: 5')
    expect(html).toContain('Owner-confirmed complete, source-reliable days: 1')
    expect(html).toContain('minimum 4')
    expect(html).toContain('Estimate-heavy days: 2')
    expect(html).toContain('unknown source or quality days: 1')
    expect(html).toContain('not assumed to be zero intake or a fully logged day')
    expect(html).not.toContain('I started this</button>')
  })

  it('shows unknown—not artificially limited or high—when zero days provide usable evidence', () => {
    const initial = control()
    const current = control({
      nutritionQuality: {
        ...initial.nutritionQuality,
        state: 'unknown', loggedDays: 0, reliableDays: 0,
        estimateHeavyDays: 0, unknownQualityDays: 0,
        detail: 'No trustworthy records in this completed-day window.',
      },
    })
    const draft = buildCoachRecommendationDrafts(current)[0]!
    expect(draft.confidence).toBe('unknown')
    const html = renderCard(draft)
    expect(html).toContain('Recent food-log coverage')
    expect(html).toContain('Days with calorie entries: 0')
    expect(html).toContain('Owner-confirmed complete, source-reliable days: 0')
    expect(html).not.toContain('minimum met')
  })

  it('carries this coverage to both eligible plateau options without changing safety thresholds', () => {
    const base = control()
    const nutritionQuality = { ...base.nutritionQuality, state: 'met' as const, reliableDays: 5, loggedDays: 6 }
    const state = control({
      state: 'act', limitations: [], nutritionQuality,
      primaryOpportunity: {
        id: 'maintenance:review-intake', kind: 'review_intake_adjustment',
        domain: 'nutrition', title: 'Review intake', detail: 'No automatic decrease.',
        actionText: 'Review', detailPath: '/nutrition', sourceCandidateId: null,
        evidenceRefs: ['maintenance:estimate'],
      },
      maintenance: {
        interventions: [{
          id: 'maintenance:review-intake', kind: 'review_intake_adjustment',
          priority: 'primary', title: 'Review intake',
          detail: 'Review intake', detailPath: '/nutrition',
        }, {
          id: 'activity-option', kind: 'review_activity_adjustment',
          priority: 'secondary', title: 'Or review activity',
          detail: 'Activity alternative', detailPath: '/activity',
        }],
        calorieAdjustmentSafety: { status: 'review_possible' },
        estimate: { confidence: 'moderate' },
        evidenceExplanation: {
          nutrition: { status: 'limited', detail: 'Partial evidence.' },
          weightTrend: { status: 'limited', detail: 'Some noise.' },
          plateau: { status: 'possible', detail: 'Not established.' },
          calorieDecision: { status: 'review_only', detail: 'Owner review.' },
        },
      } as unknown as GoalControlState['maintenance'],
    })
    const options = buildCoachRecommendationDrafts(state).filter((item) =>
      item.kind === 'review_intake_adjustment' || item.kind === 'review_activity_adjustment')
    expect(options).toHaveLength(2)
    for (const option of options) {
      expect(option.confidence).toBe('moderate')
      expect(option.nutritionEvidence).toMatchObject({ reliableDays: 5, requiredReliableDays: 4 })
      expect(option.evidenceExplanation?.calorieDecision.status).toBe('review_only')
    }
    const unverified = buildCoachRecommendationDrafts({
      ...state, nutritionQuality: { ...nutritionQuality, state: 'limited', reliableDays: 2 },
    })
    expect(unverified.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
    expect(unverified.some((item) => item.kind === 'review_activity_adjustment')).toBe(false)
  })

  it('changes the saved response context when verified coverage changes even if card ID is stable', () => {
    const initial = control()
    const one = buildCoachRecommendationDrafts(initial)[0]!
    const token = coachRecommendationContextRevision(one, initial)
    const later = control({ nutritionQuality: { ...initial.nutritionQuality, reliableDays: 2 } })
    const sameRecommendation = buildCoachRecommendationDrafts(later)[0]!
    expect(sameRecommendation.fingerprint).toBe(one.fingerprint)
    expect(coachRecommendationContextRevision(sameRecommendation, later)).not.toBe(token)
  })
})
