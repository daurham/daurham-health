const RELOAD_KEY = 'health:stale-chunk-reload'
const RELOAD_WINDOW_MS = 60_000

const STALE_CHUNK_PATTERNS = [
  /not a valid JavaScript MIME type/i,
  /failed to fetch dynamically imported module/i,
  /importing a module script failed/i,
  /error loading dynamically imported module/i,
  /chunkloaderror/i,
  /loading chunk .* failed/i,
]

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

type LocationLike = {
  pathname: string
  search: string
  hash: string
  reload: () => void
}

function errorText(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`
  }
  if (typeof error === 'string') {
    return error
  }
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message
  }
  return ''
}

export function isStaleChunkError(error: unknown): boolean {
  const text = errorText(error)
  return STALE_CHUNK_PATTERNS.some((pattern) => pattern.test(text))
}

export function reloadForStaleChunkOnce(
  error: unknown,
  options: {
    storage?: StorageLike
    location?: LocationLike
    now?: number
  } = {},
): boolean {
  if (!isStaleChunkError(error)) {
    return false
  }

  const runtimeWindow = typeof window === 'undefined' ? null : window
  const storage = options.storage ?? runtimeWindow?.sessionStorage
  const location = options.location ?? runtimeWindow?.location
  if (!storage || !location) {
    return false
  }
  const now = options.now ?? Date.now()
  const path = `${location.pathname}${location.search}${location.hash}`

  try {
    const raw = storage.getItem(RELOAD_KEY)
    if (raw) {
      const marker = JSON.parse(raw) as { path?: unknown; at?: unknown }
      if (marker.path === path && typeof marker.at === 'number' && now - marker.at < RELOAD_WINDOW_MS) {
        return false
      }
    }
    storage.setItem(RELOAD_KEY, JSON.stringify({ path, at: now }))
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }

  location.reload()
  return true
}

export function installStaleChunkRecovery(): () => void {
  if (typeof window === 'undefined') {
    return () => undefined
  }

  const onPreloadError = (event: Event) => {
    const payload = (event as Event & { payload?: unknown }).payload
    if (!isStaleChunkError(payload)) {
      return
    }
    event.preventDefault()
    reloadForStaleChunkOnce(payload)
  }

  window.addEventListener('vite:preloadError', onPreloadError)
  return () => window.removeEventListener('vite:preloadError', onPreloadError)
}
