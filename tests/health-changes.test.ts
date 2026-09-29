import { afterEach, describe, expect, it, vi } from 'vitest'
import { healthFetch } from '../src/lib/health-api.ts'
import { isCoachRelevantMutation, notifyHealthDataChanged, subscribeHealthDataChanges } from '../src/lib/health-changes.ts'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('canonical mutations invalidate Coach', () => {
  it.each([
    ['POST', '/api/training/sessions'], ['PATCH', '/api/training/sessions/session'], ['DELETE', '/api/training/sessions/session'],
    ['POST', '/api/training/transcription/commit'], ['POST', '/api/nutrition/entries'], ['PATCH', '/api/nutrition/entries/entry'],
    ['DELETE', '/api/nutrition/entries/entry'], ['POST', '/api/nutrition/recipe-entries'], ['POST', '/api/nutrition/meal/commit'],
    ['POST', '/api/nutrition/describe/commit'], ['POST', '/api/body/measurements'], ['PUT', '/api/body/measurements/measurement'],
    ['DELETE', '/api/body/measurements/measurement'], ['POST', '/api/body/import/fit-profile/commit'], ['POST', '/api/body/inbox/capture/commit'],
    ['POST', '/api/apple-health/import/commit'], ['POST', '/api/lab/benchmarks/benchmark/results'],
    ['POST', '/api/lab/benchmark-results/result/invalidate'], ['POST', '/api/lab/benchmarks/benchmark/protocol-version'],
    ['POST', '/api/lab/benchmarks/benchmark/archive'], ['POST', '/api/lab/experiment-suggestions/candidate/accept'],
    ['POST', '/api/lab/experiments/experiment/start'], ['DELETE', '/api/lab/experiments/experiment'],
    ['POST', '/api/lab/experiments/experiment/result'], ['PATCH', '/api/context/days/2026-09-29'],
    ['POST', '/api/goals/goal/versions'], ['POST', '/api/supplements/adherence'],
  ])('%s %s changes current Coach truth', (method, path) => {
    expect(isCoachRelevantMutation(path, method)).toBe(true)
  })

  it.each([
    ['GET', '/api/lab/retests'], ['POST', '/api/coach/ensure'], ['POST', '/api/coach/lab/snooze'],
    ['POST', '/api/lab/benchmarks/benchmark/results/preview'], ['POST', '/api/lab/experiment-suggestions/candidate/draft'],
    ['POST', '/api/nutrition/describe'], ['POST', '/api/nutrition/foods'], ['POST', '/api/nutrition/label/commit'],
    ['POST', '/api/nutrition/meal/jobs'], ['POST', '/api/nutrition/recipes/assist'], ['POST', '/api/training/transcription/jobs'],
    ['POST', '/api/apple-health/import/preview'], ['POST', '/api/body/import/fit-profile/preview'], ['POST', '/api/ask-health'],
  ])('%s %s does not masquerade as completion or start a refresh loop', (method, path) => {
    expect(isCoachRelevantMutation(path, method)).toBe(false)
  })

  it('handles absolute URLs, query dates, and lowercase methods', () => {
    expect(isCoachRelevantMutation('https://health.example/api/nutrition/entries?date=2026-09-29', 'patch')).toBe(true)
    expect(isCoachRelevantMutation('http://[invalid', 'POST')).toBe(false)
  })
})

describe('healthFetch invalidation and coalescing', () => {
  it('refreshes once for a successful mutation plus its UI callback, without consuming the response', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', new EventTarget())
    const response = new Response(JSON.stringify({ session: { id: 'saved' } }), { status: 201 })
    const fetch = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('fetch', fetch)
    const refresh = vi.fn()
    const unsubscribe = subscribeHealthDataChanges(refresh)
    const received = await healthFetch('/api/training/sessions', { method: 'POST', body: '{}' })
    notifyHealthDataChanged()
    expect(refresh).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(await received.json()).toEqual({ session: { id: 'saved' } })
    expect(fetch).toHaveBeenCalledWith('/api/training/sessions', expect.objectContaining({ credentials: 'same-origin' }))
    unsubscribe()
  })

  it('ignores failed mutations and honors Request method overrides', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', new EventTarget())
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValue(new Response(null, { status: 204 })))
    const refresh = vi.fn()
    const unsubscribe = subscribeHealthDataChanges(refresh)
    await healthFetch('/api/lab/benchmarks/benchmark/results', { method: 'POST' })
    vi.runAllTimers()
    expect(refresh).not.toHaveBeenCalled()
    await healthFetch(new Request('https://health.example/api/body/measurements/measurement', { method: 'DELETE' }))
    vi.runAllTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
    await healthFetch(new Request('https://health.example/api/body/measurements/measurement', { method: 'DELETE' }), { method: 'GET' })
    vi.runAllTimers()
    expect(refresh).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('unsubscribes and cancels queued work when Today unmounts', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', new EventTarget())
    const refresh = vi.fn()
    const unsubscribe = subscribeHealthDataChanges(refresh)
    notifyHealthDataChanged()
    unsubscribe()
    vi.runAllTimers()
    notifyHealthDataChanged()
    vi.runAllTimers()
    expect(refresh).not.toHaveBeenCalled()
  })
})
