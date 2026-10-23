import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { TodayScenicHero } from '../src/features/today/TodayVisuals.tsx'
import { buildTodayView, type TodaySources } from '../src/domain/today/view.ts'

const sources: TodaySources = {
  now: new Date('2026-10-22T18:00:00Z'), activityDays: [], nutritionEntries: [],
  nutritionTargets: [], trainingToday: [], trainingSessions: [], sleepNights: [],
  latestCompleteSleep: null, bodyWeights: [], pendingJobs: [],
}

describe('Today scene families and daily priorities', () => {
  it('has independently cropped, token-colored scenery without atlas row bleed', () => {
    const hero = renderToStaticMarkup(<MemoryRouter><TodayScenicHero view={buildTodayView(sources)} /></MemoryRouter>)
    const css = readFileSync('src/index.css', 'utf8')
    expect(hero).toContain('world-scene-art')
    expect(hero).toContain('data-world-palette=')
    expect(hero).toContain('/theme/worlds/v2/bonfire.webp')
    expect(css).toContain('background-size: cover;')
    expect(css).toContain("data-health-palette='grand-line'")
    expect(css).toContain("data-health-palette='cosmic-instinct'")
    expect(css).toContain("data-health-palette='wasteland'")
    expect(css).toContain('var(--health-accent-secondary)')
    expect(hero).not.toContain('https://')
  })

  it('keeps essentials before passive history, and suggested workouts before manual alternatives', () => {
    const html = renderToStaticMarkup(<MemoryRouter><TodayBoard view={buildTodayView(sources)} /></MemoryRouter>)
    expect(html.indexOf('Daily Essentials')).toBeLessThan(html.indexOf('Health trends'))
    expect(html.indexOf('Health trends')).toBeLessThan(html.indexOf('Resting HR'))
    expect(html.indexOf('Next in rotation')).toBeLessThan(html.indexOf('Ad-hoc workout'))
    expect(html).toContain('Add food')
    expect(html).toContain('+8 oz water')
    expect(html).toContain('Training options')
    expect(html).not.toContain('Make today count.')
    expect((html.match(/today-command-next/g) ?? []).length).toBe(1)
    expect(html).toContain('Bowel / wellness')
  })
})
