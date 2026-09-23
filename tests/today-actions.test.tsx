import React from 'react'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildTodayView, type TodaySources } from '../src/domain/today/index.ts'
import { TodayBoard } from '../src/features/today/TodayPage.tsx'

function sources(): TodaySources {
  return {
    now: new Date('2026-09-22T18:00:00.000Z'),
    activityDays: [],
    sleepNights: [],
    latestCompleteSleep: null,
    nutritionEntries: [],
    nutritionTargets: [],
    trainingToday: [],
    trainingSessions: [],
    pendingJobs: [],
    bodyWeights: [],
  }
}

describe('today actions', () => {
  it('opens Add food from Today and defaults Log workout to photo import', () => {
    const today = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    const nutrition = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    expect(today).toContain('TodayAddFoodAction')
    expect(today).toContain('AddFoodSheet')
    expect(today).toContain('fetchNutritionDay(date)')
    expect(today).toContain("prefixedPath(prefix, '/training/import')")
    expect(today).not.toContain("prefixedPath(prefix, '/training/new')")
    expect(nutrition).toContain("params.get('action') !== 'add'")
    expect(nutrition).toContain("setPanel({ kind: 'add' })")
    expect(nutrition).toContain("next.delete('action')")
  })

  it('renders Log workout as the import route and Add food as an immediate action', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <TodayBoard view={buildTodayView(sources())} />
      </MemoryRouter>,
    )
    expect(html).toContain('Add food')
    expect(html).toMatch(/<button[^>]*>Add food<\/button>/)
    expect(html).toContain('/training/import')
    expect(html).not.toContain('/training/new')
    expect(html).toContain('Log workout')
  })
})
