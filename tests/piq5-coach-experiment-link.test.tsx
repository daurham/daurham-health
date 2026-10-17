import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { writeCoachRecommendationExperimentLink, surfaceDraft } from '../server/intelligence/coach-intelligence.js'
import { labExperimentHandoffPath, readLabExperimentHandoff, labExperimentDetailHandoffPath } from '../src/domain/lab-handoff.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import type { CoachIntelligenceState, CoachRecommendationDraft, CoachRecommendationView } from '../src/domain/coach-intelligence.js'

const ID = '123e4567-e89b-42d3-a456-426614174000'
const LAB = '123e4567-e89b-42d3-a456-426614174001'
const REVISION = 'b'.repeat(64)
const fingerprint = 'coach:i9:training:bench'
const draft: CoachRecommendationDraft = {
  fingerprint, sourceId: 'training:bench', kind: 'training_progression',
  domain: 'training', title: 'Review bench trend', detail: 'Compare recent sets.',
  actionText: 'Review training', detailPath: '/training', confidence: 'moderate',
  evidenceRefs: ['training:bench'], priority: 90, experimentEligible: true,
}
const sourceRow = {
  id: ID, recommendation_kind: 'training_progression', fingerprint,
  metadata: { experimentEligible: true }, response_at: null,
}

describe('PIQ-5.5 explicit owner-selected canonical Lab linkage', () => {
  it('round-trips a bounded Coach handoff but never treats the URL as an authorization', () => {
    const input = {
      title: 'Bench trend', rationale: 'Review the exact evidence.', source: 'coach' as const,
      coachRecommendation: { recommendationId: ID, contextRevision: REVISION, responseAt: null },
    }
    const path = labExperimentHandoffPath(input)
    const parsed = readLabExperimentHandoff(new URLSearchParams(path.split('?')[1]))
    expect(parsed).toEqual(input)
    const detail = labExperimentDetailHandoffPath(LAB, parsed!)
    expect(detail.startsWith('/lab/experiments/' + LAB + '?')).toBe(true)
    expect(readLabExperimentHandoff(new URLSearchParams(detail.split('?')[1]))?.coachRecommendation)
      .toEqual(input.coachRecommendation)
    expect(readLabExperimentHandoff(new URLSearchParams('from=weekly_coach&coachId=' + ID +
      '&coachRevision=' + REVISION + '&coachResponseAt='))?.coachRecommendation).toBeUndefined()
  })

  it('drops malformed handoff IDs and missing versions rather than granting a link', () => {
    const handoff = readLabExperimentHandoff(new URLSearchParams(
      'from=coach&title=Example&coachId=wrong&coachRevision=' + REVISION + '&coachResponseAt=',
    ))
    expect(handoff?.coachRecommendation).toBeUndefined()
    expect(readLabExperimentHandoff(new URLSearchParams(
      'from=coach&coachId=' + ID + '&coachRevision=' + REVISION,
    ))?.coachRecommendation).toBeUndefined()
  })

  it('rejects malformed IDs before database access', async () => {
    const query = vi.fn()
    const assertCurrent = vi.fn()
    await expect(writeCoachRecommendationExperimentLink(
      { query } as unknown as Sql, ID, 'not-a-uuid', null, assertCurrent,
    )).rejects.toMatchObject({ statusCode: 400 })
    expect(query).not.toHaveBeenCalled()
    expect(assertCurrent).not.toHaveBeenCalled()
  })

  it('refuses question, calorie, and evidence-only cards before writing', async () => {
    for (const row of [
      { ...sourceRow, recommendation_kind: 'follow_up_question' },
      { ...sourceRow, recommendation_kind: 'review_intake_adjustment' },
      { ...sourceRow, metadata: { experimentEligible: false } },
    ]) {
      const query = vi.fn().mockResolvedValueOnce([row])
      const assertCurrent = vi.fn()
      await expect(writeCoachRecommendationExperimentLink(
        { query } as unknown as Sql, ID, LAB, null, assertCurrent,
      )).rejects.toMatchObject({ statusCode: 409 })
      expect(query).toHaveBeenCalledTimes(1)
      expect(assertCurrent).not.toHaveBeenCalled()
    }
  })

  it('fails closed if current evidence changed, without a linkage update', async () => {
    const query = vi.fn().mockResolvedValueOnce([sourceRow])
    const assertCurrent = vi.fn().mockRejectedValue({ statusCode: 409 })
    await expect(writeCoachRecommendationExperimentLink(
      { query } as unknown as Sql, ID, LAB, null, assertCurrent,
    )).rejects.toMatchObject({ statusCode: 409 })
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('only links an existing owner-created, not-yet-cancelled experiment under exact response CAS', async () => {
    const query = vi.fn().mockResolvedValueOnce([sourceRow]).mockResolvedValueOnce([{ id: ID }])
    const assertCurrent = vi.fn().mockResolvedValue(undefined)
    await writeCoachRecommendationExperimentLink(
      { query } as unknown as Sql, ID, LAB, null, assertCurrent,
    )
    expect(assertCurrent).toHaveBeenCalledTimes(1)
    const [sql, params] = query.mock.calls[1] as [string, unknown[]]
    expect(params).toEqual([ID, LAB, null])
    for (const clause of [
      'response_at::text IS NOT DISTINCT FROM $3::text',
      'coach.response_state IS NULL',
      "coach.metadata ->> 'linkedExperimentId' IS NULL",
      "lab.origin = 'owner_created'",
      "lab.status IN ('accepted', 'scheduled', 'active')",
      'to_jsonb($2::text)',
      'RETURNING coach.id::text AS id',
    ]) expect(sql).toContain(clause)
    expect(sql).not.toContain('SET response_state')
    expect(sql).not.toContain('UPDATE experiments')
    expect(sql).not.toContain('follow_up_on =')
  })

  it('blocks already linked or concurrently changed cards without fabricating success', async () => {
    const query = vi.fn().mockResolvedValueOnce([sourceRow]).mockResolvedValueOnce([])
    await expect(writeCoachRecommendationExperimentLink(
      { query } as unknown as Sql, ID, LAB, null, async () => undefined,
    )).rejects.toMatchObject({ statusCode: 409 })
  })

  it('preserves linked identity on Coach refresh without treating it as a started intervention', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ id: ID }])
    await surfaceDraft({ query } as unknown as Sql, draft, '2026-10-17', null)
    const [sql] = query.mock.calls[0] as [string, unknown[]]
    expect(sql).toContain("jsonb_build_object('linkedExperimentId', coach_recommendations.metadata ->> 'linkedExperimentId')")
    expect(sql).not.toContain('SET response_state')
    const source = readFileSync('server/intelligence/coach-intelligence.ts', 'utf8')
    expect(source).toContain('await hydrateCoachLinkedExperiments(sql, surfaced, asOf)')
    expect(source).toContain('requireCurrentNonCalorieRecommendation(row, asOf, undefined, expectedContextRevision)')
  })

  it('shows a navigable real Lab association, without claiming implementation or requiring acceptance', () => {
    const view: CoachRecommendationView = {
      id: ID, fingerprint, kind: 'training_progression', domain: 'training',
      title: 'Bench', detail: 'Review sets', actionText: 'Review', detailPath: '/training',
      confidence: 'moderate', evidenceRefs: ['training:bench'],
      responseState: null, responseAt: null, contextRevision: REVISION,
      experimentEligible: true, linkedExperimentId: LAB,
    }
    const state: CoachIntelligenceState = {
      version: 'coach-intelligence-v1', asOf: '2026-10-17',
      state: 'act', headline: 'Review', summary: 'Review evidence',
      noChangeRecommended: false, nextBestActions: [view],
      followUps: [], question: null, questionBudgetDays: 3,
    }
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachIntelligencePanel
        state={state} pending={false} onResponse={() => undefined} onOutcome={() => undefined}
      /></MemoryRouter>,
    )
    expect(html).toContain('/lab/experiments/' + LAB)
    expect(html).toContain('does not establish that an experiment started or worked')
    expect(html).not.toContain('Explore experiment')
    const lab = readFileSync('src/features/lab/ExperimentPages.tsx', 'utf8')
    expect(lab).toContain('Link this experiment to Coach')
    expect(lab).toContain('await linkCoachExperiment(')
    expect(lab).toContain('labExperimentDetailHandoffPath(created.id, handoff)')
  })
  it('shows canonical Lab statuses without inferring intervention or clinical benefit', async () => {
    const { hydrateCoachLinkedExperiments } = await import('../server/intelligence/coach-intelligence.js')
    const { coachLinkedExperimentCopy } = await import('../src/domain/coach-lab-lifecycle.js')
    for (const [status, copyFragment, resultId] of [
      ['accepted', 'not scheduled or started', null],
      ['scheduled', 'not started', null],
      ['active', 'adherence and outcomes are not verified', null],
      ['completed', 'does not establish causation', '123e4567-e89b-42d3-a456-426614174002'],
      ['inconclusive', 'inconclusive', '123e4567-e89b-42d3-a456-426614174002'],
      ['abandoned', 'historical association only', null],
      ['superseded', 'historical association only', null],
    ] as const) {
      const cards: CoachRecommendationView[] = [{
        id: ID, fingerprint, kind: 'training_progression', domain: 'training',
        title: 'Bench', detail: 'Review', actionText: 'Review', detailPath: '/training',
        confidence: 'limited', evidenceRefs: [], responseState: null, responseAt: null,
        experimentEligible: true, linkedExperimentId: LAB,
      }]
      const query = vi.fn().mockResolvedValue([{
        id: LAB, origin: 'owner_created', status, window_start: null,
        window_end: null, result_id: resultId,
        classification: resultId ? 'completed_interpretable' : null,
      }])
      await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, '2026-10-17')
      expect(query).toHaveBeenCalledTimes(1)
      expect(cards[0].linkedExperimentId).toBe(LAB)
      expect(cards[0].linkedExperiment?.status).toBe(status)
      expect(cards[0].linkedExperiment?.resultId).toBe(resultId)
      expect(coachLinkedExperimentCopy(cards[0].linkedExperiment!)).toContain(copyFragment)
      const [sql] = query.mock.calls[0] as [string, unknown[]]
      expect(sql).toContain("status = 'valid'")
    }
  })

  it('honors the full observation window before surfacing a Lab result review', async () => {
    const { projectCoachLinkedExperiment, coachLinkedExperimentCopy } =
      await import('../src/domain/coach-lab-lifecycle.js')
    const input = {
      id: LAB, origin: 'owner_created', status: 'active', window_start: '2026-10-01',
      window_end: '2026-10-16', result_id: null, classification: null,
    }
    expect(projectCoachLinkedExperiment(input, '2026-10-16')?.reviewReady).toBe(false)
    const ended = projectCoachLinkedExperiment(input, '2026-10-17')!
    expect(ended.reviewReady).toBe(true)
    expect(ended.resultId).toBeNull()
    expect(coachLinkedExperimentCopy(ended)).toContain('Review the evidence before drawing conclusions')
    expect(projectCoachLinkedExperiment({ ...input, origin: 'ai_assisted' }, '2026-10-17')).toBeNull()
    expect(projectCoachLinkedExperiment({ ...input, status: 'unexpected' }, '2026-10-17')).toBeNull()
    expect(projectCoachLinkedExperiment({ ...input, id: 'invalid' }, '2026-10-17')).toBeNull()
  })

  it('hides unverifiable Lab links without offering a duplicate or implying a new start', async () => {
    const { hydrateCoachLinkedExperiments } = await import('../server/intelligence/coach-intelligence.js')
    for (const query of [vi.fn().mockResolvedValue([]), vi.fn().mockRejectedValue(new Error('Lab unavailable'))]) {
      const cards: CoachRecommendationView[] = [{
        id: ID, fingerprint, kind: 'training_progression', domain: 'training',
        title: 'Bench', detail: 'Review', actionText: 'Review', detailPath: '/training',
        confidence: 'limited', evidenceRefs: [], responseState: null, responseAt: null,
        experimentEligible: true, linkedExperimentId: LAB,
      }]
      await hydrateCoachLinkedExperiments({ query } as unknown as Sql, cards, '2026-10-17')
      expect(cards[0].linkedExperimentId).toBeUndefined()
      expect(cards[0].linkedExperimentUnavailable).toBe(true)
      const html = renderToStaticMarkup(
        <MemoryRouter><CoachIntelligencePanel state={{
          version: 'coach-intelligence-v1', asOf: '2026-10-17',
          state: 'act', headline: 'Review', summary: 'Check Lab', noChangeRecommended: false,
          nextBestActions: cards, followUps: [], question: null, questionBudgetDays: 3,
        }} pending={false} onResponse={() => undefined} onOutcome={() => undefined} /></MemoryRouter>,
      )
      expect(html).toContain('Linked Lab record status unavailable')
      expect(html).not.toContain('Explore experiment')
      expect(html).not.toContain('I started this')
    }
  })

  it('links to a verified valid result with explicit low-adherence uncertainty', async () => {
    const { projectCoachLinkedExperiment } = await import('../src/domain/coach-lab-lifecycle.js')
    const linkedExperiment = projectCoachLinkedExperiment({
      id: LAB, origin: 'owner_created', status: 'completed', window_start: '2026-10-01',
      window_end: '2026-10-12', result_id: '123e4567-e89b-42d3-a456-426614174002',
      classification: 'completed_low_adherence',
    }, '2026-10-17')!
    const card: CoachRecommendationView = {
      id: ID, fingerprint, kind: 'training_progression', domain: 'training',
      title: 'Bench', detail: 'Review', actionText: 'Review', detailPath: '/training',
      confidence: 'limited', evidenceRefs: [], responseState: null, responseAt: null,
      experimentEligible: true, linkedExperimentId: LAB, linkedExperiment,
    }
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachIntelligencePanel state={{
        version: 'coach-intelligence-v1', asOf: '2026-10-17',
        state: 'act', headline: 'Review', summary: 'Check Lab', noChangeRecommended: false,
        nextBestActions: [card], followUps: [], question: null, questionBudgetDays: 3,
      }} pending={false} onResponse={() => undefined} onOutcome={() => undefined} /></MemoryRouter>,
    )
    expect(html).toContain('Lab result recorded with low adherence')
    expect(html).toContain('/lab/experiment-results/123e4567-e89b-42d3-a456-426614174002')
    expect(html).not.toContain('I started this')
    expect(html).not.toContain('Explore experiment')
  })

  it('recognizes only a valid result classification and never assumes improvement from status', async () => {
    const { projectCoachLinkedExperiment } = await import('../src/domain/coach-lab-lifecycle.js')
    const input = {
      id: LAB, origin: 'owner_created', status: 'completed',
      window_start: null, window_end: null,
      result_id: '123e4567-e89b-42d3-a456-426614174002', classification: 'invalid',
    }
    expect(projectCoachLinkedExperiment(input, '2026-10-17')?.resultId).toBeNull()
  })

})
