import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { requireCurrentNonCalorieRecommendation } from '../server/intelligence/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.tsx'
import type { CoachIntelligenceState, CoachRecommendationDraft } from '../src/domain/coach-intelligence.js'

const training: CoachRecommendationDraft = {
  fingerprint: 'coach:i9:training:bench', sourceId: 'training:bench',
  kind: 'training_progression', domain: 'training', title: 'Check bench',
  detail: 'Review your training evidence.', actionText: 'Review', detailPath: '/training',
  confidence: 'moderate', evidenceRefs: ['training:bench'], priority: 80,
  experimentEligible: true,
}

describe('PIQ-1.5 historical Coach context', () => {
  it('rejects a saved non-calorie start after the corresponding live signal disappears', async () => {
    await expect(requireCurrentNonCalorieRecommendation(
      { recommendation_kind: 'training_progression', fingerprint: training.fingerprint },
      '2026-10-15', [],
    )).rejects.toMatchObject({ statusCode: 409 })
  })

  it('matches both kind and fingerprint, not just a saved title or reused ID', async () => {
    await expect(requireCurrentNonCalorieRecommendation(
      { recommendation_kind: 'training_progression', fingerprint: training.fingerprint },
      '2026-10-15', [{ ...training, kind: 'review_goal_plan' }],
    )).rejects.toMatchObject({ statusCode: 409 })
    await expect(requireCurrentNonCalorieRecommendation(
      { recommendation_kind: 'training_progression', fingerprint: training.fingerprint },
      '2026-10-15', [training],
    )).resolves.toBeUndefined()
    await expect(requireCurrentNonCalorieRecommendation(
      { recommendation_kind: 'review_intake_adjustment', fingerprint: 'saved-calorie' },
      '2026-10-15', [],
    )).resolves.toBeUndefined()
  })

  it('routes owner actions through the live non-calorie verifier', () => {
    const server = readFileSync('server/intelligence/coach-intelligence.ts', 'utf8')
    const response = server.slice(server.indexOf('export async function respondCoachRecommendation('))
    expect(response).toContain('await requireCurrentCalorieRecommendation(row, asOf)')
    expect(response).toContain('await requireCurrentNonCalorieRecommendation(row, asOf, undefined, expectedContextRevision)')
    expect(server).toContain('historical: !validFingerprints.has(row.fingerprint)')
  })

  it('labels old owner-started actions as historical rather than new advice', () => {
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: '2026-10-15', state: 'maintain',
      headline: 'Stay the course', summary: 'No new change', noChangeRecommended: true,
      nextBestActions: [], question: null, questionBudgetDays: 3,
      followUps: [{
        id: '11111111-1111-4111-8111-111111111111',
        responseAt: '2026-10-01 08:00:00+00',
        title: 'Review strength progression', detail: 'Prior training signal',
        detailPath: '/training', acceptedOn: '2026-10-01T08:00:00.000Z',
        followUpOn: '2026-10-08', historical: true,
      }],
    }
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachIntelligencePanel
          state={state} pending={false}
          onResponse={() => undefined} onOutcome={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Historical follow-up')
    expect(html).toContain('not part of today')
    expect(html).toContain('this is not advice to restart it')
    expect(html).toContain('You marked this as started')
    expect(html).toContain('>Helped</button>')
  })
})
