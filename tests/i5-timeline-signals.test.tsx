import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildProgressTimeline, timelineEventsForFocus } from '../src/domain/progress/timeline.ts'
import { TimelineSection } from '../src/features/progress/TimelineSection.tsx'

describe('I5 Daily Signals Timeline integration', () => {
  it('adds one day-level check-in event while preserving explicit no-BM semantics', () => {
    const timeline = buildProgressTimeline({
      asOf: '2026-10-06',
      range: '30d',
      exercises: [],
      workouts: [],
      sets: [],
      bodyObservations: [],
      dailySignals: [{
        date: '2026-10-06',
        waterMl: 1419.53,
        bowelCount: 0,
        explicitNoBowelMovement: true,
        energy: 4,
        hunger: null,
        soreness: 2,
        stress: null,
      }],
    })
    const event = timeline.events.find((item) => item.kind === 'daily_signals')
    expect(event?.kind).toBe('daily_signals')
    if (event?.kind !== 'daily_signals') return
    expect(event.data.bowelCount).toBe(0)
    expect(event.data.explicitNoBowelMovement).toBe(true)
    expect(timelineEventsForFocus(timeline, 'context').map((item) => item.kind)).toContain('daily_signals')

    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/progress/timeline'] },
        React.createElement(TimelineSection, { timeline, range: '30d', onEvidence: () => undefined }),
      ),
    )
    expect(html).toContain('Daily check-in')
    expect(html).toContain('No bowel movement')
    expect(html).toContain('Energy 4/5')
    expect(html).toContain('Soreness 2/5')
    expect(html).toContain('/check-in?date=2026-10-06')
    expect(html).toContain('Missing signals are not treated as zero')
  })
})
