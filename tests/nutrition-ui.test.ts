import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  caloriesHeadline,
  groupedEntries,
  proteinHeadline,
  overTargetDelta,
} from '../src/features/nutrition/format.ts'
import { parseNutritionDateParam, shiftNutritionDate, nutritionDateSearch, formatNutritionDayLabel } from '../src/features/nutrition/date.ts'
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
})

describe('nutrition daily UX source', () => {
  it('keeps Add food primary, desktop split, and the existing bottom nav', () => {
    const page = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    const panels = readFileSync('src/features/nutrition/panels.tsx', 'utf8')
    const layout = readFileSync('src/components/Layout.tsx', 'utf8')
    expect(page).toContain('Add food')
    expect(page).toContain('md:grid-cols-[minmax(0,1fr)_22rem]')
    expect(page).toContain("bottom: 'calc(4.5rem + env(safe-area-inset-bottom))'")
    expect(page).toContain('useSearchParams')
    expect(page).toContain('setParams({ date')
    expect(panels).toContain('Recent')
    expect(panels).toContain('Staples')
    expect(panels).toContain('Recipes / meals')
    expect(panels).toContain('Scan barcode')
    expect(panels).toContain('Manual entry')
    expect(panels).toContain('Save & Log')
    expect(layout).toContain('grid-cols-5')
    expect(layout).toContain("to: '/nutrition'")
    expect(page).not.toContain('ocr')
    expect(page).not.toContain('Apple Health')
  })
})
