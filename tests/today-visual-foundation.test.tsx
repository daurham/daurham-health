import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

function sources(): TodaySources {
  return {
    now: new Date('2026-10-22T18:00:00Z'),
    activityDays: [],
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    sleepNights: [],
    latestCompleteSleep: null,
    bodyWeights: [],
    pendingJobs: [],
    dailySignals: {
      date: '2026-10-22',
      hydrationEvents: [],
      bowelEvents: [],
      noBowelMovement: false,
      wellness: {
        date: '2026-10-22', energy: 4, stress: 2, hunger: 3, soreness: 1,
        createdAt: '2026-10-22T18:00:00Z', updatedAt: '2026-10-22T18:00:00Z',
      },
    },
  }
}

describe('Today visual foundation', () => {
  it('elevates daily actions without inventing wearable measurements', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TodayBoard view={buildTodayView(sources())} /></MemoryRouter>)
    expect(html).toContain('today-hero-art')
    expect(html).toContain('Your day, in focus.')
    expect(html).toContain('Daily Essentials')
    expect(html).toContain('Stress 2/5')
    expect(html).toContain('Energy 4/5')
    expect(html).toContain('href="/training/new?type=ad_hoc"')
    expect(html.indexOf('Daily Essentials')).toBeLessThan(html.indexOf('Health at a glance'))
    expect(html).not.toContain('Readiness score')
  })

  it('derives hero accent colors from semantic theme variables and supplies scene families', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const art = readFileSync('src/components/TodayHero.tsx', 'utf8')
    expect(css).toContain("html[data-health-palette='grand-line'] .today-scene--ocean")
    expect(css).toContain("html[data-health-palette='cosmic-instinct'] .today-scene--cosmos")
    expect(css).toContain("html[data-health-palette='wasteland'] .today-scene--wasteland")
    expect(css).toContain('var(--health-surface-raised)')
    expect(art).toContain('var(--health-accent-secondary)')
  })
})
