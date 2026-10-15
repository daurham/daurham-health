import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  buildCoachRecommendationDrafts,
  type CoachIntelligenceState,
  type CoachRecommendationView,
} from '../src/domain/coach-intelligence.js'
import type { GoalControlState, GoalControlLimitation } from '../src/domain/goal-control.js'
import { coachRecommendationContextRevision } from '../server/intelligence/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'

const period = { start: '2026-10-08', end: '2026-10-14' }
function control(limitation: GoalControlLimitation, overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1', asOf: '2026-10-15', period,
    state: 'insufficient_evidence', headline: 'More evidence',
    summary: 'More context before changing plans.', noChangeRecommended: false,
    confidence: 'high', primaryOpportunity: null, goals: [], relationships: [],
    nutritionQuality: {
      state: 'met', period, loggedDays: 7, reliableDays: 7,
      estimateHeavyDays: 0, unknownQualityDays: 0,
      requiredLoggedDays: 4, requiredReliableDays: 4, detail: 'Reliable logged days.',
    },
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0, qualifiedTrainingDays: null,
      weeklyFrequencyTarget: null, remainingQualifiedDays: null, remainingSessions: null,
      todayIntent: null, futureTrainingDates: [], state: 'unconfigured', detail: 'No plan.',
    },
    maintenance: null, trainingProgression: null,
    limitations: [limitation], ...overrides,
  }
}
function renderCard(draft: ReturnType<typeof buildCoachRecommendationDrafts>[number]): string {
  const state: CoachIntelligenceState = {
    version: 'coach-intelligence-v1', asOf: '2026-10-15',
    state: 'insufficient_evidence', headline: 'Review context',
    summary: 'Evidence is incomplete.', noChangeRecommended: false,
    nextBestActions: [{ ...draft, id: '11111111-1111-4111-8111-111111111111',
      responseState: null, responseAt: null } satisfies CoachRecommendationView],
    followUps: [], question: null, questionBudgetDays: 3,
  }
  return renderToStaticMarkup(
    <MemoryRouter>
      <CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} />
    </MemoryRouter>,
  )
}

describe('PIQ-1.6 missing-signal confidence and disclosure', () => {
  it('does not inherit overall high confidence for missing sleep data', () => {
    const limitation = {
      code: 'missing:sleep', text: 'Sleep sensor: no complete recent nights.',
      detailPath: '/sleep',
    }
    const c = control(limitation)
    const draft = buildCoachRecommendationDrafts(c)[0]!
    expect(draft).toMatchObject({
      kind: 'improve_evidence', domain: 'health', confidence: 'unknown',
      evidenceRefs: ['limitation:missing:sleep'],
      evidenceGap: { kind: 'missing_signal', limitationCode: 'missing:sleep', period },
      experimentEligible: false,
    })
    expect(draft.nutritionEvidence).toBeUndefined()
    const html = renderCard(draft)
    expect(html).toContain('Why this context is needed')
    expect(html).toContain('unknown confidence in available evidence')
    expect(html).toContain('2026-10-08 to 2026-10-14')
    expect(html).toContain('does not prove worse sleep')
    expect(html).not.toContain('I started this</button>')
    expect(html).not.toContain('Recent food-log coverage')
  })

  it('treats an unevaluable goal as unknown, never unmet or abandoned', () => {
    const draft = buildCoachRecommendationDrafts(control({
      code: 'goal_unknown:step-goal', text: 'Weekly step goal has insufficient current measurements.',
      detailPath: '/goals/step-goal',
    }))[0]!
    expect(draft.confidence).toBe('unknown')
    expect(draft.evidenceGap?.kind).toBe('unresolved_goal')
    expect(draft.detailPath).toBe('/goals/step-goal')
    expect(renderCard(draft)).toContain('Unknown does not mean failed or abandoned')
  })

  it('limits generic cross-domain gaps rather than borrowing high global confidence', () => {
    const c = control({
      code: 'limited_cross_domain_evidence', text: 'More evidence before changing course.',
      detailPath: '/progress',
    })
    const draft = buildCoachRecommendationDrafts(c)[0]!
    expect(draft.confidence).toBe('limited')
    expect(draft.evidenceGap?.kind).toBe('limited_cross_domain')
    const html = renderCard(draft)
    expect(html).toContain('limited confidence in available evidence')
    expect(html).toContain('too limited for a reliable change/no-change conclusion')
  })

  it('changes the context token for a revised missing-signal explanation without changing its ID', () => {
    const original = control({
      code: 'missing:wellness', text: 'Wellness check-ins are missing.', detailPath: '/check-in',
    })
    const changed = control({
      code: 'missing:wellness', text: 'Partial wellness check-ins, still not enough.', detailPath: '/check-in',
    })
    const before = buildCoachRecommendationDrafts(original)[0]!
    const after = buildCoachRecommendationDrafts(changed)[0]!
    expect(before.fingerprint).toBe(after.fingerprint)
    expect(coachRecommendationContextRevision(before, original))
      .not.toBe(coachRecommendationContextRevision(after, changed))
  })
})
