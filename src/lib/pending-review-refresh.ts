/** Reconciles a server-authoritative pending review queue.
 * Completion/commit is not inferred locally; only a fresh GET can remove a
 * pending card. Focus, cross-tab hints and successful owner mutations can
 * preempt a poll without allowing an older in-flight GET to restore stale jobs.
 */
export function createPendingReviewRefresh<T extends { status: string }>(options: {
  fetchJobs: () => Promise<T[]>
  onJobs: (jobs: T[]) => void
  onError: (message: string | null) => void
  pollMs?: number
  retryMs?: number
}): { refresh: () => void; stop: () => void } {
  const { fetchJobs, onJobs, onError, pollMs = 4000, retryMs = 15000 } = options
  let active = true
  let generation = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function refresh() {
    if (!active) return
    clearTimer()
    const request = ++generation
    void fetchJobs().then((jobs) => {
      if (!active || request !== generation) return
      onJobs(jobs)
      onError(null)
      if (jobs.some((job) => job.status === 'queued' || job.status === 'processing')) {
        timer = setTimeout(refresh, pollMs)
      }
    }).catch((caught: unknown) => {
      if (!active || request !== generation) return
      // Never clear last known reviews on a network failure. Reconcile them
      // after connectivity returns rather than claiming they are completed.
      onError(caught instanceof Error ? caught.message : 'Could not refresh pending reviews.')
      timer = setTimeout(refresh, retryMs)
    })
  }

  return {
    refresh,
    stop: () => {
      active = false
      ++generation
      clearTimer()
    },
  }
}
