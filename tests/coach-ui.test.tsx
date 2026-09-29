import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CoachState, CoachTaskView } from '../src/domain/coach.ts'
import { CoachCard, CoachInbox } from '../src/features/coach/CoachCard.tsx'
import { formatStretchValue, selectPrimaryCoachTask } from '../src/features/coach/presentation.ts'

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
    expect(html).toContain("Today&#x27;s quest")
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

function stretch(overrides: Partial<CoachTaskView> = {}): CoachTaskView {
  return task({
    id: '33333333-3333-4333-8333-333333333333',
    taskKind: 'stretch_quest',
    ruleKey: 'stretch:strength_e1rm:bench',
    title: 'Bench Press · Stretch your best',
    detail: 'Reach a new estimated strength threshold in Training.',
    expiresOn: '2026-10-01',
    verificationMode: 'canonical',
    actionKind: 'open',
    actionHref: '/training',
    baselineValue: 120,
    targetValue: 122.5,
    targetUnit: 'lb',
    difficulty: 'stretch',
    rewardBand: 'stretch',
    status: 'offered',
    metadata: { stretch: { strategy: 'strength_e1rm' } },
    progress: { current: null, target: 122.5, unit: 'lb', label: null },
    ...overrides,
  })
}

function markup(coach: CoachState) {
  return renderToStaticMarkup(<MemoryRouter><CoachCard state={coach} onState={() => undefined} /></MemoryRouter>)
}

const inboxActions = {
  pending: false,
  onPass: () => undefined,
  onAccept: () => undefined,
  onEnd: () => undefined,
  onLog: () => undefined,
  onAcknowledge: () => undefined,
}

describe('Stretch Quest Today integration', () => {
  it('prioritizes an active or offered Stretch over Daily while keeping Weekly compact', () => {
    for (const status of ['active', 'offered'] as const) {
      const coach = state({ stretchQuest: stretch({ status }), activeCount: 3 })
      const html = markup(coach)
      expect(selectPrimaryCoachTask(coach, null)?.taskKind).toBe('stretch_quest')
      expect(html).toContain('data-coach-primary="stretch_quest"')
      expect((html.match(/data-coach-primary=/g) ?? []).length).toBe(1)
      expect(html.indexOf('Focus this week')).toBeLessThan(html.indexOf('Stretch Quest'))
      expect(html).not.toContain('100 jumping jacks')
      expect(html).toContain('Coach · 3')
    }
  })

  it('explains offered strength baseline, target, timing, estimation, and explicit acceptance', () => {
    const html = markup(state({ stretchQuest: stretch() }))
    expect(html).toContain('Baseline')
    expect(html).toContain('120 lb e1RM')
    expect(html).toContain('122.5 lb e1RM')
    expect(html).toContain('Offer expires')
    expect(html).toContain('Oct 1')
    expect(html).toContain('7 days to attempt after acceptance')
    expect(html).toContain('e1RM is estimated performance, not the literal load to put on the bar')
    expect(html).toContain('Any valid high-confidence weight × rep combination can count')
    expect(html).toContain('>Accept<')
    expect(html).toContain('>Pass<')
    expect(html).not.toContain('>Log it<')
  })

  it('shows accepted best attempt, expiry, evidence authority, and Training/end actions', () => {
    const html = markup(state({ stretchQuest: stretch({ status: 'active', expiresOn: '2026-10-05', progress: { current: 119, target: 122.5, unit: 'lb', label: null } }) }))
    expect(html).toContain('Best attempt')
    expect(html).toContain('119 lb e1RM')
    expect(html).toContain('Challenge ends')
    expect(html).toContain('Oct 5')
    expect(html).toContain('Verified by Training')
    expect(html).toContain('>Open Training<')
    expect(html).toContain('>End quest<')
    expect(html).not.toContain('>Accept<')
    expect(html).not.toContain('>Pass<')
  })

  it('shows a new PR below the target without a completion or reward', () => {
    const html = markup(state({ stretchQuest: stretch({ status: 'active', progress: { current: 121.8, target: 122.5, unit: 'lb', label: 'New PR' } }) }))
    expect(html).toContain('New PR')
    expect(html).toContain('121.8 lb e1RM')
    expect(html).toContain('122.5 lb e1RM')
    expect(html).toContain('Quest not conquered yet.')
    expect(html).not.toContain('Stretch conquered')
    expect(html).not.toContain('XP')
  })

  it('acknowledges completion with achieved value and target, then returns priority to Daily', () => {
    const completed = stretch({ status: 'completed', evidenceLabel: 'Verified by Training', progress: { current: 123.2, target: 122.5, unit: 'lb', label: null } })
    const coach = state({ stretchQuest: completed })
    const html = markup(coach)
    expect(html).toContain('Stretch conquered')
    expect(html).toContain('Achieved')
    expect(html).toContain('123.2 lb e1RM')
    expect(html).toContain('122.5 lb e1RM')
    expect(html).toContain('Verified by Training')
    expect(html).toContain('>Got it<')
    expect(selectPrimaryCoachTask(coach, null)?.id).toBe(completed.id)
    expect(selectPrimaryCoachTask(coach, completed.id)?.id).toBe(coach.dailyQuest?.id)
  })

  it.each([['passed', 'Passed'], ['failed', 'Challenge ended'], ['expired', 'Offer expired']] as const)('keeps %s Stretch neutral and compact beside Daily', (status, label) => {
    const coach = state({ stretchQuest: stretch({ status }), activeCount: 2 })
    const html = markup(coach)
    expect(selectPrimaryCoachTask(coach, null)?.taskKind).toBe('daily_quest')
    expect(html).toContain('data-coach-primary="daily_quest"')
    expect(html).toContain(label)
    expect(html).toContain('100 jumping jacks')
    expect(html).not.toContain('>Accept<')
    expect(html).not.toMatch(/lost|penalty|streak|failure/i)
  })

  it('orders inbox Stretch, Today, This week and preserves hidden Daily actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={state({ stretchQuest: stretch() })} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(html.indexOf('aria-label="Stretch Quest"')).toBeLessThan(html.indexOf('aria-label="Today"'))
    expect(html.indexOf('aria-label="Today"')).toBeLessThan(html.indexOf('aria-label="This week"'))
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('>Log it<')
    expect(html).toContain('>Accept<')
  })

  it('uses canonical reps and duration units and explains both completed sides', () => {
    for (const [strategy, unit, baseline, target] of [['reps', 'reps', 42, 45], ['duration', 'sec', 95, 100]] as const) {
      const quest = stretch({ targetUnit: unit, baselineValue: baseline, targetValue: target, metadata: { stretch: { strategy, perSide: true } } })
      const html = markup(state({ stretchQuest: quest }))
      expect(html).toContain(`${baseline} ${unit}`)
      expect(html).toContain(`${target} ${unit}`)
      expect(html).toContain('Both sides must be completed; the lower side counts.')
      expect(html).toContain('qualifying working set saved in Training')
      expect(html).not.toContain('e1RM')
    }
    expect(formatStretchValue(stretch(), null)).toBe('No qualifying attempt yet')
  })

  it('fits a narrow Coach surface and uses the shared reduced-motion accomplishment contract', () => {
    const card = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    const css = readFileSync('src/index.css', 'utf8')
    const html = markup(state({ stretchQuest: stretch({ status: 'completed' }) }))
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(html).toContain('grid-cols-2')
    expect(html).toContain('min-w-0')
    expect(card).toContain('flex flex-wrap gap-3')
    expect(card).toContain('max-h-[80vh] w-full overflow-y-auto')
    expect(card).toContain('motion-notice-enter')
    expect(card).toContain('without a reward')
    expect(reduced).toContain('.motion-notice-enter')
    expect(reduced).toContain('animation: none')
    expect(card).not.toMatch(/animate-bounce|animate-ping|requestAnimationFrame|setInterval/)
  })
})