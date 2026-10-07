import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DAILY_CONTEXT_TAG_CATALOG, type DailyContext } from '../src/domain/context.ts'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { ContextEditor } from '../src/features/context/ContextPage.tsx'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'

function sources(context?: DailyContext | null): TodaySources {
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
    context,
  }
}

function board(context?: DailyContext | null, readOnly = false): string {
  const view = buildTodayView(sources(context))
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

describe('today context', () => {
  it('keeps a missing context out of needs attention and shows a quiet add action', () => {
    const view = buildTodayView(sources(null))
    expect(view.context).toEqual({ recorded: false, id: null, tags: [], note: null })
    expect(view.pendingItems).toEqual([])
    const html = board(null)
    expect(html).toContain('Daily check-in')
    expect(html).toContain('Add context')
    expect(html).toContain('/context?date=2026-09-26&amp;from=check-in')
    expect(html).not.toContain('Needs attention')
    expect(html).not.toContain('Context missing')
    expect(html).not.toContain('Complete your context')
    expect(board(null, true)).not.toContain('Add context')
    expect(board(null, true)).not.toContain('Daily check-in')
    const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    const service = readFileSync('server/today/service.ts', 'utf8')
    expect(today).not.toContain('/api/context')
    expect(service).toContain('getDailyContext')
  })

  it('shows tags, a note, or both, and ignores a record that is not today', () => {
    const tagsOnly = board({
      id: 'ctx-tags',
      contextDate: '2026-09-26',
      tags: ['baby_night_interruption', 'poor_sleep_opportunity'],
      note: null,
      createdAt: '2026-09-26T15:00:00.000Z',
      updatedAt: '2026-09-26T15:00:00.000Z',
    })
    expect(tagsOnly).toContain('Baby / night interruption')
    expect(tagsOnly).toContain('Poor sleep opportunity')
    expect(tagsOnly).toContain('Edit context')
    expect(tagsOnly).not.toContain('Needs attention')
    const noteOnly = board({
      id: 'ctx-note',
      contextDate: '2026-09-26',
      tags: [],
      note: 'Baby woke several times.',
      createdAt: '2026-09-26T15:00:00.000Z',
      updatedAt: '2026-09-26T15:00:00.000Z',
    })
    expect(noteOnly).toContain('Baby woke several times.')
    const both = buildTodayView(
      sources({
        id: 'ctx-both',
        contextDate: '2026-09-26',
        tags: ['travel'],
        note: 'Late drive',
        createdAt: '2026-09-26T15:00:00.000Z',
        updatedAt: '2026-09-26T15:00:00.000Z',
      }),
    )
    expect(both.context).toEqual({ recorded: true, id: 'ctx-both', tags: ['travel'], note: 'Late drive' })
    const historical = buildTodayView(sources(null))
    expect(historical.context.recorded).toBe(false)
  })

  it('renders the editor with the catalog, a disabled empty save, and a future-date rejection', () => {
    const empty = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ContextEditor, {
          date: '2026-09-26',
          today: '2026-09-26',
          dateError: null,
          loading: false,
          saving: false,
          error: null,
          recorded: false,
          tags: [],
          note: '',
          canSave: false,
          backTo: '/',
          onDate: () => undefined,
          onToggle: () => undefined,
          onNote: () => undefined,
          onSave: () => undefined,
          onDelete: () => undefined,
        }),
      ),
    )
    for (const item of DAILY_CONTEXT_TAG_CATALOG) {
      expect(empty).toContain(item.label)
    }
    expect(empty).toContain('Save context')
    expect(empty).toContain('disabled')
    expect(empty).not.toContain('Clear context')
    const recorded = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ContextEditor, {
        date: '2026-01-15',
        today: '2026-09-26',
        dateError: null,
        loading: false,
        saving: false,
        error: null,
        recorded: true,
        tags: ['travel'],
        note: 'x'.repeat(400),
        canSave: true,
        backTo: '/progress/timeline',
        onDate: () => undefined,
        onToggle: () => undefined,
        onNote: () => undefined,
        onSave: () => undefined,
        onDelete: () => undefined,
        }),
      ),
    )
    expect(recorded).toContain('Clear context')
    expect(recorded).toContain('400/500')
    const future = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(ContextEditor, {
        date: '2026-09-27',
        today: '2026-09-26',
        dateError: 'Daily context records what already happened. Future dates are not available.',
        loading: false,
        saving: false,
        error: null,
        recorded: false,
        tags: [],
        note: '',
        canSave: false,
        backTo: '/',
        onDate: () => undefined,
        onToggle: () => undefined,
        onNote: () => undefined,
        onSave: () => undefined,
        onDelete: () => undefined,
        }),
      ),
    )
    expect(future).toContain('Future dates are not available')
    expect(future).not.toContain('Save context')
  })
})
