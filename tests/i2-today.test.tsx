import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

function baseSources(): TodaySources {
  return {
    now: new Date('2026-10-06T20:00:00.000Z'),
    activityDays: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    sleepNights: [],
    latestCompleteSleep: null,
    bodyWeights: [],
    pendingJobs: [],
  }
}

describe('I2 Today Daily Check-in', () => {
  it('keeps missing Daily Signals unknown', () => {
    const view = buildTodayView(baseSources())
    expect(view.dailySignals).toMatchObject({
      hydration: { tracked: false, totalOz: null },
      bowel: { tracked: false, eventCount: null, noMovement: false },
      wellness: { recorded: false },
    })
  })

  it('renders one consolidated Daily check-in before Supplements content', () => {
    const view = buildTodayView({
      ...baseSources(),
      dailySignals: {
        date: '2026-10-06',
        hydrationEvents: [{
          id: 'water-1',
          date: '2026-10-06',
          occurredAt: '2026-10-06T20:00:00.000Z',
          amountMl: 473.176,
          amountOz: 16,
          note: null,
          createdAt: '2026-10-06T20:00:00.000Z',
        }],
        bowelEvents: [{
          id: 'bowel-1',
          date: '2026-10-06',
          occurredAt: '2026-10-06T19:00:00.000Z',
          bristolType: 4,
          straining: null,
          urgency: null,
          incompleteFeeling: null,
          note: null,
          createdAt: '2026-10-06T19:00:00.000Z',
        }],
        noBowelMovement: false,
        wellness: {
          date: '2026-10-06',
          energy: 3,
          hunger: 4,
          soreness: 2,
          stress: null,
          createdAt: '2026-10-06T20:00:00.000Z',
          updatedAt: '2026-10-06T20:00:00.000Z',
        },
      },
    })
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TodayBoard view={view} />
      </MemoryRouter>,
    )
    expect((html.match(/Daily check-in/g) ?? []).length).toBe(1)
    expect(html).toContain('Water 16 oz')
    expect(html).toContain('Bowel 1 · type 4')
    expect(html).toContain('Energy 3/5')
    expect(html).toContain('Hunger 4/5')
    expect(html).toContain('Soreness 2/5')
    expect(html).toContain('/check-in?date=2026-10-06')
  })

  it('renders an explicit no-BM day as None rather than unknown', () => {
    const view = buildTodayView({
      ...baseSources(),
      dailySignals: {
        date: '2026-10-06',
        hydrationEvents: [],
        bowelEvents: [],
        noBowelMovement: true,
        wellness: null,
      },
    })
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TodayBoard view={view} />
      </MemoryRouter>,
    )
    expect(html).toContain('Bowel None')
  })
})
