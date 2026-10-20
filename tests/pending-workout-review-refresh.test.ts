import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPendingReviewRefresh } from '../src/features/training/pending-review-refresh.ts'

type Review = { id: string; status: 'queued' | 'processing' | 'completed' | 'failed' }

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}

afterEach(() => vi.useRealTimers())

describe('pending workout-photo review reconciliation', () => {
  it('revalidates a completed review after commit and removes only the saved job', async () => {
    vi.useFakeTimers()
    const first: Review[] = [
      { id: 'already-reviewed', status: 'completed' },
      { id: 'other-review', status: 'failed' },
    ]
    const fetchJobs = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce([first[1]])
    const onJobs = vi.fn()
    const onError = vi.fn()
    const updates = createPendingReviewRefresh({ fetchJobs, onJobs, onError })
    updates.refresh()
    await Promise.resolve()
    expect(onJobs).toHaveBeenLastCalledWith(first)
    // Completed/failed reviews do not poll forever; canonical save hints
    // reconcile with the authoritative pending list immediately.
    await vi.advanceTimersByTimeAsync(5000)
    expect(fetchJobs).toHaveBeenCalledTimes(1)
    updates.refresh()
    await Promise.resolve()
    expect(onJobs).toHaveBeenLastCalledWith([first[1]])
    expect(onError).toHaveBeenLastCalledWith(null)
    updates.stop()
  })

  it('rejects late GET responses that might resurrect a committed review', async () => {
    const slow = deferred<Review[]>()
    const fresh = deferred<Review[]>()
    const fetchJobs = vi.fn().mockReturnValueOnce(slow.promise).mockReturnValueOnce(fresh.promise)
    const onJobs = vi.fn()
    const updates = createPendingReviewRefresh({ fetchJobs, onJobs, onError: vi.fn() })
    updates.refresh() // Stale pending result starts first.
    updates.refresh() // Save/cross-tab event starts authoritative request.
    fresh.resolve([])
    await Promise.resolve()
    slow.resolve([{ id: 'already-committed', status: 'completed' }])
    await Promise.resolve()
    expect(onJobs).toHaveBeenCalledTimes(1)
    expect(onJobs).toHaveBeenLastCalledWith([])
    updates.stop()
  })

  it('keeps last known reviews on a failed request and recovers after a timed retry', async () => {
    vi.useFakeTimers()
    const original: Review[] = [{ id: 'retriable', status: 'completed' }]
    const fetchJobs = vi.fn().mockResolvedValueOnce(original)
      .mockRejectedValueOnce(new Error('Temporary connection failure'))
      .mockResolvedValueOnce([])
    const onJobs = vi.fn()
    const onError = vi.fn()
    const updates = createPendingReviewRefresh({
      fetchJobs, onJobs, onError, retryMs: 1000,
    })
    updates.refresh()
    await Promise.resolve()
    updates.refresh()
    // The rejected fetch travels through the promise .then().catch() chain.
    // Flush queued microtasks without advancing the 1-second retry timer.
    await vi.advanceTimersByTimeAsync(0)
    expect(onJobs).toHaveBeenCalledTimes(1)
    expect(onJobs).toHaveBeenLastCalledWith(original)
    expect(onError).toHaveBeenLastCalledWith('Temporary connection failure')
    await vi.advanceTimersByTimeAsync(1000)
    expect(onJobs).toHaveBeenLastCalledWith([])
    expect(onError).toHaveBeenLastCalledWith(null)
    updates.stop()
  })

  it('polls queued/processing jobs and stops timers and in-flight requests on unmount', async () => {
    vi.useFakeTimers()
    const slow = deferred<Review[]>()
    const fetchJobs = vi.fn()
      .mockResolvedValueOnce([{ id: 'running', status: 'processing' } satisfies Review])
      .mockReturnValueOnce(slow.promise)
    const onJobs = vi.fn()
    const updates = createPendingReviewRefresh({
      fetchJobs, onJobs, onError: vi.fn(), pollMs: 4000,
    })
    updates.refresh()
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(4000)
    expect(fetchJobs).toHaveBeenCalledTimes(2)
    updates.stop()
    slow.resolve([{ id: 'stale', status: 'completed' }])
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(20000)
    expect(onJobs).toHaveBeenCalledTimes(1)
    expect(fetchJobs).toHaveBeenCalledTimes(2)
  })
})
