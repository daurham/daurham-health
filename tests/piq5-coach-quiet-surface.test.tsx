import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { CoachIntelligencePanel } from '../src/features/coach/CoachCard.js'
import type { CoachIntelligenceState, CoachRecommendationView } from '../src/domain/coach-intelligence.js'

function card(id: string, title: string): CoachRecommendationView {
  return {
    id, fingerprint: 'coach:i9:' + id, kind: 'training_progression', domain: 'training',
    title, detail: 'Specific evidence for ' + title, actionText: 'Review Training',
    detailPath: '/training', confidence: 'limited', evidenceRefs: ['training:' + id],
    responseState: null, responseAt: null, experimentEligible: true,
  }
}
const cards = [
  card('one', 'Primary insight'), card('two', 'Secondary training item'),
  card('three', 'Third suggestion'),
]
function render(cardsToShow: CoachRecommendationView[]): string {
  const state: CoachIntelligenceState = {
    version: 'coach-intelligence-v1', asOf: '2026-10-17',
    state: cardsToShow.length ? 'act' : 'maintain',
    headline: cardsToShow.length ? 'One thing worth attention' : 'Stay the course',
    summary: 'No change recommended.', noChangeRecommended: cardsToShow.length === 0,
    nextBestActions: cardsToShow, followUps: [], question: null, questionBudgetDays: 3,
  }
  return renderToStaticMarkup(
    <MemoryRouter>
      <CoachIntelligencePanel state={state} pending={false} onResponse={() => undefined} onOutcome={() => undefined} />
    </MemoryRouter>,
  )
}

describe('PIQ-5.6 quiet Coach recommendations', () => {
  it('shows only the first full-size recommendation until the user expands more', () => {
    const html = render(cards)
    expect(html).toContain('Primary insight')
    expect(html).not.toContain('Secondary training item')
    expect(html).not.toContain('Third suggestion')
    expect((html.match(/<article\b/g) ?? [])).toHaveLength(1)
    expect(html).toContain('See 2 more recommendations')
    expect(html).toContain('aria-expanded="false"')
  })
  it('keeps a single card readable without an unnecessary more-actions control', () => {
    const html = render(cards.slice(0, 1))
    expect(html).toContain('Primary insight')
    expect(html).not.toContain('more recommendations')
    expect((html.match(/<article\b/g) ?? [])).toHaveLength(1)
  })
  it('preserves a legitimate no-change state without inventing a suggestion', () => {
    const html = render([])
    expect(html).toContain('No change recommended.')
    expect(html).not.toContain('more recommendations')
    expect(html).not.toContain('<article')
  })
  it('does not remove owner action and review controls from the primary recommendation', () => {
    const html = render(cards)
    expect(html).toContain('Review Training')
    expect(html).toContain('I started this')
    expect(html).toContain('Not now')
    expect(html).toContain('Not relevant')
    expect(html).toContain('Reviewing is not acceptance')
  })
})
