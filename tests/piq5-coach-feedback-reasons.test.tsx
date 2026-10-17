import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { surfaceDraft, writeCoachRecommendationResponse } from '../server/intelligence/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import type { CoachIntelligenceState, CoachRecommendationDraft, CoachRecommendationView } from '../src/domain/coach-intelligence.js'

const ID = '11111111-1111-4111-8111-111111111111'
const recommendation: CoachRecommendationView = {
  id: ID, fingerprint: 'coach:i9:training:bench',
  kind: 'training_progression', domain: 'training',
  title: 'Review bench trend', detail: 'Compare actual sets.',
  actionText: 'Review Training', detailPath: '/training',
  confidence: 'moderate', evidenceRefs: ['training:bench'],
  responseState: null, responseAt: null, experimentEligible: true,
}
const state: CoachIntelligenceState = {
  version: 'coach-intelligence-v1', asOf: '2026-10-17', state: 'act',
  headline: 'A useful review', summary: 'Compare before starting',
  noChangeRecommended: false, nextBestActions: [recommendation],
  followUps: [], question: null, questionBudgetDays: 3,
}

describe('PIQ-5.5 optional owner feedback', () => {
  it('keeps low-value feedback collapsed instead of cluttering the one-card Coach', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} /></MemoryRouter>,
    )
    expect(html).toContain('>Other feedback</summary>')
    for (const text of ['Already knew', 'Wrong context', 'Not practical', 'Not relevant']) {
      expect(html).toContain('>' + text + '</button>')
    }
    expect(html).toContain('This does not change your health records or safety rules.')
    expect((html.match(/<article\\b/g) ?? [])).toHaveLength(1)
  })

  it('rejects unexpected reason values or reasons on a start, before any SQL read or write', async () => {
    for (const [response, reason] of [
      ['not_relevant', 'unsafe_to_skip'], ['do_this', 'wrong_context'], ['not_now', 'not_practical'],
    ] as const) {
      const query = vi.fn()
      await expect(writeCoachRecommendationResponse(
        { query } as unknown as Sql, ID, response, '2026-10-17',
        async () => undefined, response === 'do_this', null, reason as 'wrong_context',
      )).rejects.toMatchObject({ statusCode: 400 })
      expect(query).not.toHaveBeenCalled()
    }
  })

  it('records an allowlisted reason on the existing non-relevant response without follow-up', async () => {
    for (const reason of ['not_relevant', 'already_knew', 'wrong_context', 'not_practical'] as const) {
      const query = vi.fn().mockResolvedValueOnce([{ recommendation_kind: 'training_progression' }])
        .mockResolvedValueOnce([{ id: ID }])
      await writeCoachRecommendationResponse(
        { query } as unknown as Sql, ID, 'not_relevant', '2026-10-17',
        async () => undefined, false, null, reason,
      )
      const [statement, params] = query.mock.calls[1] as [string, unknown[]]
      expect(statement).toContain("jsonb_build_object('feedbackReason', $6::text)")
      expect(statement).toContain("COALESCE(metadata, '{}'::jsonb) - 'ownerStarted' - 'feedbackReason'")
      expect(statement).toContain('response_at::text IS NOT DISTINCT FROM $5::text')
      expect(params[3]).toBeNull() // never creates a follow-up
      expect(params[5]).toBe(reason)
    }
  })

  it('defaults legacy not-relevant clients to a generic reason and clears reason on other actions', async () => {
    for (const [response, expected] of [
      ['not_relevant', 'not_relevant'], ['not_now', null], ['do_this', null],
    ] as const) {
      const query = vi.fn().mockResolvedValueOnce([{ recommendation_kind: 'training_progression' }])
        .mockResolvedValueOnce([{ id: ID }])
      await writeCoachRecommendationResponse(
        { query } as unknown as Sql, ID, response, '2026-10-17',
        async () => undefined, response === 'do_this', null,
      )
      expect(query.mock.calls[1][1][5]).toBe(expected)
    }
  })

  it('keeps a persisted reason through server recommendation refresh/upsert', async () => {
    const query = vi.fn().mockResolvedValue([{ id: ID }])
    const draft: CoachRecommendationDraft = {
      fingerprint: recommendation.fingerprint, sourceId: 'training:bench',
      kind: recommendation.kind, domain: recommendation.domain,
      title: recommendation.title, detail: recommendation.detail,
      actionText: recommendation.actionText, detailPath: recommendation.detailPath,
      confidence: recommendation.confidence, evidenceRefs: recommendation.evidenceRefs,
      priority: 5, experimentEligible: true,
    }
    await surfaceDraft({ query } as unknown as Sql, draft, '2026-10-17', null)
    const [statement] = query.mock.calls[0] as [string, unknown[]]
    expect(statement).toContain("coach_recommendations.response_state = 'not_relevant'")
    expect(statement).toContain("jsonb_build_object('feedbackReason', coach_recommendations.metadata ->> 'feedbackReason')")
  })

  it('propagates reasons only for explicit dismissals and rejects malformed API reason bodies', () => {
    const api = readFileSync('src/features/coach/api.ts', 'utf8')
    const handler = readFileSync('server/handlers/coach-intelligence.ts', 'utf8')
    const panel = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    expect(api).toContain("response === 'not_relevant' && feedbackReason")
    expect(handler).toContain("response !== 'not_relevant'")
    expect(handler).toContain("COACH_RECOMMENDATION_FEEDBACK_REASONS")
    expect(panel).toContain("onResponse(item, 'not_relevant', 'wrong_context')")
  })
})
