import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { GoalControlState } from '../src/domain/goal-control.js'
import {
  buildCoachFollowUpQuestion, buildCoachRecommendationDrafts,
  recommendationIsSuppressed, type CoachIntelligenceState, type CoachRecommendationMemory,
  type CoachRecommendationView,
} from '../src/domain/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import { coachLinkedExperimentCopy, projectCoachLinkedExperiment } from '../src/domain/coach-lab-lifecycle.js'

/** Synthetic fixtures only. No production owner health records are accessed. */
const TODAY = '2026-10-17'
const ID = '123e4567-e89b-42d3-a456-426614174000'
const LAB = '123e4567-e89b-42d3-a456-426614174001'
const nutritionQuality = {
  state: 'limited' as const,
  period: { start: '2026-10-10', end: '2026-10-16' },
  loggedDays: 3, reliableDays: 1, estimateHeavyDays: 1, unknownQualityDays: 1,
  requiredLoggedDays: 4, requiredReliableDays: 4,
  detail: 'Only one confirmed complete day.',
}
function control(overrides: Partial<GoalControlState> = {}): GoalControlState {
  return {
    version: 'goal-control-v1', asOf: TODAY,
    period: { start: '2026-10-10', end: '2026-10-16' },
    state: 'insufficient_evidence', headline: 'Evidence needed',
    summary: 'Do not change targets based on partial reports',
    noChangeRecommended: true, confidence: 'limited',
    primaryOpportunity: null, goals: [], nutritionQuality,
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0,
      qualifiedTrainingDays: null, weeklyFrequencyTarget: null,
      remainingQualifiedDays: null, remainingSessions: null,
      todayIntent: null, futureTrainingDates: [],
      state: 'unconfigured', detail: 'No plan',
    },
    relationships: [], limitations: [], maintenance: null, trainingProgression: null,
    ...overrides,
  } as GoalControlState
}
const card = (linkedExperimentId?: string): CoachRecommendationView => ({
  id: ID, fingerprint: 'coach:i9:training:bench',
  kind: 'training_progression', domain: 'training',
  title: 'Review progression', detail: 'Review sets', actionText: 'Review Training',
  detailPath: '/training', confidence: 'limited', evidenceRefs: [],
  responseState: null, responseAt: null, experimentEligible: true,
  ...(linkedExperimentId ? { linkedExperimentId } : {}),
})
function render(cards: CoachRecommendationView[], headline: string, summary: string): string {
  const state: CoachIntelligenceState = {
    version: 'coach-intelligence-v1', asOf: TODAY,
    state: cards.length ? 'act' : 'maintain',
    headline, summary, noChangeRecommended: !cards.length,
    nextBestActions: cards, followUps: [], question: null, questionBudgetDays: 3,
  }
  return renderToStaticMarkup(<MemoryRouter><CoachIntelligencePanel
    state={state} pending={false} onResponse={() => undefined}
    onOutcome={() => undefined} /></MemoryRouter>)
}

describe('PIQ-5.7 synthetic end-to-end decision and lifecycle goldens', () => {
  it('already trained today: does not reinterpret a completed daily training task as a new intervention', () => {
    const c = control({
      state: 'act',
      primaryOpportunity: {
        id: 'training:preferred-today', kind: 'training_plan_today', domain: 'training',
        title: 'Complete planned workout', detail: 'Completed session already logged',
        actionText: 'Train now', detailPath: '/training',
        evidenceRefs: ['training:today'], sourceCandidateId: 'training:today',
      },
      trainingAdherence: {
        ...control().trainingAdherence, configured: true,
        completedProgrammedSessions: 1, qualifiedTrainingDays: 1, weeklyFrequencyTarget: 3,
        remainingQualifiedDays: 2, remainingSessions: 2,
        todayIntent: 'training_preferred', state: 'rest_day_on_track',
        detail: 'Today already qualifies',
      },
    })
    expect(buildCoachRecommendationDrafts(c)).toEqual([])
    // Even for a real trend review, the copy is not an invitation to train twice.
    const review = buildCoachRecommendationDrafts({
      ...c, primaryOpportunity: {
        id: 'training:bench-review', kind: 'training_progression', domain: 'training',
        title: 'Review current performance', detail: 'Check comparable sets',
        actionText: 'Review Training', detailPath: '/training',
        evidenceRefs: ['training:bench'], sourceCandidateId: 'training:bench-review',
      },
    })
    expect(review).toHaveLength(1)
    expect(review[0]?.actionText).toBe('Review next session')
    expect(review[0]?.detail).toContain('no need to add another session')
  })

  it('possible plateau and incomplete food records: evidence review wins over a calorie or activity adjustment', () => {
    const nutritionLimitation = {
      code: 'nutrition_quality_floor', text: 'Recent intake coverage is incomplete.',
      detailPath: '/nutrition',
    }
    // Deliberately supply an otherwise optimistic Maintenance decision to
    // prove the recent verified-food-day gate remains independent.
    const optimisticMaintenance = {
      interventions: [{
        id: 'cal-review', kind: 'review_intake_adjustment', priority: 'primary',
        title: 'Review intake', detail: 'Review', detailPath: '/nutrition',
      }, {
        id: 'activity-review', kind: 'review_activity_adjustment', priority: 'secondary',
        title: 'Review activity', detail: 'Review', detailPath: '/activity',
      }],
      calorieAdjustmentSafety: { status: 'review_possible' },
      estimate: { confidence: 'moderate' },
    } as unknown as GoalControlState['maintenance']
    const c = control({
      primaryOpportunity: {
        id: 'cal-review', kind: 'review_intake_adjustment', domain: 'nutrition',
        title: 'Review intake', detail: 'Review possible adjustment',
        actionText: 'Review nutrition', detailPath: '/nutrition',
        evidenceRefs: ['maintenance:estimate'], sourceCandidateId: 'cal-review',
      },
      maintenance: optimisticMaintenance, limitations: [nutritionLimitation],
    })
    const drafts = buildCoachRecommendationDrafts(c)
    expect(drafts.map(d => d.kind)).not.toContain('review_intake_adjustment')
    expect(drafts.map(d => d.kind)).not.toContain('review_activity_adjustment')
    expect(drafts.map(d => d.kind)).toContain('improve_evidence')
    const question = buildCoachFollowUpQuestion(c)
    expect(question?.title).toContain('food logging')
    expect(question?.detailPath).toBe('/nutrition')
    expect(question?.detail).not.toContain('cut calories')
    // Digestive symptoms aren't in this data packet: do not diagnose them or
    // use an invented symptom as permission to change nutrition targets.
    expect(drafts.map(d => d.detail).join(' ')).not.toContain('constipation')
  })

  it('no meaningful mature signals: stays quiet instead of fabricating a Coach recommendation', () => {
    const c = control({ state: 'maintain', limitations: [], primaryOpportunity: null })
    expect(buildCoachRecommendationDrafts(c)).toEqual([])
    expect(buildCoachFollowUpQuestion(c)).toBeNull()
    const html = render([], 'Stay the course', 'No meaningful change recommended.')
    expect(html).toContain('No meaningful change recommended.')
    expect(html).not.toContain('<article')
    expect(html).not.toContain('I started this')
  })

  it('experiment accepted but not implemented: acceptance is not an intervention start', () => {
    const link = projectCoachLinkedExperiment({
      id: LAB, origin: 'owner_created', status: 'accepted',
      window_start: null, window_end: null, result_id: null, classification: null,
    }, TODAY)!
    expect(link.status).toBe('accepted')
    expect(link.reviewReady).toBe(false)
    expect(link.resultId).toBeNull()
    expect(coachLinkedExperimentCopy(link)).toContain('not scheduled or started')
    const original = card(LAB)
    const html = render([{ ...original, linkedExperiment: link }], 'Review', 'Review Lab')
    expect(html).toContain('Accepted in Lab; not scheduled or started')
    expect(html).not.toContain('Explore experiment')
    expect(html).not.toContain('>I started this</button>')
    const memory: CoachRecommendationMemory = {
      id: ID, fingerprint: original.fingerprint,
      recommendationKind: original.kind, responseState: null,
      ownerStarted: false, suppressUntil: null, followUpOn: null,
      outcomeState: null, lastSurfacedOn: TODAY,
    }
    expect(recommendationIsSuppressed(memory, TODAY)).toBe(false)
  })

  it('an active, ended window without a valid result is review-ready, not evaluated or effective', () => {
    const link = projectCoachLinkedExperiment({
      id: LAB, origin: 'owner_created', status: 'active',
      window_start: '2026-10-01', window_end: '2026-10-16',
      result_id: null, classification: null,
    }, TODAY)!
    expect(link.reviewReady).toBe(true)
    expect(link.resultId).toBeNull()
    const html = render([{ ...card(LAB), linkedExperiment: link }], 'Review', 'Inspect Lab')
    expect(html).toContain('Review the evidence before drawing conclusions')
    expect(html).not.toContain('Review recorded Lab result')
    expect(html).not.toContain('>I started this</button>')
  })

  it('recorded low adherence never proves benefit, and historical closure is preserved', () => {
    const link = projectCoachLinkedExperiment({
      id: LAB, origin: 'owner_created', status: 'completed',
      window_start: '2026-10-01', window_end: '2026-10-16',
      result_id: '123e4567-e89b-42d3-a456-426614174002',
      classification: 'completed_low_adherence',
    }, TODAY)!
    const html = render([{ ...card(LAB), linkedExperiment: link }], 'Review', 'Inspect Lab')
    expect(html).toContain('low adherence; no proven benefit')
    expect(html).toContain('Review recorded Lab result')
    expect(coachLinkedExperimentCopy(projectCoachLinkedExperiment({
      id: LAB, origin: 'owner_created', status: 'abandoned',
      window_start: '2026-10-01', window_end: '2026-10-16',
      result_id: null, classification: null,
    }, TODAY)!)).toContain('historical association only')
  })
})
