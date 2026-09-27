import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import {
  buildProgressTimeline,
  timelineEventsForFocus,
  timelineSeriesForFocus,
  type ProgressTimeline,
} from '../src/domain/progress/timeline.ts'
import type { DailyContext } from '../src/domain/context.ts'
import { TimelineSection } from '../src/features/progress/TimelineSection.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'

function context(partial: Partial<DailyContext> & Pick<DailyContext, 'id' | 'contextDate' | 'tags'>): DailyContext {
  return {
    note: null,
    createdAt: '2026-09-26T03:00:00.000Z',
    updatedAt: '2026-09-26T04:00:00.000Z',
    ...partial,
  }
}

function timeline(contexts: DailyContext[], range: '30d' | 'all' = '30d'): ProgressTimeline {
  return buildProgressTimeline({
    asOf: '2026-09-26',
    range,
    exercises: [],
    workouts: [
      {
        sessionId: 'w1',
        sessionDate: '2026-09-26',
        createdAt: '2026-09-26T23:00:00.000Z',
        templateName: 'Push',
      },
    ],
    sets: [],
    bodyObservations: [],
    activityWorkouts: [
      {
        id: 'walk-1',
        activityType: 'HKWorkoutActivityTypeWalking',
        startAt: '2026-09-26T18:00:00.000Z',
        endAt: '2026-09-26T18:40:00.000Z',
        durationMinutes: 40,
        energyKcal: 180,
      },
    ],
    dailyContexts: contexts,
  })
}

describe('daily context timeline', () => {
  const recorded = context({
    id: 'ctx-1',
    contextDate: '2026-09-26',
    tags: ['pain', 'late_meal', 'travel'],
    note: 'Drove home late and ate around 10pm.',
  })

  it('places context on its date, in catalog order, with date precision', () => {
    const built = timeline([
      recorded,
      context({ id: 'old', contextDate: '2026-01-15', tags: ['sick'], note: 'Historical' }),
    ])
    const event = built.events.find((item) => item.kind === 'daily_context' && item.date === '2026-09-26')
    expect(event?.kind).toBe('daily_context')
    if (event?.kind !== 'daily_context') {
      return
    }
    expect(event.timePrecision).toBe('date')
    expect(event.occurredAt).toBeUndefined()
    expect(event.title).toBe('Daily context')
    expect(event.evidence).toEqual([])
    expect(event.data).toEqual({
      contextId: 'ctx-1',
      tags: ['travel', 'late_meal', 'pain'],
      note: 'Drove home late and ate around 10pm.',
    })
    expect(JSON.stringify(event)).not.toContain('2026-09-26T03:00:00.000Z')
    expect(built.events.filter((item) => item.date === '2026-09-26')[0]?.kind).toBe('daily_context')
    expect(built.events.some((item) => item.kind === 'daily_context' && item.date === '2026-01-15')).toBe(false)
    const allTime = timeline([context({ id: 'old', contextDate: '2026-01-15', tags: ['sick'] })], 'all')
    expect(allTime.events.some((item) => item.kind === 'daily_context' && item.date === '2026-01-15')).toBe(true)
  })

  it('keeps context out of analytics and inside the context focus', () => {
    const without = timeline([])
    const withContext = timeline([recorded])
    expect(withContext.series.bodyWeight).toEqual(without.series.bodyWeight)
    expect(withContext.series.workouts).toEqual(without.series.workouts)
    expect(withContext.series.nutritionCalories).toEqual(without.series.nutritionCalories)
    expect(timelineEventsForFocus(withContext, 'all').some((item) => item.kind === 'daily_context')).toBe(true)
    expect(timelineEventsForFocus(withContext, 'context').every((item) => item.kind === 'daily_context')).toBe(true)
    expect(timelineEventsForFocus(withContext, 'training').some((item) => item.kind === 'daily_context')).toBe(false)
    expect(timelineEventsForFocus(withContext, 'sleep').some((item) => item.kind === 'daily_context')).toBe(false)
    expect(timelineSeriesForFocus(withContext, 'context').workouts).toEqual([])
    expect(timelineSeriesForFocus(withContext, 'context').bodyWeight).toEqual([])
  })

  it('links an edit to the context date and hides it on the demo surface', () => {
    const built = timeline([recorded])
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/progress/timeline'] },
        React.createElement(TimelineSection, { timeline: built, range: '30d', onEvidence: () => undefined }),
      ),
    )
    expect(html).toContain('Drove home late and ate around 10pm.')
    expect(html).toContain('Travel · Late meal · Pain')
    expect(html).toContain('/context?date=2026-09-26')
    const demo = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/demo/progress/timeline'] },
        React.createElement(AppSurfaceProvider, {
          prefix: '/demo',
          readOnly: true,
          children: React.createElement(TimelineSection, { timeline: built, range: '30d', onEvidence: () => undefined }),
        }),
      ),
    )
    expect(demo).toContain('Drove home late and ate around 10pm.')
    expect(demo).not.toContain('/context?date=')
  })
})
