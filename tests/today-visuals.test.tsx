import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'
import { TodayDomainIcon, TodayScenicHero } from '../src/features/today/TodayVisuals.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'

function emptySources(): TodaySources {
  return {
    now: new Date('2026-10-22T18:00:00.000Z'),
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

function renderBoard(readOnly = false): string {
  return renderToStaticMarkup(
    React.createElement(MemoryRouter, null,
      React.createElement(AppSurfaceProvider, {
        prefix: readOnly ? '/demo' : '',
        readOnly,
        children: React.createElement(TodayBoard, { view: buildTodayView(emptySources()) }),
      }),
    ),
  )
}

describe('Today visual command center', () => {
  it('renders token-driven scenery and retains text equivalents', () => {
    const view = buildTodayView(emptySources())
    const html = renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(TodayScenicHero, { view })))
    expect(html).toContain('Next in rotation · optional')
    expect(html).toContain('Your training options')
    expect(html).not.toContain('Make today count.')
    expect(html).toContain('world-scene-art')
    expect(html).toContain('data-world-palette=')
    expect(html).not.toContain('https://')
    const icon = renderToStaticMarkup(React.createElement(TodayDomainIcon, { domain: 'hydration' }))
    expect(icon).toContain('today-domain-icon--hydration')
    expect(icon).toContain('aria-hidden="true"')
  })

  it('prioritizes action cards, and keeps daily essentials and stress visible', () => {
    const html = renderBoard()
    expect(html.indexOf('Next in rotation · optional')).toBeLessThan(html.indexOf('Daily Essentials'))
    expect(html.indexOf('Nutrition')).toBeLessThan(html.indexOf('Daily Essentials'))
    expect(html).toContain('Daily Essentials')
    // An owner without a supplement schedule should not see a fictional tile.
    expect(html).not.toContain('>Supplements<')
    expect(html).toContain('today-command-shortcuts')
    expect(readFileSync('src/features/today/TodayPage.tsx', 'utf8')).toContain('<SupplementsCard view={view}')
    expect(html).toContain('Daily Log')
    expect(html).toContain('Stress')
    expect(html).toContain('Bowel')
    expect(html).toContain('+8 oz')
    expect(html).toContain('/training/new?type=ad_hoc')
    expect(html).toContain('Add food')
    expect(html).toContain('Add context')
  })

  it('keeps the public demo non-interactive', () => {
    const html = renderBoard(true)
    expect(html).not.toContain('+8 oz')
    expect(html).not.toContain('Add food')
    expect(html).not.toContain('/training/new?type=ad_hoc')
  })

  it('uses theme semantic colors and gives reduced-motion users a static meter', () => {
    const css = readFileSync('src/index.css', 'utf8')
    expect(css).toContain('.today-scenic-hero')
    expect(css).toContain('var(--health-accent)')
    expect(css).toContain("data-health-palette='grand-line'")
    expect(css).toContain("data-health-palette='cosmic-instinct'")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.today-command-next {')
    expect(css).toContain('min-height: 8.7rem;')
    expect(css).toContain('.today-command-shortcuts {')
    expect(css).toContain('.app-shell nav[aria-label="Primary"] a[aria-current="page"]')
  })
})
