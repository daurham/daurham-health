import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { GoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts, type CoachIntelligenceState } from '../src/domain/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.tsx'
import { GoalControlCard } from '../src/features/goal-control/GoalControlCard.tsx'

/** Deliberately different cross-domain and Maintenance confidence values.
 * This mimics the production failure without claiming a real owner estimate.
 */
function fixture(): GoalControlState {
  return {
    version: 'goal-control-v1',
    asOf: '2026-10-15',
    period: { start: '2026-10-08', end: '2026-10-14' },
    state: 'act',
    headline: 'Review the current plateau',
    summary: 'The estimate is uncertain and a calorie change needs review.',
    noChangeRecommended: false,
    confidence: 'high',
    primaryOpportunity: {
      id: 'maintenance:review-intake',
      kind: 'review_intake_adjustment',
      domain: 'nutrition',
      title: 'Review intake',
      detail: 'Review the evidence before changing calories.',
      actionText: 'Review',
      detailPath: '/nutrition',
      sourceCandidateId: null,
      evidenceRefs: ['maintenance:estimate'],
    },
    goals: [],
    nutritionQuality: {
      state: 'met', period: { start: '2026-10-08', end: '2026-10-14' },
      loggedDays: 5, reliableDays: 4, estimateHeavyDays: 1, unknownQualityDays: 0,
      requiredLoggedDays: 4, requiredReliableDays: 4, detail: 'Recent evidence met the weekly floor.',
    },
    trainingAdherence: {
      configured: false, completedProgrammedSessions: 0, qualifiedTrainingDays: null,
      weeklyFrequencyTarget: null, remainingQualifiedDays: null, remainingSessions: null,
      todayIntent: null, futureTrainingDates: [], state: 'unconfigured', detail: 'No schedule.',
    },
    relationships: [], limitations: [], trainingProgression: null,
    maintenance: {
      estimate: {
        state: 'available',
        confidence: 'moderate',
        observedMaintenanceKcal: 1884,
        rangeLowKcal: 1720, rangeHighKcal: 2040,
        period: { start: '2026-09-17', end: '2026-10-14', days: 28 },
        quality: {
          nutrition: { reliableDays: 14 },
          body: { usedMeasurements: 7 },
        },
        explanation: 'Estimates are limited by meal completeness and weigh-in conditions.',
      },
      interventions: [{
        id: 'maintenance:review-intake', kind: 'review_intake_adjustment', priority: 'primary',
        title: 'Review intake', detail: 'Review before changing.', detailPath: '/nutrition',
        suggestedDeltaKcal: null,
      }],
      calorieAdjustmentSafety: { status: 'review_possible' },
      evidenceExplanation: {
        nutrition: { status: 'limited', detail: 'Some meal evidence is missing.' },
        weightTrend: { status: 'limited', detail: 'Measurements vary.' },
        plateau: { status: 'possible', detail: 'Plateau is possible.' },
        calorieDecision: { status: 'review_only', detail: 'No automatic change.' },
      },
    },
  } as GoalControlState
}

describe('PIQ-1.6 confidence scopes are not interchangeable', () => {
  it('labels Goal evidence and Maintenance estimate confidence independently', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><GoalControlCard state={fixture()} /></MemoryRouter>,
    )
    expect(html).toContain('Goal evidence · high confidence')
    expect(html).toContain('Maintenance estimate confidence: moderate')
    expect(html).toContain('Observed maintenance estimate')
    expect(html).toContain('1,884')
    expect(html).toContain('Estimated range')
    expect(html).toContain('1,720')
    expect(html).toContain('2,040')
    expect(html).toContain('Maintenance estimate evidence')
    expect(html).toContain('14 reliable nutrition days')
    expect(html).toContain('7 comparable weight measurements')
    expect(html).toContain('not proof of complete intake')
    expect(html).not.toContain('Maintenance estimate confidence: high')
  })

  it('uses Maintenance estimate confidence for a primary Maintenance Coach card', () => {
    const drafts = buildCoachRecommendationDrafts(fixture())
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      kind: 'review_intake_adjustment', confidence: 'moderate',
    })
    expect(drafts[0]?.evidenceExplanation?.calorieDecision.status).toBe('review_only')
  })

  it('does not borrow broad Goal confidence when an unmatched Training trend lacks exact evidence', () => {
    const state = fixture()
    const drafts = buildCoachRecommendationDrafts({
      ...state, primaryOpportunity: {
        id: 'training:bench', kind: 'training_progression', domain: 'training',
        title: 'Review bench', detail: 'Review qualified sets.',
        actionText: 'Review training', detailPath: '/training',
        sourceCandidateId: null, evidenceRefs: ['training:bench'],
      },
    })
    const training = drafts.find((item) => item.kind === 'training_progression')
    expect(training?.confidence).toBe('unknown')
    expect(training?.trainingEvidence).toBeUndefined()
  })

  it('never renders a numeric maintenance estimate when evidence is insufficient', () => {
    const state = fixture()
    const html = renderToStaticMarkup(
      <MemoryRouter><GoalControlCard state={{
        ...state, maintenance: {
          ...state.maintenance!,
          estimate: { ...state.maintenance!.estimate, state: 'insufficient_evidence', observedMaintenanceKcal: null },
        },
      }} /></MemoryRouter>,
    )
    expect(html).not.toContain('Observed maintenance estimate')
    expect(html).not.toContain('1,884')
  })
})

function trainingFixture(): GoalControlState {
  const state = fixture()
  const opportunity = {
    id: 'training-progression:bench-press', kind: 'training_progression', domain: 'training',
    title: 'Bench performance may be stalled', detail: 'Review comparable lifting sessions.',
    actionText: 'Review Training', detailPath: '/training', sourceCandidateId: null,
    evidenceRefs: ['training:exercise:bench-press'],
  }
  return {
    ...state, primaryOpportunity: opportunity,
    trainingProgression: {
      version: 'training-progression-v1', asOf: '2026-10-15',
      window: { start: '2026-09-18', end: '2026-10-15' },
      summary: 'Bench trend requires review.',
      series: [{
        exerciseId: 'bench-press', exerciseName: 'Bench press',
        metric: 'e1rm_kg', state: 'stalled', confidence: 'limited',
        exposureCount: 5, latestDate: '2026-10-14',
        recentValue: 80, priorValue: 80, changePct: 0,
        recentRelativeStrength: null, recentAverageRir: 2,
        recentAverageRpe: 8, recentHardSets: 3,
        limitationKinds: ['soreness'], explanation: 'Five exact-exercise exposures suggest a narrow performance band.',
      }],
      movementExposure: [], muscleExposure: [], goalRelationships: [],
      primaryOpportunity: {
        id: opportunity.id, title: opportunity.title, detail: opportunity.detail,
        actionText: opportunity.actionText, detailPath: opportunity.detailPath,
        evidenceRefs: [...opportunity.evidenceRefs],
      },
    },
  }
}

describe('PIQ-1.6 exact Training evidence confidence', () => {
  it('keeps Goal, Maintenance and Training confidence independent in the same overview', () => {
    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={trainingFixture()} /></MemoryRouter>)
    expect(html).toContain('Goal evidence · high confidence')
    expect(html).toContain('Maintenance estimate confidence: moderate')
    expect(html).toContain('Exact-exercise Training trend confidence: limited')
    expect(html).toContain('Training trend evidence')
    expect(html).toContain('5 comparable recorded exposures')
    expect(html).not.toContain('Exact-exercise Training trend confidence: high')
  })

  it('shows comparable exposure, latest date, limitations and trend explanation without inferring adherence', () => {
    const control = trainingFixture()
    const draft = buildCoachRecommendationDrafts(control).find((item) => item.kind === 'training_progression')
    expect(draft).toMatchObject({
      confidence: 'limited',
      trainingEvidence: {
        exerciseName: 'Bench press', exposureCount: 5, latestDate: '2026-10-14',
        state: 'stalled', changePct: 0, limitationKinds: ['soreness'],
      },
    })
    const view = { ...draft!, id: '11111111-1111-4111-8111-111111111111', responseState: null, responseAt: null }
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: control.asOf, state: 'act',
      headline: 'Review your Training', summary: 'Evidence-specific confidence',
      noChangeRecommended: false, nextBestActions: [view],
      followUps: [], question: null, questionBudgetDays: 3,
    }
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} /></MemoryRouter>,
    )
    expect(html).toContain('How this Training trend was assessed')
    expect(html).toContain('limited confidence in exact-exercise trend')
    expect(html).toContain('5 comparable recorded exposures')
    expect(html).toContain('latest exposure 2026-10-14')
    expect(html).toContain('Recorded session limitations: soreness')
    expect(html).toContain('Only logged comparable exercise sets')
  })

  it('does not match a similarly suffixed exercise ID or fabricate exposure values', () => {
    const control = trainingFixture()
    const bad = {
      ...control, primaryOpportunity: {
        ...control.primaryOpportunity!, id: 'other:bench-press',
      },
    }
    const draft = buildCoachRecommendationDrafts(bad).find((item) => item.kind === 'training_progression')
    expect(draft?.confidence).toBe('unknown')
    expect(draft?.trainingEvidence).toBeUndefined()
    const html = renderToStaticMarkup(<MemoryRouter><GoalControlCard state={bad} /></MemoryRouter>)
    expect(html).toContain('Exact-exercise Training trend confidence: unknown')
  })
})
