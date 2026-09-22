import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  caloriesHeadline,
  groupedEntries,
  clusterMealLogItems,
  macroHeadline,
  proteinHeadline,
  overTargetDelta,
  remainingHeadline,
} from '../src/features/nutrition/format.ts'
import {
  parseNutritionDateParam,
  shiftNutritionDate,
  nutritionDateSearch,
  formatNutritionDayLabel,
  nutritionLoadErrorMessage,
  adjacentNutritionDates,
} from '../src/features/nutrition/date.ts'
import type { NutritionEntry } from '../src/domain/nutrition/index.ts'

describe('nutrition day URL and labels', () => {
  it('persists YYYY-MM-DD without UTC conversion and falls back to today', () => {
    expect(parseNutritionDateParam('2026-09-21', '2026-09-21')).toBe('2026-09-21')
    expect(parseNutritionDateParam('nope', '2026-09-21')).toBe('2026-09-21')
    expect(shiftNutritionDate('2026-09-21', -1)).toBe('2026-09-20')
    expect(shiftNutritionDate('2026-09-21', 1)).toBe('2026-09-22')
    expect(nutritionDateSearch('2026-09-21')).toBe('?date=2026-09-21')
    expect(formatNutritionDayLabel('2026-09-21', '2026-09-21')).toBe('Today')
    expect(formatNutritionDayLabel('2026-09-20', '2026-09-21')).toContain('Sep')
    expect(nutritionLoadErrorMessage('2026-09-20')).toBe("Couldn't load Sep 20.")
    expect(adjacentNutritionDates('2026-09-21')).toEqual(['2026-09-20', '2026-09-22'])
  })
})

describe('nutrition summary copy', () => {
  it('does not present missing targets as / 0 or unknown macros as zero', () => {
    const calories = { status: 'available' as const, value: 1540, observations: 2, missing: 0 }
    const protein = { status: 'available' as const, value: 92, observations: 2, missing: 0 }
    const unavailable = { status: 'insufficient_data' as const, value: null, observations: 1, missing: 1 }
    expect(caloriesHeadline(calories, null)).toBe('1,540 kcal consumed')
    expect(caloriesHeadline(calories, 2100)).toBe('1,540 / 2,100 kcal')
    expect(proteinHeadline(protein, null)).toBe('92 g recorded')
    expect(proteinHeadline(unavailable, 160)).toBe('— / 160 g')
    expect(overTargetDelta(2240, 2100)).toBe(140)
    expect(overTargetDelta(1540, 2100)).toBeNull()
    expect(remainingHeadline(calories, 2100, 'kcal')).toBe('560 remaining')
    expect(remainingHeadline(protein, 160, 'g')).toBe('68 left')
    expect(remainingHeadline({ status: 'available', value: 172, observations: 1, missing: 0 }, 160, 'g')).toBe('+12 g')
    expect(remainingHeadline(unavailable, 160, 'g')).toBeNull()
    expect(macroHeadline(protein, null, 'g')).toBe('92 g recorded')
    expect(macroHeadline(unavailable, null, 'g')).toBe('—')
  })
})

describe('nutrition entry grouping', () => {
  it('keeps a flat Today list when meal categories are absent', () => {
    const entries = [
      { id: '1', foodName: 'Egg', meal: null },
      { id: '2', foodName: 'Rice', meal: null },
    ] as NutritionEntry[]
    expect(groupedEntries(entries)).toEqual([
      { key: 'today', label: 'Today', entries },
    ])
  })

  it('clusters photo-meal entries under a group without collapsing snapshots', () => {
    const entries = [
      { id: '1', foodName: 'Chicken', calories: 250, protein: 40, mealGroupId: 'g1', meal: 'dinner', sourceKind: 'photo_ai' },
      { id: '2', foodName: 'Rice', calories: 200, protein: 4, mealGroupId: 'g1', meal: 'dinner', sourceKind: 'photo_ai' },
      { id: '3', foodName: 'Yogurt', calories: 100, protein: 10, mealGroupId: null, meal: 'dinner' },
    ] as NutritionEntry[]
    const clustered = clusterMealLogItems(entries)
    expect(clustered[0]).toMatchObject({ kind: 'meal', label: 'Photo meal', calories: 450 })
    expect(clustered[0]?.kind === 'meal' && clustered[0].entries).toHaveLength(2)
    expect(clustered[1]).toMatchObject({ kind: 'entry', entry: { id: '3' } })
  })

  it('shows a meal-photo snapshot as one log row', () => {
    const entries = [
      {
        id: '1',
        foodName: 'Chicken, rice and broccoli',
        calories: 680,
        protein: 38,
        mealGroupId: null,
        meal: 'dinner',
        sourceKind: 'photo_ai',
      },
    ] as NutritionEntry[]
    const clustered = clusterMealLogItems(entries)
    expect(clustered).toHaveLength(1)
    expect(clustered[0]).toMatchObject({ kind: 'entry', entry: { id: '1', calories: 680, protein: 38 } })
  })
})

describe('nutrition daily UX source', () => {
  it('keeps Add food primary, desktop split, and the existing bottom nav', () => {
    const page = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    const panels = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(page).toContain('Add food')
    expect(page).toContain('md:grid-cols-[minmax(0,1fr)_22rem]')
    expect(page).toContain("bottom: 'calc(var(--shell-nav-offset) + 1rem)'")
    expect(page).toContain('useSearchParams')
    expect(page).toContain('setParams({ date: resource.committedKey }')
    expect(page).toContain('useAtomicKeyedResource')
    expect(page).toContain('prefetchKeys: adjacentNutritionDates')
    expect(page).toContain('PendingLoadRegion')
    expect(panels).toContain('Search foods or describe what you ate')
    expect(panels).toContain('Use this description')
    expect(panels).toContain('No matching saved foods.')
    expect(panels).toContain('stickyHeader')
    expect(panels).toContain('Scan barcode')
    expect(panels).toContain('Scan nutrition label')
    expect(panels).toContain('Meal photo')
    expect(panels).toContain('Manual entry')
    expect(panels).toContain('Save & Log')
    expect(panels).toContain('title="Recent"')
    expect(panels).not.toContain('title="Staples"')
    expect(panels).not.toContain('Recipes / meals')
    expect(panels).toContain('Staple')
    expect(panels).toContain('rankFoodsForQuery')
    expect(panels).toContain('aria-label={`Quick log 1 serving of ${food.name}`}')
    expect(layout).toContain('grid-cols-5')
    expect(layout).toContain("to: '/nutrition'")
    expect(page).not.toContain('ocr')
    expect(page).not.toContain('Apple Health')
    expect(page).toContain('Pending captures')
  })
})

describe('mobile form controls', () => {
  it('uses 16px mobile text and does not disable zoom', () => {
    const css = readFileSync('src/index.css', 'utf8')
    const html = readFileSync('index.html', 'utf8')
    expect(css).toContain('font-size: 1rem')
    expect(css).toContain('max-width: 767px')
    expect(html).not.toContain('maximum-scale')
    expect(html).not.toContain('user-scalable=no')
    expect(html).toContain('viewport-fit=cover')
    expect(readFileSync('src/features/nutrition/panels.tsx', 'utf8')).toContain('text-base')
    expect(readFileSync('src/features/nutrition/LabelCapture.tsx', 'utf8')).toContain('text-base')
    expect(readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')).toContain('text-base')
    expect(readFileSync('src/auth/SignInPage.tsx', 'utf8')).toContain('text-base')
  })
})
