import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/view.ts'
import { HEALTH_PALETTES, THEME_PACKS } from '../src/theme.ts'
import { TodayScenicHero } from '../src/features/today/TodayVisuals.tsx'
import { ThemeWorldArtwork, sceneMoodForDate } from '../src/features/today/ThemeWorldArtwork.tsx'

const sources: TodaySources = {
  now: new Date('2026-10-22T18:00:00Z'),
  activityDays: [], nutritionEntries: [], nutritionTargets: [], trainingToday: [],
  trainingSessions: [], sleepNights: [], latestCompleteSleep: null,
  bodyWeights: [], pendingJobs: [],
}

describe('Collectible theme scenes', () => {
  it('has a distinct environmental subject for all requested worlds', () => {
    const svg = renderToStaticMarkup(<ThemeWorldArtwork date="2026-10-22" />)
    for (const world of ['onepiece','bonfire','dragon','leaf','gunships','fleet','ringworld','wasteland-detail','prestige']) {
      expect(svg).toContain('today-world-' + world)
    }
    expect(svg).toContain('world-boat')
    expect(svg).toContain('world-fire')
    expect(svg).toContain('world-dragon-head')
    expect(svg).toContain('world-carvings')
    expect((svg.match(/world-fly/g) ?? []).length).toBe(6)
    expect(svg).toContain('world-rare-comet')
    expect(svg).not.toContain('https://')
    expect(svg).not.toContain('<image')
  })

  it('uses stable calendar moods and never treats outcomes as unlock conditions', () => {
    expect(sceneMoodForDate('invalid')).toEqual({ mood: 'dusk', rare: false })
    expect(sceneMoodForDate('2026-10-22')).toEqual(sceneMoodForDate('2026-10-22'))
    const days = Array.from({ length: 90 }, (_, i) => {
      const dt = new Date(Date.UTC(2026, 9, 22 + i))
      return sceneMoodForDate(dt.toISOString().slice(0, 10))
    })
    expect(new Set(days.map(d => d.mood)).size).toBe(3)
    expect(days.filter(d => d.rare).length).toBeGreaterThanOrEqual(2)
    expect(days.filter(d => d.rare).length).toBeLessThan(6)
  })

  it('keeps light and dark palette tokens, with a scene mapping for every progression theme', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const progress = THEME_PACKS.filter(p => p.unlockLevel != null)
    expect(progress).toHaveLength(HEALTH_PALETTES.length - 5)
    for (const p of progress) {
      expect(css).toContain("data-preview-palette='" + p.id + "'")
    }
    expect(css).toContain('var(--health-accent-secondary)')
    expect(css).toContain('.today-world-onepiece')
    expect(css).toContain('.today-world-bonfire')
    expect(css).toContain('.today-world-dragon')
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).not.toContain('animation-iteration-count: infinite')
  })

  it('removes duplicate hero date while retaining the dashboard page date', () => {
    const hero = renderToStaticMarkup(<MemoryRouter><TodayScenicHero view={buildTodayView(sources)} /></MemoryRouter>)
    expect(hero).toContain('Your training options')
    expect(hero).toContain('Quick logging')
    expect(hero).not.toContain('Make today count.')
    expect(hero).not.toContain('Thursday, Oct 22')
    expect(hero).toContain('today-command-shortcuts')
    expect(readFileSync('src/features/today/TodayPage.tsx','utf8')).toContain('<TodayScenicHero')
    expect(readFileSync('src/features/settings/SettingsPage.tsx','utf8')).toContain('Theme world gallery')
  })
})
