import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CoachState, CoachTaskView } from '../src/domain/coach.ts'
import { CoachCard } from '../src/features/coach/CoachCard.tsx'

function task(overrides: Partial<CoachTaskView> = {}): CoachTaskView {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    taskKind: 'daily_quest',
    ruleKey: 'manual:jumping-jacks:100',
    ruleVersion: 1,
    domain: 'training',
    title: '100 jumping jacks',
    detail: 'Log the reps when you finish.',
    startsOn: '2026-09-29',
    expiresOn: '2026-09-29',
    goalId: null,
    verificationMode: 'training_log',
    actionKind: 'log_training',
    actionHref: null,
    targetValue: 100,
    targetUnit: 'reps',
    baselineValue: null,
    difficulty: 'standard',
    rewardBand: 'standard',
    status: 'active',
    completedAt: null,
    closedAt: null,
    metadata: {
      training: {
        exerciseName: 'Jumping Jacks',
        measurementKind: 'reps',
        allowDistance: false,
      },
    },
    progress: { current: 0, target: 100, unit: 'reps', label: '0 reps' },
    evidenceLabel: null,
    ...overrides,
  }
}

function state(overrides: Partial<CoachState> = {}): CoachState {
  return {
    date: '2026-09-29',
    weekStart: '2026-09-28',
    weekEnd: '2026-10-04',
    dailyQuest: task(),
    weeklyFocus: task({
      id: '22222222-2222-4222-8222-222222222222',
      taskKind: 'weekly_focus',
      ruleKey: 'goal:training-frequency:g1',
      title: 'Complete 3 training sessions this week',
      detail: 'Programmed, ad-hoc, and experiment sessions all count.',
      targetValue: 3,
      targetUnit: 'sessions',
      verificationMode: 'canonical',
      actionKind: 'open',
      actionHref: '/training',
      difficulty: 'weekly',
      rewardBand: 'weekly',
      progress: { current: 1, target: 3, unit: 'sessions', label: '1/3' },
    }),
    activeCount: 2,
    ...overrides,
  }
}

describe('Today Coach UI', () => {
  it('renders Weekly Focus and one primary Daily Quest in one Coach surface', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachCard state={state()} onState={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Focus this week')
    expect(html).toContain('Complete 3 training sessions this week')
    expect(html).toContain(&quot;Today&#x27;s quest&quot;)
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('Logs to Training')
    expect(html).toContain('Log it')
    expect(html).toContain('Pass')
    expect(html).toContain('Coach · 2')
  })

  it('collapses a completed quest to a compact resolved line with evidence provenance', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachCard
          state={state({
            weeklyFocus: null,
            activeCount: 0,
            dailyQuest: task({
              status: 'completed',
              completedAt: '2026-09-29T18:00:00.000Z',
              closedAt: '2026-09-29T18:00:00.000Z',
              evidenceLabel: 'Logged in Training',
              progress: null,
            }),
          })}
          onState={() => undefined}
        />
      </MemoryRouter>,
    )
    expect(html).toContain('Quest complete')
    expect(html).toContain('Logged in Training')
    expect(html).not.toContain('>Log it<')
  })

  it('keeps the Today integration to one CoachCard and reuses reduced-motion vocabulary', () => {
    const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    const card = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    expect((today.match(/<CoachCard/g) ?? []).length).toBe(1)
    expect(card).toContain('motion-notice')
    expect(card).not.toContain('animate-bounce')
    expect(card).not.toContain('animate-ping')
  })
})
