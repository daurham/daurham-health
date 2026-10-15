import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import type { Sql } from '../server/db.js'
import { writeCoachRecommendationResponse } from '../server/intelligence/coach-intelligence.js'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.tsx'
import type { CoachIntelligenceState, CoachRecommendationView } from '../src/domain/coach-intelligence.js'

const ID = '11111111-1111-4111-8111-111111111111'
function recommendation(overrides: Partial<CoachRecommendationView> = {}): CoachRecommendationView {
  return {
    id: ID, fingerprint: 'coach:i9:training', kind: 'training_progression', domain: 'training',
    title: 'Check strength progression', detail: 'Review the latest lifting records.',
    actionText: 'Review training', detailPath: '/training', confidence: 'moderate',
    evidenceRefs: ['training:bench'], responseState: null, experimentEligible: true,
    ...overrides,
  }
}
const state: CoachIntelligenceState = {
  version: 'coach-intelligence-v1', asOf: '2026-10-15', state: 'act',
  headline: 'One thing may help', summary: 'Review first.', noChangeRecommended: false,
  nextBestActions: [recommendation(), recommendation({
    id: '22222222-2222-4222-8222-222222222222', kind: 'improve_evidence',
    title: 'Improve source quality', actionText: 'Add context',
    detailPath: '/nutrition', experimentEligible: false,
  })],
  followUps: [], question: null, questionBudgetDays: 3,
}
describe('PIQ-1.5 viewing advice is not an intervention', () => {
  it('renders Review and Add context as navigation, with an independently labeled start acknowledgement', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachIntelligencePanel state={state} pending={false}
        onResponse={() => undefined} onOutcome={() => undefined} /></MemoryRouter>,
    )
    expect(html).toMatch(/href="\/training"[^>]*>Review training<\/a>/)
    expect(html).toMatch(/href="\/nutrition"[^>]*>Add context<\/a>/)
    expect(html).toContain('I started this</button>')
    expect((html.match(/I started this<\/button>/g) ?? [])).toHaveLength(1)
    expect(html).toContain('Reviewing is not acceptance')
    expect(html).toContain('Explore experiment</a>')
    expect(html).not.toContain('>Experiment</button>')
    expect(html).not.toContain('>Add context</button>')
  })

  it('keeps a review and experiment preview independent from the only explicit started-response callback', () => {
    const src = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    const panel = src.slice(src.indexOf('export function CoachIntelligencePanel'), src.indexOf('function MissionRow'))
    expect(panel).toMatch(/<Link to=\{prefixedPath\(prefix, item\.detailPath\)\}/)
    expect(panel).toMatch(/onResponse\(item, 'do_this'\)[\s\S]{0,100}I started this/)
    expect(panel).toMatch(/<Link to=\{prefixedPath\(prefix, labExperimentHandoffPath\(/)
    expect(panel).not.toMatch(/onResponse\(item, 'turn_into_experiment'\)/)
  })

  it('rejects an old client trying to turn evidence-review navigation into a started intervention', async () => {
    const query = vi.fn().mockResolvedValueOnce([{ recommendation_kind: 'improve_evidence' }])
    const sql = { query } as unknown as Sql
    const assertCurrent = vi.fn()
    await expect(writeCoachRecommendationResponse(
      sql, ID, 'do_this', '2026-10-15', assertCurrent,
    )).rejects.toMatchObject({ statusCode: 409 })
    expect(assertCurrent).not.toHaveBeenCalled()
    expect(query).toHaveBeenCalledTimes(1)
  })

  it('only a deliberate start acknowledgement schedules the seven-day follow-up', async () => {
    for (const response of ['not_now', 'do_this'] as const) {
      const query = vi.fn().mockResolvedValueOnce([{ recommendation_kind: 'training_progression' }])
        .mockResolvedValueOnce([])
      const assertCurrent = vi.fn().mockResolvedValue(undefined)
      await writeCoachRecommendationResponse(
        { query } as unknown as Sql, ID, response, '2026-10-15', assertCurrent,
      )
      expect(assertCurrent).toHaveBeenCalledTimes(1)
      expect(query).toHaveBeenCalledTimes(2)
      const [, params] = query.mock.calls[1]
      expect(params[3]).toBe(response === 'do_this' ? '2026-10-22' : null)
    }
  })
})
