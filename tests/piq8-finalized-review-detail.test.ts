import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { HttpError } from '../server/http.ts'
import { assertReviewNotFinalized, FINALIZED_REVIEW_CODE } from '../server/reviews/finalized-review.ts'
import { WorkoutReviewAlreadySavedError, fetchTranscriptionJob } from '../src/features/training/api.ts'
import { MealClientError, fetchNutritionMealJob } from '../src/features/nutrition/api.ts'

afterEach(() => vi.unstubAllGlobals())

describe('finalized owner photo review detail isolation', () => {
  it('rejects only terminal workout and meal photo reviews with a stable, non-sensitive error', () => {
    for (const kind of ['workout', 'meal'] as const) {
      for (const status of ['queued', 'processing', 'completed', 'failed', null]) {
        expect(() => assertReviewNotFinalized(status, kind)).not.toThrow()
      }
      try {
        assertReviewNotFinalized('committed', kind)
        throw new Error('Missing committed review conflict')
      } catch (error) {
        expect(error).toBeInstanceOf(HttpError)
        expect((error as HttpError).statusCode).toBe(409)
        expect((error as HttpError).code).toBe(FINALIZED_REVIEW_CODE)
        expect((error as HttpError).message).not.toMatch(/uuid|database|token|password/i)
      }
    }
  })

  it('treats a finalized workout GET as terminal, rather than retrying a provider poll', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'This workout photo was already saved.',
      code: FINALIZED_REVIEW_CODE,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })))
    await expect(fetchTranscriptionJob('11111111-1111-4111-8111-111111111111'))
      .rejects.toBeInstanceOf(WorkoutReviewAlreadySavedError)
    const page = readFileSync('src/features/training/ImportWorkoutPage.tsx', 'utf8')
    expect(page).toContain('caught instanceof WorkoutReviewAlreadySavedError')
    expect(page).toMatch(/setFailure\(caught\.message\)[\s\S]*setPollError\(null\)[\s\S]*return/)
    expect(page).toContain('Try another photo')
  })

  it('routes already-saved meal GET through capture-specific error handling, not barcode lookup', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: 'This meal photo was already saved.',
      code: FINALIZED_REVIEW_CODE,
    }), { status: 409, headers: { 'Content-Type': 'application/json' } })))
    await expect(fetchNutritionMealJob('11111111-1111-4111-8111-111111111111'))
      .rejects.toMatchObject({ name: 'MealClientError', code: FINALIZED_REVIEW_CODE } satisfies Partial<MealClientError>)
    const page = readFileSync('src/features/nutrition/MealCapture.tsx', 'utf8')
    expect(page).toContain("caught.code === 'CAPTURE_ALREADY_SAVED'")
    expect(page).toContain("errorCode !== 'CAPTURE_ALREADY_SAVED'")
    expect(page).toContain("activeJobId && errorCode !== 'CAPTURE_ALREADY_SAVED'")
  })

  it('guards server GET before and after provider reads without changing saved-label Pantry→Log behavior', () => {
    const workout = readFileSync('server/handlers/transcription-job-detail.ts', 'utf8')
    const provider = workout.indexOf('const result = await getTranscriptionJob(parsed.data)')
    const first = workout.indexOf("assertReviewNotFinalized((await getTranscriptionJobRecord(parsed.data))?.status, 'workout')")
    const second = workout.lastIndexOf("assertReviewNotFinalized((await getTranscriptionJobRecord(parsed.data))?.status, 'workout')")
    expect(first).toBeGreaterThan(-1)
    expect(first).toBeLessThan(provider)
    expect(second).toBeGreaterThan(provider)

    const meal = readFileSync('server/nutrition/meal.ts', 'utf8')
    expect(meal).toContain("if (stored?.captureKind === 'meal_photo') assertReviewNotFinalized(stored.status, 'meal')")
    const handler = readFileSync('server/handlers/nutrition-meal-job-detail.ts', 'utf8')
    expect(handler).toContain('const result = await getNutritionMealJob(parsed)')
    expect(handler).toContain("if (current?.captureKind === 'meal_photo') assertReviewNotFinalized(current.status, 'meal')")

    const label = readFileSync('server/nutrition/label.ts', 'utf8')
    expect(label).toContain("stored.status === 'committed' ? 'completed'")
    expect(label).not.toContain('assertReviewNotFinalized')
  })
})
