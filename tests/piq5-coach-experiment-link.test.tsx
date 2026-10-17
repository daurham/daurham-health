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
    expect(source).toContain("status NOT IN ('abandoned', 'superseded')")
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
})
