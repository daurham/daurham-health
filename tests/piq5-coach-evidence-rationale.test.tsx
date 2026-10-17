import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildCoachRecommendationRationale, type CoachRecommendationDraft, type CoachIntelligenceState } from '../src/domain/coach-intelligence.js'
import type { GoalControlState } from '../src/domain/goal-control.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'

const base: CoachRecommendationDraft = {
  fingerprint: 'coach:i9:bench', sourceId: 'training-progression:bench',
  kind: 'training_progression', domain: 'training', title: 'Bench trend',
  detail: 'Review comparable sets', actionText: 'Review', detailPath: '/training',
  confidence: 'moderate', priority: 80, experimentEligible: true,
  evidenceRefs: ['training:exercise:bench'],
  trainingEvidence: {
    exerciseName: 'Bench press', state: 'stalled', metric: 'e1rm_kg',
    exposureCount: 5, latestDate: '2026-10-15', changePct: 0,
    limitationKinds: ['effort_variability'], explanation: 'Five sets',
    window: { start: '2026-09-15', end: '2026-10-16' },
  },
}
const control = {
  goals: [{
    id: 'g1', label: 'Bench strength', kind: 'strength_e1rm',
    lifecycle: 'active', state: 'needs_attention', targetState: 'unknown',
    deadlineState: 'projected_after_deadline', detailPath: '/goals/g1',
  }],
  trainingProgression: {
    goalRelationships: [{ goalId: 'g1', exerciseId: 'bench' }],
  },
} as unknown as GoalControlState

describe('PIQ-5.3 evidence-bounded Coach explanation', () => {
  it('exposes observed sample/window, exact active goal, uncertainty, alternatives and follow-up', () => {
    const rationale = buildCoachRecommendationRationale(base, control)
    expect(rationale?.observation).toContain('5 comparable recorded exposures')
    expect(rationale?.observation).toContain('2026-09-15 and 2026-10-16')
    expect(rationale?.observation).toContain('0.0%')
    expect(rationale?.relevance).toContain('Bench strength')
    expect(rationale?.uncertainty).toContain('moderate confidence')
    expect(rationale?.uncertainty).toContain('effort_variability')
    expect(rationale?.alternatives).toContain('recovery')
    expect(rationale?.nextStep).toContain('No extra workout')
    expect(rationale?.successCheck).toContain('new comparable')
  })

  it('does not borrow an unrelated exercise or historical goal', () => {
    expect(buildCoachRecommendationRationale({
      ...base, trainingEvidence: undefined, sourceId: 'other:bench',
    }, control)).toBeNull()
    const mismatched = { ...control,
      trainingProgression: { goalRelationships: [{ goalId: 'g1', exerciseId: 'squat' }] },
    } as unknown as GoalControlState
    const rationale = buildCoachRecommendationRationale(base, mismatched)
    expect(rationale?.relevance).toContain('not verified')
    expect(rationale?.relevance).not.toContain('Bench strength')
  })

  it('distinguishes verified full days from entered foods, without recommending a calorie cut', () => {
    const coverage: CoachRecommendationDraft = {
      ...base, kind: 'improve_evidence', domain: 'nutrition',
      trainingEvidence: undefined, detailPath: '/nutrition',
      nutritionEvidence: {
        state: 'limited', period: { start: '2026-10-10', end: '2026-10-16' },
        loggedDays: 5, reliableDays: 2, estimateHeavyDays: 1,
        unknownQualityDays: 1, requiredLoggedDays: 4, requiredReliableDays: 4,
        detail: 'Need verified completeness',
      },
    }
    const rationale = buildCoachRecommendationRationale(coverage, control)
    expect(rationale?.observation).toContain('only 2 were verified complete')
    expect(rationale?.observation).toContain('requirement is 4')
    expect(rationale?.uncertainty).toContain('unknown, not zero intake')
    expect(rationale?.nextStep).toContain('only if all intake')
    expect(rationale?.timing).toContain('does not justify adjusting targets')
  })

  it('keeps unknown-source recommendations compact rather than fabricating a rationale', () => {
    expect(buildCoachRecommendationRationale({ ...base, kind: 'experiment_review' }, control)).toBeNull()
    expect(buildCoachRecommendationRationale({ ...base, trainingEvidence: undefined }, control)).toBeNull()
  })

  it('shows the structured source disclosure collapsed and preserves owner-review actions', () => {
    const rationale = buildCoachRecommendationRationale(base, control)!
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: '2026-10-17',
      state: 'act', headline: 'One useful insight', summary: 'Review',
      noChangeRecommended: false, nextBestActions: [{
        ...base, rationale, id: '11111111-1111-4111-8111-111111111111',
        responseState: null, responseAt: null,
      }], followUps: [], question: null, questionBudgetDays: 3,
    }
    const html = renderToStaticMarkup(<MemoryRouter><CoachIntelligencePanel
      state={state} pending={false} onResponse={() => undefined} onOutcome={() => undefined}
    /></MemoryRouter>)
    expect(html).toContain('Why this recommendation?')
    for (const label of ['What was observed', 'Why it matters', 'Uncertainty', 'Safe next step',
      'Other possible explanations', 'How to check', 'Open source records']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('href="/training"')
    expect(html).toContain('I started this')
    expect(html).not.toContain('<details open')
  })
})
