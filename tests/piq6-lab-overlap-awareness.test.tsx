import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { hydrateCoachLinkedExperiments } from '../server/intelligence/coach-intelligence.js'
import { coachLabOverlapCopy, projectCoachLabOverlapReview } from '../src/domain/coach-lab-overlaps.js'
import type { CoachRecommendationView, CoachIntelligenceState } from '../src/domain/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'

const LAB = '123e4567-e89b-42d3-a456-426614174001'
const OTHER = '123e4567-e89b-42d3-a456-426614174002'
const TODAY = '2026-10-17'
function card(id = LAB): CoachRecommendationView {
  return {
    id: '123e4567-e89b-42d3-a456-426614174000', fingerprint: 'coach:i9:synthetic',
    kind: 'training_progression', domain: 'training', title: 'Review change',
    detail: 'Review source', actionText: 'Review', detailPath: '/training',
    confidence: 'limited', evidenceRefs: [], responseState: null, responseAt: null,
    experimentEligible: true, linkedExperimentId: id,
  }
}
function row(id = LAB, status = 'completed') {
  return {
    id, origin: 'owner_created', status,
    window_start: '2026-10-01', window_end: '2026-10-16',
    result_id: null, classification: null,
    implementation_date: null, implementation_change: null, implementation_retracted: false,
  }
}
function html(cards: CoachRecommendationView[]) {
  const state: CoachIntelligenceState = {
    version: 'coach-intelligence-v1', asOf: TODAY,
    state: 'act', headline: 'Review', summary: 'Inspect Lab',
    noChangeRecommended: false, nextBestActions: cards,
    followUps: [], question: null, questionBudgetDays: 3,
  }
  return renderToStaticMarkup(<MemoryRouter><CoachIntelligencePanel
    state={state} pending={false} onResponse={() => undefined}
    onOutcome={() => undefined} /></MemoryRouter>)
}

describe('PIQ-6.3 read-only source-based overlapping-change checks', () => {
  it('projects known aggregated kinds and respects SQL count types without exposing raw context', () => {
    const observations = [
      { experiment_id: LAB, kind: 'nutrition_target', event_count: '2' },
      { experiment_id: LAB, kind: 'daily_context', event_count: 1 },
      { experiment_id: LAB, kind: 'other_experiment', event_count: '1' },
    ]
    const review = projectCoachLabOverlapReview(observations, LAB)
    expect(review.state).toBe('recorded')
    expect(review.observations).toHaveLength(3)
    const copy = coachLabOverlapCopy(review)!
    expect(copy).toContain('nutrition target changes (2)')
    expect(copy).toContain('relevant daily context tags (1)')
    expect(copy).toContain('another owner-reported experiment change (1)')
    expect(copy).toContain('not proven confounders or evidence of causation')
  })

  it('fails closed for impossible counts, invalid kinds, duplicate or mismatched records', () => {
    for (const [kind, event_count, experiment_id] of [
      ['unknown', 1, LAB], ['daily_context', 0, LAB],
      ['daily_context', -1, LAB], ['daily_context', 'NaN', LAB],
      ['daily_context', '1.5', LAB], ['daily_context', Number.POSITIVE_INFINITY, LAB],
      ['daily_context', 2, OTHER],
    ] as const) {
      const review = projectCoachLabOverlapReview([{ kind, event_count, experiment_id }], LAB)
      expect(review.state).toBe('unavailable')
      expect(review.observations).toEqual([])
    }
    expect(projectCoachLabOverlapReview([
      { experiment_id: LAB, kind: 'nutrition_target', event_count: 1 },
      { experiment_id: LAB, kind: 'nutrition_target', event_count: 2 },
    ], LAB).state).toBe('unavailable')
  })

  it('checks only eligible verified owner Lab windows and avoids a second query for scheduled or unscheduled', async () => {
    for (const lab of [
      { ...row(), status: 'scheduled' },
      { ...row(), status: 'accepted', window_start: null, window_end: null },
      { ...row(), status: 'active', window_start: '2026-10-19', window_end: '2026-10-26' },
    ]) {
      const query = vi.fn().mockResolvedValue([lab])
      const cards = [card()]
      await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, TODAY)
      expect(query).toHaveBeenCalledTimes(1)
      expect(cards[0].linkedExperiment?.overlapReview).toBeUndefined()
    }
  })

  it('batches verified windows once, excludes the experiment itself, retracts, and future events', async () => {
    const query = vi.fn()
      .mockResolvedValueOnce([row(LAB, 'active'), row(OTHER, 'completed')])
      .mockResolvedValueOnce([
        { experiment_id: LAB, kind: 'nutrition_target', event_count: 1 },
        { experiment_id: LAB, kind: 'other_experiment', event_count: 2 },
        { experiment_id: OTHER, kind: 'daily_context', event_count: 3 },
      ])
    const cards = [card(LAB), card(OTHER)]
    await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, TODAY)
    expect(query).toHaveBeenCalledTimes(2)
    const [sql, bind] = query.mock.calls[1] as [string, unknown[]]
    expect(bind).toEqual([[LAB, OTHER], TODAY])
    expect(sql).toContain('FROM nutrition_targets')
    expect(sql).toContain('FROM training_plan_versions')
    expect(sql).toContain('FROM supplement_status_events')
    expect(sql).toContain('FROM daily_context')
    expect(sql).toContain('FROM goals')
    expect(sql).toContain("status = 'confirmed'")
    expect(sql).toContain('implementation.experiment_id <> lab.id')
    expect(sql).toContain("latest.action IS DISTINCT FROM 'retracted'")
    expect(sql).toContain('LEAST(lab.window_end, $2::date)')
    expect(sql).toContain("lab.origin = 'owner_created'")
    expect(sql).not.toContain('context.note')
    expect(sql).not.toContain('owner_note')
    expect(cards[0].linkedExperiment?.overlapReview?.observations).toHaveLength(2)
    expect(cards[1].linkedExperiment?.overlapReview?.observations).toEqual([
      { kind: 'daily_context', count: 3 },
    ])
    const markup = html(cards)
    expect(markup).toContain('Other recorded changes overlap this observation window')
    expect(markup).toContain('These are timing overlaps')
    expect(markup).not.toContain('I started this</button>')
  })

  it('no recorded overlap does not claim complete confounder control', async () => {
    const query = vi.fn().mockResolvedValueOnce([row()])
      .mockResolvedValueOnce([])
    const cards = [card()]
    await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, TODAY)
    expect(cards[0].linkedExperiment?.overlapReview?.state).toBe('none_recorded')
    const page = html(cards)
    expect(page).toContain('Missing logs, unrecorded changes and baseline quality remain unknown')
    expect(page).toContain('this does not prove an effect')
  })

  it('unavailable or malformed overlap source cannot hide a confirmed Lab association or imply stability', async () => {
    for (const result of [
      { error: new Error('ledger unavailable') },
      { rows: [{ experiment_id: LAB, kind: 'not_a_kind', event_count: 1 }] },
      { rows: [{ experiment_id: OTHER, kind: 'training_plan', event_count: 1 }] },
    ]) {
      const query = vi.fn().mockResolvedValueOnce([row()])
      if ('error' in result) query.mockRejectedValueOnce(result.error)
      else query.mockResolvedValueOnce(result.rows)
      const cards = [card()]
      await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, TODAY)
      expect(cards[0].linkedExperimentId).toBe(LAB)
      expect(cards[0].linkedExperiment?.overlapReview?.state).toBe('unavailable')
      const page = html(cards)
      expect(page).toContain('Overlapping-change review unavailable')
      expect(page).not.toContain('No changes found in the checked records')
      expect(page).not.toContain('Explore experiment')
    }
  })
})
