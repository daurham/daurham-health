import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildBenchmarkRetestView, type BenchmarkRetestView, type RetestProtocolInput } from '../src/domain/lab-retests.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { RetestList, RetestSection } from '../src/features/lab/RetestSection.tsx'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'
import { deriveCoachLabItems } from '../src/domain/coach-lab.ts'
import { coachWeek } from '../src/domain/coach.ts'

const BENCHMARK = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VERSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function protocol(overrides: Partial<RetestProtocolInput> = {}): RetestProtocolInput {
  return {
    benchmarkDefinitionId: BENCHMARK,
    benchmarkTitle: 'Push-up 10-minute capacity',
    protocolVersionId: VERSION,
    protocolVersion: 2,
    minimumRetestDays: 30,
    suggestedRetestDays: 90,
    ...overrides,
  }
}

function sample(asOf: string, overrides: Partial<RetestProtocolInput> = {}, withResult = true): BenchmarkRetestView {
  return buildBenchmarkRetestView(
    protocol(overrides),
    withResult
      ? [
          {
            id: 'result-1',
            benchmarkDefinitionId: BENCHMARK,
            protocolVersionId: overrides.protocolVersionId ?? VERSION,
            status: 'valid',
            resultDate: '2026-09-01',
            createdAt: '2026-09-01T12:00:00.000Z',
            primaryValues: [{ requirementId: 'req-1', label: 'Total reps', value: 67, unit: 'reps' }],
          },
        ]
      : [],
    asOf,
  )
}

function section(view: BenchmarkRetestView, archived = false): string {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null, React.createElement(RetestSection, { view, archived, benchmarkId: BENCHMARK, domain: 'training' })),
  )
}

function today(retests: BenchmarkRetestView[], readOnly = false): string {
  const sources: TodaySources = {
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
    lab: { experiments: [], retests, coveredBenchmarkIds: [] },
  }
  const view = buildTodayView(sources)
  const week = coachWeek(view.date)
  const coach = { date: view.date, weekStart: week.start, weekEnd: week.end, weeklyFocus: null, dailyQuest: null,
    labItems: deriveCoachLabItems({ retests, suggestions: [] }), activeCount: 0 }
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      null,
      React.createElement(AppSurfaceProvider, {
        prefix: readOnly ? '/demo' : '',
        readOnly,
        children: React.createElement(TodayBoard, { view, coach: readOnly ? null : coach, onCoachState: readOnly ? undefined : () => undefined }),
      }),
    ),
  )
}

describe('retest copy', () => {
  it('describes each state without failure language', () => {
    const copies = [
      section(sample('2026-09-20', { minimumRetestDays: null, suggestedRetestDays: null }, false)),
      section(sample('2026-09-20', {}, false)),
      section(sample('2026-09-20')),
      section(sample('2026-10-16')),
      section(sample('2026-12-03')),
      section(sample('2026-12-03'), true),
    ].join('\n')
    expect(copies).toContain('No retest interval is configured for Protocol v2.')
    expect(copies).toContain('No valid result yet for Protocol v2.')
    expect(copies).toContain('establish a baseline')
    expect(copies).toContain('Not yet at the minimum interval.')
    expect(copies).toContain('You can repeat this protocol now.')
    expect(copies).toContain('Retest suggested')
    expect(copies).toContain('Protocol v2')
    expect(copies).toContain(`benchmarkProtocolVersionId=${VERSION}`)
    expect(copies).toContain('Automatic retest scheduling is off.')
    expect(copies.toLowerCase()).not.toContain('overdue')
    expect(copies.toLowerCase()).not.toContain('failed')
    expect(copies.toLowerCase()).not.toContain('missed')
    const list = renderToStaticMarkup(
      React.createElement(MemoryRouter, null, React.createElement(RetestList, { views: [sample('2026-12-03'), sample('2026-10-16', { benchmarkTitle: 'Plank duration', benchmarkDefinitionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' })] })),
    )
    expect(list).toContain('Retest suggested')
    expect(list).toContain('Available')
    expect(list).toContain('Protocol v2')
    expect(list).not.toContain('Not yet at the minimum interval.')
  })

  it('surfaces due/available retests once through Coach and hides owner attention in demo', () => {
    const due = today([sample('2026-12-03'), sample('2026-09-20'), sample('2026-09-20', {}, false)])
    expect(due).toContain('Personal Lab')
    expect(due).toContain('Retest suggested')
    expect(due).toContain('Push-up 10-minute capacity')
    expect(due).toContain('protocol v2')
    expect((due.match(/data-coach-primary=/g) ?? []).length).toBe(1)
    expect((due.match(/Retest suggested/g) ?? []).length).toBe(1)
    expect(due).toContain('Open benchmark')
    expect(due).not.toContain('Not yet at the minimum interval.')
    expect(due).not.toContain('establish a baseline')
    expect(due.toLowerCase()).not.toContain('overdue')
    expect(due).not.toContain('Needs attention')
    const available = today([sample('2026-10-16')])
    expect(available).toContain('Retest available')
    expect(available).toContain('Open benchmark')
    expect(today([sample('2026-09-20')])).not.toContain('Open benchmark')
    const demo = today([sample('2026-12-03')], true)
    expect(demo).not.toContain('Retest suggested')
    expect(demo).not.toContain('Open benchmark')
  })
})
