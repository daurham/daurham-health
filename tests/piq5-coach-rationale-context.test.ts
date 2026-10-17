import { describe, expect, it } from 'vitest'
import {
  buildCoachRecommendationDrafts,
  buildCoachRecommendationRationale,
  type CoachRecommendationDraft,
} from '../src/domain/coach-intelligence.js'
import type { GoalControlState } from '../src/domain/goal-control.js'
import type { MaintenanceState } from '../src/domain/maintenance.js'

function context(overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1', asOf: '2026-10-17',
    period: { start: '2026-10-10', end: '2026-10-16' },
    state: 'act', headline: 'One thing worth attention',
    summary: 'Review current evidence', noChangeRecommended: false, confidence: 'moderate',
    primaryOpportunity: null, goals: [],
    nutritionQuality: {
      state: 'limited', period: { start: '2026-10-10', end: '2026-10-16' },
      loggedDays: 3, reliableDays: 2, estimateHeavyDays: 1, unknownQualityDays: 0,
      requiredLoggedDays: 4, requiredReliableDays: 4,
      detail: 'Incomplete days are unknown.',
    },
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0, qualifiedTrainingDays: null,
      weeklyFrequencyTarget: null, remainingQualifiedDays: null, remainingSessions: null,
      todayIntent: null, futureTrainingDates: [], state: 'unconfigured', detail: 'No plan',
    },
    relationships: [], limitations: [], maintenance: null, trainingProgression: null,
    ...overrides,
  }
}
function draft(kind: string, overrides: Partial<CoachRecommendationDraft> = {}): CoachRecommendationDraft {
  return {
    fingerprint: 'coach:i9:focus:goal:x', sourceId: 'focus:goal:x',
    kind, domain: 'goals', title: 'Review goal',
    detail: 'Check status', actionText: 'Review', detailPath: '/goals/x',
    confidence: 'moderate', evidenceRefs: ['goal:x'],
    priority: 100, experimentEligible: false, ...overrides,
  }
}
const goal = {
  id: 'x', label: 'Walking distance', kind: 'activity_steps',
  lifecycle: 'active', state: 'needs_attention' as const,
  targetState: 'not_satisfied', deadlineState: 'projected_after_deadline',
  detailPath: '/goals/x', ownerPrimary: true,
}
describe('PIQ-5.3 context-specific, source-linked rationale', () => {
  it('explains a real matched active primary goal without inventing progress measurements', () => {
    const control = context({ goals: [goal], primaryOpportunity: {
      id: 'focus:goal:x', kind: 'goal_off_track', domain: 'goals',
      title: 'Walking goal needs review', detail: 'Review deadline',
      actionText: 'Open goal', detailPath: '/goals/x', sourceCandidateId: 'focus:goal:x',
      evidenceRefs: ['goal:x'],
    } })
    const result = buildCoachRecommendationDrafts(control)
    const rationale = result[0]?.rationale
    expect(rationale?.observation).toContain('Walking distance')
    expect(rationale?.observation).toContain('2026-10-17')
    expect(rationale?.relevance).toContain('selected this as your primary goal')
    expect(rationale?.timing).toContain('projection')
    expect(rationale?.uncertainty).toContain('does not, by itself, verify an exact measurement')
    expect(rationale?.successCheck).toContain('not starting a change')
    expect(rationale?.nextStep).toContain('check its latest recorded evidence')
    expect(JSON.stringify(rationale)).not.toContain('8,000')
  })
  it('refuses to borrow a goal rationale from a title match, stale goal or wrong source', () => {
    const active = context({ goals: [goal] })
    expect(buildCoachRecommendationRationale(draft('goal_review', { evidenceRefs: ['goal:y'] }), active)).toBeNull()
    expect(buildCoachRecommendationRationale(draft('goal_review', { detailPath: '/goals/y' }), active)).toBeNull()
    expect(buildCoachRecommendationRationale(draft('goal_review'), context({
      goals: [{ ...goal, lifecycle: 'paused' }],
    }))).toBeNull()
    expect(buildCoachRecommendationRationale(draft('goal_review'), context({
      goals: [{ ...goal, targetState: 'satisfied' }],
    }))).toBeNull()
  })
  it('treats ready experiment results as review-only, not as verified improvements', () => {
    const exp = draft('experiment_review', {
      sourceId: 'focus:experiment:ex-1', detailPath: '/lab/experiments/ex-1',
      evidenceRefs: ['experiment:ex-1'], domain: 'lab',
    })
    const explanation = buildCoachRecommendationRationale(exp, context())
    expect(explanation?.observation).toContain('ready to inspect')
    expect(explanation?.uncertainty).toContain('does not establish adherence')
    expect(explanation?.nextStep).toContain('Do not repeat or adopt')
    expect(explanation?.successCheck).toContain('not an intervention start')
    expect(buildCoachRecommendationRationale({
      ...exp, evidenceRefs: ['experiment:different'],
    }, context())).toBeNull()
  })
  it('only explains an exactly matched, source-qualified maintenance intervention', () => {
    const intervention = {
      id: 'maintenance:review-goal', kind: 'review_goal_plan' as const,
      detailPath: '/goals', title: 'Review goal plan', detail: 'Review before changing',
      priority: 'primary' as const, suggestedDeltaKcal: null,
    }
    const explanation = {
      nutrition: { status: 'limited' as const, detail: 'Food entry coverage is limited.' },
      weightTrend: { status: 'limited' as const, detail: 'Five recorded scale readings.' },
      plateau: { status: 'possible' as const, detail: 'Flat trend may be noise.' },
      calorieDecision: { status: 'withheld' as const, detail: 'No calorie reduction authorized.' },
    }
    const state = context({ maintenance: {
      completeThrough: '2026-10-16', interventions: [intervention],
      evidenceExplanation: explanation,
      calorieAdjustmentSafety: { status: 'blocked' },
    } as unknown as MaintenanceState })
    const plan = draft('review_goal_plan', {
      sourceId: intervention.id, detailPath: '/goals',
      evidenceExplanation: explanation,
      evidenceRefs: ['maintenance:estimate'],
    })
    const why = buildCoachRecommendationRationale(plan, state)
    expect(why?.observation).toContain('Five recorded scale readings.')
    expect(why?.observation).toContain('2026-10-16')
    expect(why?.uncertainty).toContain('No calorie reduction authorized.')
    expect(why?.nextStep).toContain('Do not make an automatic calorie adjustment')
    expect(buildCoachRecommendationRationale({ ...plan, sourceId: 'maintenance:another' }, state)).toBeNull()
    expect(buildCoachRecommendationRationale({ ...plan, detailPath: '/body' }, state)).toBeNull()
  })
  it('does not rationalize a calorie change when the current safety review is blocked', () => {
    const intervention = {
      id: 'maintenance:calorie', kind: 'review_intake_adjustment' as const,
      detailPath: '/nutrition', title: 'Intake review', detail: 'Review only',
      priority: 'primary' as const, suggestedDeltaKcal: -100,
    }
    const explanation = {
      nutrition: { status: 'well_sampled' as const, detail: 'Four complete days.' },
      weightTrend: { status: 'limited' as const, detail: 'Limited trend.' },
      plateau: { status: 'possible' as const, detail: 'Possible plateau.' },
      calorieDecision: { status: 'withheld' as const, detail: 'Blocked.' },
    }
    const plan = draft('review_intake_adjustment', {
      sourceId: intervention.id, detailPath: '/nutrition',
      evidenceExplanation: explanation,
    })
    const control = context({ maintenance: {
      completeThrough: '2026-10-16', interventions: [intervention],
      evidenceExplanation: explanation,
      calorieAdjustmentSafety: { status: 'blocked' },
    } as unknown as MaintenanceState })
    expect(buildCoachRecommendationRationale(plan, control)).toBeNull()
  })
  it('describes known source coverage rather than inferring absent days were zero', () => {
    const evidence = draft('improve_evidence', {
      sourceId: 'evidence:missing:sleep.total_minutes',
      evidenceRefs: ['limitation:missing:sleep.total_minutes'],
      detailPath: '/progress/sleep',
      evidenceGap: {
        kind: 'missing_signal', limitationCode: 'missing:sleep.total_minutes',
        period: { start: '2026-10-10', end: '2026-10-16' },
        explanation: 'Sleep coverage is insufficient.',
        coverage: {
          key: 'sleep.total_minutes', label: 'Sleep duration',
          observedDays: 2, eligibleDays: 28, excludedObservations: 1,
          provenance: { device: 2 }, confidence: 'limited',
          period: { start: '2026-09-19', end: '2026-10-16' },
        },
      },
    })
    const why = buildCoachRecommendationRationale(evidence, context())
    expect(why?.observation).toContain('2 recorded dates out of 28')
    expect(why?.observation).toContain('2026-09-19')
    expect(why?.uncertainty).toContain('does not establish complete tracking')
    expect(why?.nextStep).toContain('Do not invent or backfill')
    expect(JSON.stringify(why)).not.toContain('zero sleep')
  })
})
