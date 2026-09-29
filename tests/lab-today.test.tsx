import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodayLabExperiment, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'

function sources(experiments: TodayLabExperiment[] = []): TodaySources {
  return {
    now: new Date('2026-09-26T18:00:00.000Z'),
    activityDays: [],
    sleepNights: [],
    latestCompleteSleep: null,
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    pendingJobs: [],
    bodyWeights: [],
    lab: { experiments },
  }
}

function board(experiments: TodayLabExperiment[] = [], readOnly = false): string {
  const view = buildTodayView(sources(experiments))
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AppSurfaceProvider, {
        prefix: readOnly ? '/demo' : '',
        readOnly,
        children: React.createElement(TodayBoard, { view }),
      }),
    ),
  )
}

const experiment = (status: 'scheduled' | 'active', title: string): TodayLabExperiment => ({
  id: status === 'active' ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222',
  title,
  status,
  windowStart: '2026-09-28',
  windowEnd: '2026-10-05',
})

describe('today personal lab', () => {
  it('keeps retest data without rendering duplicate standalone attention', () => {
    const view = buildTodayView(sources([experiment('active', 'Existing experiment')]))
    view.lab.retest = {
      benchmarkDefinitionId: 'benchmark', benchmarkTitle: 'Duplicate retest', protocolVersionId: 'version', protocolVersion: 1,
      status: 'due', latestResult: { id: 'result', resultDate: '2026-09-01', primaryValues: [] },
      minimumRetestDays: 7, suggestedRetestDays: 14, minimumDate: '2026-09-08', suggestedDate: '2026-09-15',
      daysSinceResult: 25, daysUntilMinimum: -18, daysUntilSuggested: -11,
    }
    const html = renderToStaticMarkup(<MemoryRouter><TodayBoard view={view} /></MemoryRouter>)
    expect(view.lab.retest.status).toBe('due')
    expect(html).not.toContain('Duplicate retest')
    expect(html).not.toContain('Retest suggested')
    expect(html).toContain('Existing experiment')
    expect(html).toContain('href="/lab"')
  })

  it('shows scheduled and active experiments without a due reminder', () => {
    expect(buildTodayView(sources()).lab.experiments).toEqual([])
    expect(board()).not.toContain('Open Lab')
    expect(board()).not.toContain("haven't completed")
    const active = board([experiment('active', 'Push-up capacity retest')])
    expect(active).toContain('Push-up capacity retest')
    expect(active).toContain('Open Lab')
    expect(active).toContain('href="/lab"')
    expect(active).not.toContain("haven't completed")
    expect(active).not.toContain('complete your experiment')
    const scheduled = board([experiment('scheduled', 'Future window')])
    expect(scheduled).toContain('Future window')
    expect(scheduled).toContain('Scheduled')
    const demo = board([experiment('active', 'Hidden in demo')], true)
    expect(demo).not.toContain('Open Lab')
    expect(demo).not.toContain('/lab')
    const ready = board([{ ...experiment('active', 'Push-up capacity test'), windowEnd: '2026-09-25', reviewReady: true }])
    expect(ready).toContain('Ready to review')
    expect(ready).toContain('Experiment ready to review')
    expect(ready).toContain('Review result')
    expect(ready).not.toContain('failed to finish')
    const endsToday = board([{ ...experiment('active', 'Push-up capacity test'), windowStart: '2026-09-01', windowEnd: '2026-09-26' }])
    expect(endsToday).toContain('Ends today')
    expect(endsToday).not.toContain('Ready to review')
    expect(endsToday).not.toContain('Experiment ready to review')
  })
})
