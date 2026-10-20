import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchPendingNutritionCaptures, saveAiReusableFood } from '../src/features/nutrition/api.ts'
import { subscribeHealthDataChanges, subscribeHealthReviewQueueChanges } from '../src/lib/health-changes.ts'
import { readFileSync } from 'node:fs'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('PIQ-8 Nutrition pending capture refresh', () => {
  it('does not turn a failed label or meal read into a falsely empty review list', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      if (input === '/api/nutrition/label/jobs') {
        return new Response(JSON.stringify({ jobs: [{ id: 'label-1', status: 'completed', createdAt: '2026-10-19T10:00:00Z' }] }), { status: 200 })
      }
      if (input === '/api/nutrition/meal/jobs') {
        return new Response(JSON.stringify({ error: 'Meal reviews are temporarily unavailable.' }), { status: 503 })
      }
      throw new Error('Unexpected request')
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(fetchPendingNutritionCaptures()).rejects.toThrow('Meal reviews are temporarily unavailable.')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps independent label/meal review ordering after both endpoints recover', async () => {
    const fetchMock = vi.fn(async (input: string) => {
      const jobs = input === '/api/nutrition/label/jobs'
        ? [{ id: 'label', status: 'completed', createdAt: '2026-10-19T10:00:00Z' }]
        : [{ id: 'meal', status: 'failed', createdAt: '2026-10-19T11:00:00Z' }]
      return new Response(JSON.stringify({ jobs }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const cards = await fetchPendingNutritionCaptures()
    expect(cards.map((job) => job.id)).toEqual(['meal', 'label'])
  })

  it('only notifies review cards after an AI food actually saves from a photo job', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', new EventTarget())
    // A Response body is one-shot: each independent save has a new body.
    const fetchMock = vi.fn().mockImplementation(async () =>
      new Response(JSON.stringify({ food: { id: 'saved' }, reused: false }), { status: 201 }),
    )
    vi.stubGlobal('fetch', fetchMock)
    const queue = vi.fn()
    const coach = vi.fn()
    const stopQueue = subscribeHealthReviewQueueChanges(queue)
    const stopCoach = subscribeHealthDataChanges(coach)
    const input = {
      name: 'Fictional example', text: 'Testing only', servingQuantity: 1,
      servingUnit: 'serving', calories: 100, provider: 'gemini' as const,
      originalCalories: 100, adjusted: false,
    }
    await saveAiReusableFood(input)
    vi.runAllTimers()
    expect(queue).not.toHaveBeenCalled()
    await saveAiReusableFood({ ...input, jobId: 'fictional-photo-job' })
    vi.runAllTimers()
    expect(queue).toHaveBeenCalledTimes(1)
    expect(coach).not.toHaveBeenCalled()
    stopQueue()
    stopCoach()
  })

  it('subscribes Nutrition pending cards independently of its daily totals', () => {
    const source = readFileSync('src/features/nutrition/NutritionPage.tsx', 'utf8')
    expect(source).toContain('createPendingReviewRefresh<PendingNutritionCapture>')
    expect(source).toContain('subscribeHealthDataChanges(reviews.refresh, { revalidateOnFocus: true })')
    expect(source).toContain('subscribeHealthReviewQueueChanges(reviews.refresh)')
    expect(source).toContain('reviews.stop()')
    expect(source).toContain('Pending nutrition captures could not be refreshed')
    expect(source).not.toContain('fetchPendingNutritionCaptures().catch(() => [])')
    const api = readFileSync('src/features/nutrition/api.ts', 'utf8')
    expect(api).not.toContain('fetchNutritionLabelJobs().catch(() => [])')
    expect(api).not.toContain('fetchNutritionMealJobs().catch(() => [])')
  })
})
