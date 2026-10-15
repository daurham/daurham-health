import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  buildCoachRecommendationDrafts,
  type CoachIntelligenceState,
  type CoachRecommendationView,
} from '../src/domain/coach-intelligence.js'
import { buildGoalControlState, type GoalControlState, type GoalControlLimitation } from '../src/domain/goal-control.js'
import type { HealthIntelligenceSnapshot } from '../src/domain/intelligence/shared.js'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.js'
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

describe('PIQ-1.6 recovery signal coverage provenance', () => {
  const sourcePeriod = { start: '2026-09-17', end: '2026-10-14' }
  const coverage = {
    key: 'sleep.total_minutes' as const,
    label: 'Sleep duration',
    period: sourcePeriod,
    observedDays: 3, eligibleDays: 28, excludedObservations: 2,
    provenance: { device: 2, owner: 1 },
    confidence: 'limited' as const,
  }

  it('shows the source window and actual sparse recorded counts independently of Goal Control window', () => {
    const c = control({
      code: 'missing:sleep.total_minutes', text: 'Sleep data is incomplete.',
      detailPath: '/progress/sleep', coverage,
    })
    const draft = buildCoachRecommendationDrafts(c)[0]!
    expect(draft.confidence).toBe('unknown')
    expect(draft.evidenceGap?.coverage).toEqual(coverage)
    const html = renderCard(draft)
    expect(html).toContain('Goal Control assessment: 2026-10-08 to 2026-10-14')
    expect(html).toContain('Source observation window: 2026-09-17 to 2026-10-14')
    expect(html).toContain('Sleep duration: 3 observed dates out of 28 eligible dates')
    expect(html).toContain('Excluded observations: 2')
    expect(html).toContain('device 2, owner 1')
    expect(html).toContain('not complete tracking, sleep quality, recovery, or proof of a health change')
    expect(html).not.toContain('I started this</button>')
  })

  it('keeps missing provenance explicitly unknown, not fabricated as zero or complete tracking', () => {
    const html = renderCard(buildCoachRecommendationDrafts(control({
      code: 'missing:wellness.energy', text: 'Energy check-ins were not available.',
      detailPath: '/check-in',
    }))[0]!)
    expect(html).toContain('Source observation counts are unavailable')
    expect(html).toContain('do not infer complete or zero tracking')
    expect(html).not.toContain('0 observed dates')
  })

  it('updates a saved non-calorie context when source counts change, even with the same limitation code', () => {
    const a = control({
      code: 'missing:sleep.total_minutes', text: 'Sleep data is incomplete.',
      detailPath: '/progress/sleep', coverage,
    })
    const b = control({
      code: 'missing:sleep.total_minutes', text: 'Sleep data is incomplete.',
      detailPath: '/progress/sleep',
      coverage: { ...coverage, observedDays: 4, provenance: { device: 3, owner: 1 } },
    })
    const oldDraft = buildCoachRecommendationDrafts(a)[0]!
    const newDraft = buildCoachRecommendationDrafts(b)[0]!
    expect(oldDraft.fingerprint).toBe(newDraft.fingerprint)
    expect(coachRecommendationContextRevision(oldDraft, a))
      .not.toBe(coachRecommendationContextRevision(newDraft, b))
  })

  it('carries real intelligence coverage into Goal Control missing-signal limitations', () => {
    const brief = {
      canGenerate: false, coverage: { substantiveDomains: [] },
      focus: null, period,
    } as unknown as WeeklyCoachBrief
    const signal = {
      ...coverage, detailPath: '/progress/sleep',
      coveragePct: 3 / 28 * 100,
    }
    const snapshot = {
      frame: [], coverage: [signal], relationships: [],
      period: { ...sourcePeriod, dayCount: 28 },
      context: {
        missing: [{ key: 'sleep.total_minutes', label: 'Sleep duration',
          detail: 'Missing many nights.', detailPath: '/progress/sleep',
          confidence: 'limited' }],
        knows: [],
      },
    } as unknown as HealthIntelligenceSnapshot
    const goal = {
      id: 'sleep-goal', kind: 'sleep_duration', lifecycle: 'active', label: 'Sleep',
      targetState: 'unknown', deadlineState: 'unknown',
    } as unknown as WeeklyGoalSnapshot
    const state = buildGoalControlState({
      asOf: '2026-10-15', brief, intelligence: snapshot, goals: [goal],
    })
    const missing = state.limitations.find((item) => item.code === 'missing:sleep.total_minutes')
    expect(missing?.coverage).toEqual(coverage)
    expect(missing?.coverage?.period).not.toEqual(state.period)
    const draft = buildCoachRecommendationDrafts(state)[0]!
    expect(draft.evidenceGap?.coverage).toEqual(coverage)
  })
})
