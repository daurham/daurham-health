import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { todayShouldReloadAfterNutrition } from '../src/features/today/nutrition-refresh.ts'

describe('today nutrition refresh', () => {
  it('reloads Today only after a consumed Nutrition entry, not Save for later', () => {
    expect(todayShouldReloadAfterNutrition('consumed')).toBe(true)
    expect(todayShouldReloadAfterNutrition('saved_for_later')).toBe(false)
    const page = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    expect(page).toContain('finish(\'consumed\')')
    expect(page).toContain('finish(\'saved_for_later\')')
    expect(page).toContain('todayShouldReloadAfterNutrition')
    expect(page).toContain('onNutritionChanged={() => resource.retry()}')
    expect(page).toContain('createNutritionEntry')
    expect(page).toContain('.then(() => finish(\'consumed\'))')
    expect(page).not.toContain('.finally(')
  })

  it('keeps Today refresh as GET /api/today and does not resubmit Nutrition on refresh failure', () => {
    const page = readFileSync('src/features/today/TodayPage.tsx', 'utf8')
    const api = readFileSync('src/features/today/api.ts', 'utf8')
    const hook = readFileSync('src/lib/atomic-resource.ts', 'utf8')
    expect(api).toContain('/api/today')
    expect(page).toContain('fetchToday')
    expect(page).toContain('Could not refresh Today. Showing the last loaded day.')
    expect(hook).toContain('refreshAtomicRequest')
    expect(hook).toContain('cacheRef.current.delete(requestedKey)')
    expect(page).not.toContain('nutritionDayTotals')
  })
})
