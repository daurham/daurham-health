/** Canonical successful owner mutations invalidate Training, Today and Coach; drafts/ensures do not. */
export const HEALTH_DATA_CHANGED = 'health:data-changed'
/** Review-queue hints change Today/Training cards, not canonical Coach evidence. */
export const HEALTH_REVIEW_QUEUE_CHANGED = 'health:review-queue-changed'

/** Queue-only state is visible on Today and Training but is not Coach evidence. */
export function isReviewQueueMutation(url: string, method: string): boolean {
  let path: string
  try {
    path = new URL(url, 'http://health.local').pathname
  } catch {
    return false
  }
  const queuePath = '/api/training/transcription/jobs/'
  const jobPath = path.startsWith(queuePath) ? path.slice(queuePath.length) : ''
  return (method.toUpperCase() === 'POST' && path === '/api/training/transcription/jobs')
    || (method.toUpperCase() === 'DELETE' && jobPath.length > 0 && !jobPath.includes('/'))
}

export function isCoachRelevantMutation(url: string, method: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return false
  let path: string
  try {
    path = new URL(url, 'http://health.local').pathname
  } catch {
    return false
  }
  if (/\/(preview|draft)$/.test(path)) return false
  // These owner decisions change interpretation/eligibility even without
  // adding a new measurement. A stale Coach can otherwise repeat unsafe advice.
  if (path === '/api/profile' || path === '/api/data-quality/reviews' ||
      path === '/api/nutrition/day/completeness') return true
  if (/^\/api\/(lab|goals|context|supplements|hydration|bowel|check-in)(\/|$)/.test(path)) return true
  if (/^\/api\/training\/(sessions|exercises|templates|plan)(\/|$)/.test(path)) return true
  if (path === '/api/training/transcription/commit') return true
  if (/^\/api\/nutrition\/(entries|recipe-entries|targets)(\/|$)/.test(path)) return true
  if (/^\/api\/nutrition\/(meal|describe)\/commit$/.test(path)) return true
  if (/^\/api\/body\/(measurements|cadences)(\/|$)/.test(path)) return true
  if (/^\/api\/body\/inbox\/[^/]+\/commit$/.test(path)) return true
  return path === '/api/body/import/fit-profile/commit' || path === '/api/apple-health/import/commit'
}

/**
 * Ephemeral same-origin cross-tab invalidation. Messages never contain health
 * records, dates, identifiers, or account data; they are only refresh hints.
 * No localStorage persistence or polling, and remote hints are not echoed.
 */
export const HEALTH_CHANGE_CHANNEL = 'health:canonical-changes-v1'
let changeChannel: BroadcastChannel | null = null

function openChangeChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof window.BroadcastChannel !== 'function') return null
  if (changeChannel) return changeChannel
  try {
    const channel = new window.BroadcastChannel(HEALTH_CHANGE_CHANNEL)
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === HEALTH_DATA_CHANGED || event.data === HEALTH_REVIEW_QUEUE_CHANGED) {
        window.dispatchEvent(new Event(event.data))
      }
    })
    changeChannel = channel
  } catch {
    // Private mode or unsupported browsers still use local events and focus.
    return null
  }
  return changeChannel
}

export function notifyHealthDataChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(HEALTH_DATA_CHANGED))
  openChangeChannel()?.postMessage(HEALTH_DATA_CHANGED)
}

/** Notify all open owner tabs that an unsaved review was queued or dismissed.
 * Never invalidates Coach's canonical analysis or includes an owner identifier.
 */
export function notifyHealthReviewQueueChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(HEALTH_REVIEW_QUEUE_CHANGED))
  openChangeChannel()?.postMessage(HEALTH_REVIEW_QUEUE_CHANGED)
}

/** Only re-fetch review cards; do not trigger Coach/Goal analysis. */
export function subscribeHealthReviewQueueChanges(refresh: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  openChangeChannel()
  let timer: ReturnType<typeof setTimeout> | null = null
  const changed = () => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      refresh()
    }, 0)
  }
  window.addEventListener(HEALTH_REVIEW_QUEUE_CHANGED, changed)
  return () => {
    window.removeEventListener(HEALTH_REVIEW_QUEUE_CHANGED, changed)
    if (timer !== null) clearTimeout(timer)
  }
}

/** Coalesce successful mutations, cross-tab notifications and optional
 * focus/visibility revalidation. Unsubscribing cancels pending notifications.
 */
export function subscribeHealthDataChanges(
  refresh: () => void,
  options: { revalidateOnFocus?: boolean; immediate?: boolean } = {},
): () => void {
  if (typeof window === 'undefined') return () => undefined
  openChangeChannel()
  let timer: ReturnType<typeof setTimeout> | null = null
  const changed = () => {
    // Safety-sensitive in-flight responses need synchronous invalidation.
    // Other callers retain batched refreshes to avoid redundant data loads.
    if (options.immediate) {
      refresh()
      return
    }
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      refresh()
    }, 0)
  }
  const onVisibility = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') changed()
  }
  window.addEventListener(HEALTH_DATA_CHANGED, changed)
  if (options.revalidateOnFocus) {
    window.addEventListener('focus', changed)
    window.addEventListener('pageshow', changed)
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
  }
  return () => {
    window.removeEventListener(HEALTH_DATA_CHANGED, changed)
    if (options.revalidateOnFocus) {
      window.removeEventListener('focus', changed)
      window.removeEventListener('pageshow', changed)
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }
    if (timer != null) clearTimeout(timer)
  }
}
