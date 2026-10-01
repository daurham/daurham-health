import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { requestQueryValue, type ApiRequest } from '../server/http.ts'

describe('H5 owner QA fixes', () => {
  it('reads management/search query values from local Vite request URLs', () => {
    expect(requestQueryValue({ url: '/api/training/exercises?management=true' } as ApiRequest, 'management')).toBe('true')
    expect(requestQueryValue({ url: '/api/nutrition/foods?query=greek%20yogurt' } as ApiRequest, 'query')).toBe('greek yogurt')

    const training = readFileSync('server/handlers/training-exercises.ts', 'utf8')
    const nutrition = readFileSync('server/handlers/nutrition-foods.ts', 'utf8')
    expect(training).toContain("requestQueryValue(req, 'management') === 'true'")
    expect(nutrition).toContain("requestQueryValue(req, 'management') === 'true'")
    expect(nutrition).toContain("requestQueryValue(req, 'query')")
  })

  it('uses a bounded themed searchable exercise picker for Saved Routines', () => {
    const routines = readFileSync('src/features/training/RoutinesPage.tsx', 'utf8')
    expect(routines).toContain('function RoutineExercisePicker')
    expect(routines).toContain('max-h-64 overflow-y-auto')
    expect(routines).toContain('placeholder="Search exercises"')
    expect(routines).toContain('role="listbox"')
    expect(routines).not.toContain('<label className="block text-sm">Exercise<select')
  })
})
