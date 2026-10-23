import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

function sources(): TodaySources {
  return {
    now: new Date('2026-10-22T18:00:00Z'), activityDays: [], nutritionEntries: [], nutritionTargets: [],
    trainingToday: [], trainingSessions: [], sleepNights: [], latestCompleteSleep: null,
    bodyWeights: [], pendingJobs: [],
    dailySignals: {
      date: '2026-10-22', hydrationEvents: [], bowelEvents: [], noBowelMovement: false,
      wellness: {
        date: '2026-10-22', energy: 4, stress: 2, hunger: 3, soreness: 1,
        createdAt: '2026-10-22T18:00:00Z', updatedAt: '2026-10-22T18:00:00Z',
      },
    },
  }
}

describe('Today daily essentials refinement', () => {
  it('shows all four check-in ratings plus the accessible logging actions', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TodayBoard view={buildTodayView(sources())}/></MemoryRouter>)
    for (const value of ['Energy 4/5', 'Stress 2/5', 'Hunger 3/5', 'Soreness 1/5']) {
      expect(html).toContain(value)
    }
    expect(html).toContain('Edit ratings')
    expect(html).toContain('Bowel / wellness')
    expect(html).toContain('Add context')
    expect(html).toContain('+8 oz')
    expect(html).toContain('href="/training/new?type=ad_hoc"')
    expect(html).toContain('Next in rotation')
  })

  it('retains the next-template route without assigning a mandatory workout day', () => {
    const source = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    expect(source).toContain('fetchTrainingPlan()')
    expect(source).toContain('/training/new?template=')
    expect(readFileSync('src/features/today/TodayVisuals.tsx', 'utf8')).toContain('Next in rotation · optional')
  })
})
