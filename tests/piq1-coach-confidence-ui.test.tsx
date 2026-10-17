import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import type { CoachIntelligenceState } from '../src/domain/coach-intelligence.js'
import type { MaintenanceEvidenceExplanation } from '../src/domain/maintenance.js'

const evidence: MaintenanceEvidenceExplanation = {
  nutrition: { status: 'well_sampled', detail: '22 of 28 confirmed complete logged days; reporting is not proof.' },
  weightTrend: { status: 'limited', detail: 'Five comparable weigh-ins over 15 days.' },
  plateau: { status: 'possible', detail: 'A flat trend is suggestive, but not conclusive.' },
  calorieDecision: { status: 'withheld', detail: 'Existing intake is too low for another reduction review.' },
}
function state(withEvidence: boolean): CoachIntelligenceState {
  return {
    version: 'coach-intelligence-v1', asOf: '2026-10-15',
    state: 'act', headline: 'Review calorie target and recovery',
    summary: 'More evidence first', noChangeRecommended: false,
    nextBestActions: [{
      id: 'test', fingerprint: 'coach:i9:maintenance:review-safety',
      kind: withEvidence ? 'review_goal_plan' : 'training_progression',
      domain: 'goals', title: 'Review before changing course',
      detail: 'Current signals should not be used to change your targets.',
      actionText: 'Review', detailPath: '/goals', confidence: 'high',
      evidenceRefs: ['maintenance:estimate'], responseState: null, experimentEligible: false,
      ...(withEvidence ? { evidenceExplanation: evidence } : {}),
    }],
    followUps: [], question: null, questionBudgetDays: 3,
  }
}
describe('PIQ-1.2 maintenance confidence disclosure in Coach', () => {
  it('renders four accessible, collapsed explanations only for evidence-bearing cards', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachIntelligencePanel state={state(true)} pending={false} onResponse={() => undefined} onOutcome={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('<details')
    expect(html).toContain('How this was assessed')
    expect(html).toContain('Food-log evidence')
    expect(html).toContain('Weight-trend evidence')
    expect(html).toContain('Plateau assessment')
    expect(html).toContain('Calorie-change decision')
    expect(html).toContain('not proof')
    expect(html).toContain('withheld')
    expect(html).not.toContain('Safe to cut')
  })

  it('leaves unrelated Coach recommendations compact with no fabricated evidence disclosure', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachIntelligencePanel state={state(false)} pending={false} onResponse={() => undefined} onOutcome={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Other feedback') // Optional owner feedback is not an evidence disclosure.
    expect(html).not.toContain('How this was assessed')
    expect(html).not.toContain('Food-log evidence')
    expect(html).not.toContain('Calorie-change decision')
  })
})
