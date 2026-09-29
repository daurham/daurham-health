/** Canonical owner changes invalidate Today/Coach. Drafts and Coach ensures do not. */
export const HEALTH_DATA_CHANGED = 'health:data-changed'

export function isCoachRelevantMutation(url: string, method: string): boolean {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method.toUpperCase())) return false
  let path: string
  try {
    path = new URL(url, 'http://health.local').pathname
  } catch {
    return false
  }
  if (/\/(preview|draft)$/.test(path)) return false
  if (/^\/api\/(lab|goals|context|supplements)(\/|$)/.test(path)) return true
  if (/^\/api\/training\/(sessions|exercises|templates)(\/|$)/.test(path)) return true
  if (path === '/api/training/transcription/commit') return true
  if (/^\/api\/nutrition\/(entries|recipe-entries|targets)(\/|$)/.test(path)) return true
  if (/^\/api\/nutrition\/(meal|describe)\/commit$/.test(path)) return true
  if (/^\/api\/body\/(measurements|cadences)(\/|$)/.test(path)) return true
  if (/^\/api\/body\/inbox\/[^/]+\/commit$/.test(path)) return true
  return path === '/api/body/import/fit-profile/commit' || path === '/api/apple-health/import/commit'
}

export function notifyHealthDataChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(HEALTH_DATA_CHANGED))
}

/** Coalesce a successful mutation and its UI callback; no polling or stored state. */
export function subscribeHealthDataChanges(refresh: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined
  let timer: ReturnType<typeof setTimeout> | null = null
  const changed = () => {
    if (timer != null) return
    timer = setTimeout(() => {
      timer = null
      refresh()
    }, 0)
  }
  window.addEventListener(HEALTH_DATA_CHANGED, changed)
  return () => {
    window.removeEventListener(HEALTH_DATA_CHANGED, changed)
    if (timer != null) clearTimeout(timer)
  }
}
