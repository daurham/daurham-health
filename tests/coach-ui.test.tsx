import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { CoachState, CoachTaskView } from '../src/domain/coach.ts'
import { CoachCard, CoachInbox } from '../src/features/coach/CoachCard.tsx'
import { formatStretchValue, pendingStretchAcknowledgement, selectPrimaryCoachItem, selectPrimaryCoachTask } from '../src/features/coach/presentation.ts'
import type { CoachLabItem } from '../src/domain/coach-lab.ts'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'
import { CoachDialog } from '../src/features/coach/CoachDialog.tsx'

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
  it('renders Daily first and keeps Weekly visible in one compact Coach surface', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <CoachCard state={state()} onState={() => undefined} />
      </MemoryRouter>,
    )
    expect(html).toContain('Missions that matter now')
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('Complete 3 training sessions this week')
    expect(html.indexOf('100 jumping jacks')).toBeLessThan(html.indexOf('Complete 3 training sessions this week'))
    expect(html).toContain('>Log<')
    expect(html).toContain('+25 XP')
    expect(html).toContain('+75 XP')
    expect(html).not.toContain('Log the reps when you finish.')
    expect(html).not.toContain('>Pass<')
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
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('Complete · Logged in Training')
    expect(html).toContain('+25 XP')
    expect(html).not.toContain('>Log<')
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
    completedAt: overrides.status === 'completed' ? '2026-09-29T20:00:00Z' : null,
    closedAt: ['completed', 'passed', 'failed', 'expired'].includes(overrides.status ?? '') ? '2026-09-29T20:00:00Z' : null,
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
  it('keeps Daily visible ahead of active or offered Stretch while preserving legacy attention selection', () => {
    for (const status of ['active', 'offered'] as const) {
      const coach = state({ stretchQuest: stretch({ status }), activeCount: 3 })
      const html = markup(coach)
      expect(selectPrimaryCoachTask(coach, null)?.taskKind).toBe('stretch_quest')
      expect(html).toContain('data-coach-mission="daily_quest"')
      expect(html).toContain('data-coach-mission="stretch_quest"')
      expect(html).toContain('data-coach-mission="weekly_focus"')
      expect(html.indexOf('100 jumping jacks')).toBeLessThan(html.indexOf('Bench Press · Stretch your best'))
      expect(html.indexOf('Bench Press · Stretch your best')).toBeLessThan(html.indexOf('Complete 3 training sessions this week'))
      expect(html).not.toContain('data-coach-primary')
    }
  })

  it('keeps offered Stretch concise on Today and preserves full details in disclosure', () => {
    const coach = state({ stretchQuest: stretch() })
    const html = markup(coach)
    expect(html).toContain('Bench Press · Stretch your best')
    expect(html).toContain('Target 122.5 lb e1RM')
    expect(html).toContain('Offer ends Oct 1')
    expect(html).toContain('+100 XP')
    expect(html).not.toContain('Baseline')
    expect(html).not.toContain('e1RM is estimated performance, not the literal load to put on the bar')
    expect(html).not.toContain('>Accept<')

    const details = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={coach} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(details).toContain('Baseline')
    expect(details).toContain('120 lb e1RM')
    expect(details).toContain('122.5 lb e1RM')
    expect(details).toContain('Offer expires')
    expect(details).toContain('7 days to attempt after acceptance')
    expect(details).toContain('e1RM is estimated performance, not the literal load to put on the bar')
    expect(details).toContain('Any valid high-confidence weight × rep combination can count')
    expect(details).toContain('>Accept<')
    expect(details).toContain('>Pass<')
  })

  it('keeps accepted Stretch progress compact and leaves actions in disclosure', () => {
    const coach = state({ stretchQuest: stretch({ status: 'active', expiresOn: '2026-10-05', progress: { current: 119, target: 122.5, unit: 'lb', label: null } }) })
    const html = markup(coach)
    expect(html).toContain('Target 122.5 lb e1RM')
    expect(html).toContain('Ends Oct 5')
    expect(html).not.toContain('Best attempt')
    expect(html).not.toContain('>Open Training<')

    const details = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={coach} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(details).toContain('Best attempt')
    expect(details).toContain('119 lb e1RM')
    expect(details).toContain('Verified by Training')
    expect(details).toContain('>Open Training<')
    expect(details).toContain('>End quest<')
  })

  it('keeps a below-target PR behind Stretch disclosure while retaining reward visibility', () => {
    const coach = state({ stretchQuest: stretch({ status: 'active', progress: { current: 121.8, target: 122.5, unit: 'lb', label: 'New PR' } }) })
    const html = markup(coach)
    expect(html).toContain('+100 XP')
    expect(html).not.toContain('New PR')
    const details = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={coach} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(details).toContain('New PR')
    expect(details).toContain('121.8 lb e1RM')
    expect(details).toContain('122.5 lb e1RM')
    expect(details).toContain('Quest not conquered yet.')
  })

  it('keeps completed Stretch compact on Today and preserves acknowledgement details', () => {
    const completed = stretch({ status: 'completed', evidenceLabel: 'Verified by Training', progress: { current: 123.2, target: 122.5, unit: 'lb', label: null } })
    const coach = state({ stretchQuest: completed })
    const html = markup(coach)
    expect(html).toContain('Complete · Verified by Training')
    expect(html).toContain('+100 XP')
    expect(html).not.toContain('Stretch conquered')
    const details = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={coach} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(details).toContain('Stretch conquered')
    expect(details).toContain('123.2 lb e1RM')
    expect(details).toContain('122.5 lb e1RM')
    expect(details).toContain('>Got it<')
    expect(selectPrimaryCoachTask(coach, null)?.id).toBe(coach.dailyQuest?.id)
    expect(selectPrimaryCoachTask({ ...coach, dailyQuest: null }, null)?.id).toBe(completed.id)
  })

  it.each([['passed', 'Passed'], ['failed', 'Challenge ended'], ['expired', 'Offer expired']] as const)('keeps %s Stretch neutral and compact beside Daily', (status, label) => {
    const coach = state({ stretchQuest: stretch({ status }), activeCount: 2 })
    const html = markup(coach)
    expect(selectPrimaryCoachTask(coach, null)?.taskKind).toBe('daily_quest')
    expect(html).toContain('data-coach-mission="daily_quest"')
    expect(html).toContain(label)
    expect(html).toContain('100 jumping jacks')
    expect(html).not.toContain('>Accept<')
    expect(html).not.toMatch(/lost|penalty|streak|failure/i)
  })

  it('orders inbox Today, Stretch, This week and preserves full actions', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter><CoachInbox state={state({ stretchQuest: stretch() })} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
    )
    expect(html.indexOf('aria-label="Today"')).toBeLessThan(html.indexOf('aria-label="Stretch"'))
    expect(html.indexOf('aria-label="Stretch"')).toBeLessThan(html.indexOf('aria-label="This week"'))
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('>Log it<')
    expect(html).toContain('>Accept<')
  })

  it('uses canonical reps and duration units and explains both completed sides', () => {
    for (const [strategy, unit, baseline, target] of [['reps', 'reps', 42, 45], ['duration', 'sec', 95, 100]] as const) {
      const quest = stretch({ targetUnit: unit, baselineValue: baseline, targetValue: target, metadata: { stretch: { strategy, perSide: true } } })
      const html = renderToStaticMarkup(
        <MemoryRouter><CoachInbox state={state({ stretchQuest: quest })} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>,
      )
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
    const html = markup(state({ stretchQuest: stretch() }))
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(html).toContain('truncate')
    expect(html).toContain('min-w-0')
    expect(card).toContain('data-coach-mission')
    expect(readFileSync('src/features/coach/CoachDialog.tsx', 'utf8')).toContain('max-h-[90dvh] w-full overflow-y-auto')
    expect(card).toContain('motion-notice-enter')
    expect(card).toContain('without a reward')
    expect(reduced).toContain('.motion-notice-enter')
    expect(reduced).toContain('animation: none')
    expect(card).not.toMatch(/animate-bounce|animate-ping|setInterval/)
  })
})
function lab(overrides: Partial<CoachLabItem> = {}): CoachLabItem {
  return { kind: 'benchmark_retest', sourceKey: 'benchmark:b1:p1', sourceFingerprint: 'a'.repeat(64), title: 'Retest Bench Press', detail: 'Your benchmark retest is due.', attentionReason: 'due', urgency: 'due', href: '/lab/benchmarks/b1', ...overrides }
}

function primaryIdentity(coach: CoachState, pendingAck: string | null = null) {
  const primary = selectPrimaryCoachItem(coach, pendingAck)
  return primary?.kind === 'task' ? primary.task.id : primary?.item.sourceKey ?? null
}

describe('Personal Lab Coach attention', () => {
  it('uses the complete current-action priority without letting completion acknowledgement block Lab', () => {
    const due = lab()
    const available = lab({ sourceKey: 'benchmark:b2:p1', urgency: 'available', attentionReason: 'lab' })
    const suggestion = lab({ kind: 'experiment_suggestion', sourceKey: 'suggestion:c1', urgency: 'normal', attentionReason: 'lab', href: '/lab/suggestions/c1' })
    const active = stretch({ status: 'active' })
    const offered = stretch()
    const completed = stretch({ status: 'completed' })
    expect(primaryIdentity(state({ stretchQuest: active, labItems: [due, available, suggestion] }))).toBe(active.id)
    expect(primaryIdentity(state({ stretchQuest: offered, labItems: [due, available, suggestion] }))).toBe(due.sourceKey)
    expect(primaryIdentity(state({ stretchQuest: offered, labItems: [available, suggestion] }))).toBe(offered.id)
    expect(primaryIdentity(state({ labItems: [available, suggestion] }))).toBe(state().dailyQuest?.id)
    expect(primaryIdentity(state({ dailyQuest: null, labItems: [available, suggestion] }))).toBe(available.sourceKey)
    expect(primaryIdentity(state({ dailyQuest: null, labItems: [suggestion] }))).toBe(suggestion.sourceKey)
    expect(primaryIdentity(state({ stretchQuest: completed, labItems: [due] }), completed.id)).toBe(due.sourceKey)
    expect(primaryIdentity(state({ stretchQuest: completed, dailyQuest: null, labItems: [] }), null)).toBeNull()
    expect(primaryIdentity(state({ stretchQuest: completed, dailyQuest: null, labItems: [] }), completed.id)).toBe(completed.id)
  })

  it('keeps Lab as a compact count so it cannot displace Daily, Stretch, or Weekly', () => {
    const coach = state({ labItems: [lab()], stretchQuest: stretch() })
    const html = markup(coach)
    expect(html).toContain('Lab · 1')
    expect(html).toContain('100 jumping jacks')
    expect(html).toContain('Bench Press · Stretch your best')
    expect(html).toContain('Complete 3 training sessions this week')
    expect(html).not.toContain('Retest Bench Press')
    expect(html).not.toContain('>Open benchmark<')
    const inbox = renderToStaticMarkup(<MemoryRouter><CoachInbox state={coach} onClose={() => undefined} actions={inboxActions} /></MemoryRouter>)
    expect(inbox).toContain('Retest Bench Press')
    expect(inbox).toContain('>Open benchmark<')
    for (const [earlier, later] of [['Today', 'Stretch'], ['Stretch', 'This week'], ['This week', 'Lab']]) {
      expect(inbox.indexOf(`aria-label="${earlier}"`)).toBeGreaterThan(-1)
      expect(inbox.indexOf(`aria-label="${earlier}"`)).toBeLessThan(inbox.indexOf(`aria-label="${later}"`))
    }
  })

  it('bounds Lab to three items, renders only populated sections, and preserves all prefixed routes', () => {
    const items = [lab(), lab({ sourceKey: 'b2', title: 'Retest two' }), lab({ kind: 'experiment_suggestion', sourceKey: 's1', urgency: 'normal', title: 'Review experiment one', href: '/lab/suggestions/s1' }), lab({ sourceKey: 'b4', title: 'Hidden fourth retest' })]
    const html = renderToStaticMarkup(<MemoryRouter><AppSurfaceProvider prefix="/demo" readOnly={false}><CoachInbox state={state({ dailyQuest: null, weeklyFocus: null, labItems: items, labOverflowCount: 2 })} onClose={() => undefined} actions={inboxActions} /></AppSurfaceProvider></MemoryRouter>)
    expect(html).toContain('aria-label="Lab"')
    expect(html).not.toContain('aria-label="Stretch"')
    expect(html).not.toContain('aria-label="Today"')
    expect(html).not.toContain('aria-label="This week"')
    expect(html).not.toContain('Hidden fourth retest')
    expect(html).toContain('Open Lab · 3 more')
    expect(html).toContain('href="/demo/lab"')
    expect(html).toContain('href="/demo/lab/benchmarks/b1"')
    expect(html).toContain('href="/demo/lab/suggestions/s1"')
    expect(html).toContain('>Review experiment<')
    expect(html).not.toContain('Accept experiment')
    expect(html).not.toContain('XP')
  })

  it('keeps Weekly-only compact and truly empty Coach quiet without prior-day acknowledgements', () => {
    const weekly = markup(state({ dailyQuest: null }))
    expect(weekly).toContain('This week')
    expect(weekly).toContain('data-coach-mission="weekly_focus"')
    expect(markup(state({ dailyQuest: null, weeklyFocus: null, activeCount: 0 }))).toBe('')
    const old = stretch({ status: 'completed', completedAt: '2026-09-28T20:00:00Z', closedAt: '2026-09-28T20:00:00Z' })
    const quiet = state({ dailyQuest: null, weeklyFocus: null, stretchQuest: old, activeCount: 0 })
    expect(pendingStretchAcknowledgement(quiet, null)).toBeNull()
    expect(markup(quiet)).toBe('')
    const phoenixPreviousDay = stretch({ status: 'completed', completedAt: '2026-09-29T01:00:00Z' })
    expect(pendingStretchAcknowledgement(state({ stretchQuest: phoenixPreviousDay }), null)).toBeNull()
  })

  it('uses accessible shared dialogs with Escape, focus restoration, containment, and route cleanup', () => {
    const html = renderToStaticMarkup(<CoachDialog title="Coach inbox" onClose={() => undefined}><button type="button">Review</button></CoachDialog>)
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toContain('aria-labelledby=')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('Close Coach inbox')
    const dialog = readFileSync('src/features/coach/CoachDialog.tsx', 'utf8')
    const card = readFileSync('src/features/coach/CoachCard.tsx', 'utf8')
    expect(dialog).toContain("event.key === 'Escape'")
    expect(dialog).toContain("event.key !== 'Tab'")
    expect(dialog).toContain("document.addEventListener('focusin'")
    expect(dialog).toContain('previous.isConnected')
    expect(dialog).toContain('previous.focus()')
    expect(dialog).toContain('quietButtonClass')
    expect(card).toContain('[location.key]')
    expect(card).toContain('onClick={actions.onNavigate}')
    expect(card).toContain('data-coach-initial-focus')
    expect(card).toContain('Keep going')
  })
})