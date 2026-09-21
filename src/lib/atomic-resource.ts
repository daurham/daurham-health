import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Atomic keyed-resource transition.
 *
 * Committed key and payload always change together. A pending selection never
 * renders with the previous payload. Progress ranges, Compare, Body history,
 * and future Apple Health views can reuse this without Nutrition-specific code.
 */
export type AtomicTransitionState<K, T> = {
  committedKey: K | null
  data: T | null
  pendingKey: K | null
  generation: number
  error: { key: K; message: string } | null
}

export function emptyAtomicTransition<K, T>(): AtomicTransitionState<K, T> {
  return {
    committedKey: null,
    data: null,
    pendingKey: null,
    generation: 0,
    error: null,
  }
}

export function startAtomicRequest<K, T>(
  state: AtomicTransitionState<K, T>,
  key: K,
): AtomicTransitionState<K, T> {
  if (state.committedKey === key && state.data != null && state.pendingKey == null) {
    return state
  }
  return {
    ...state,
    pendingKey: key,
    generation: state.generation + 1,
    error: state.error?.key === key ? null : state.error,
  }
}

export function commitAtomicRequest<K, T>(
  state: AtomicTransitionState<K, T>,
  key: K,
  data: T,
  generation: number,
): AtomicTransitionState<K, T> {
  if (generation !== state.generation) {
    return state
  }
  return {
    committedKey: key,
    data,
    pendingKey: null,
    generation: state.generation,
    error: null,
  }
}

export function failAtomicRequest<K, T>(
  state: AtomicTransitionState<K, T>,
  key: K,
  message: string,
  generation: number,
): AtomicTransitionState<K, T> {
  if (generation !== state.generation) {
    return state
  }
  return {
    ...state,
    pendingKey: null,
    error: { key, message },
  }
}

export function replaceAtomicData<K, T>(
  state: AtomicTransitionState<K, T>,
  updater: (current: T) => T,
): AtomicTransitionState<K, T> {
  if (state.data == null || state.committedKey == null) {
    return state
  }
  return { ...state, data: updater(state.data) }
}

export class KeyedResourceCache<K, T> {
  private readonly items = new Map<K, T>()
  private readonly maxSize: number

  constructor(maxSize = 16) {
    this.maxSize = maxSize
  }

  get(key: K): T | undefined {
    return this.items.get(key)
  }

  has(key: K): boolean {
    return this.items.has(key)
  }

  set(key: K, value: T): void {
    if (this.items.has(key)) {
      this.items.delete(key)
    }
    this.items.set(key, value)
    while (this.items.size > this.maxSize) {
      const oldest = this.items.keys().next().value
      if (oldest === undefined) {
        break
      }
      this.items.delete(oldest)
    }
  }
}

export function useAtomicKeyedResource<K, T>(options: {
  requestedKey: K
  load: (key: K, signal: AbortSignal) => Promise<T>
  prefetchKeys?: (committedKey: K) => K[]
  indicatorDelayMs?: number
}): {
  committedKey: K | null
  data: T | null
  pendingKey: K | null
  isPending: boolean
  pendingVisible: boolean
  error: { key: K; message: string } | null
  retry: () => void
  replaceData: (updater: (current: T) => T) => void
} {
  const { requestedKey, load, prefetchKeys, indicatorDelayMs = 150 } = options
  const [state, setState] = useState<AtomicTransitionState<K, T>>(() => emptyAtomicTransition())
  const [retryNonce, setRetryNonce] = useState(0)
  const [pendingVisible, setPendingVisible] = useState(false)
  const cacheRef = useRef(new KeyedResourceCache<K, T>())
  const loadRef = useRef(load)
  const prefetchRef = useRef(prefetchKeys)
  const stateRef = useRef(state)
  loadRef.current = load
  prefetchRef.current = prefetchKeys
  stateRef.current = state

  const replaceData = useCallback((updater: (current: T) => T) => {
    setState((current) => {
      const next = replaceAtomicData(current, updater)
      if (next.committedKey != null && next.data != null) {
        cacheRef.current.set(next.committedKey, next.data)
      }
      return next
    })
  }, [])

  useEffect(() => {
    const current = stateRef.current
    if (current.committedKey === requestedKey && current.data != null && current.pendingKey == null) {
      return
    }
    const cached = cacheRef.current.get(requestedKey)
    if (cached !== undefined) {
      const started = startAtomicRequest(current, requestedKey)
      const committed = commitAtomicRequest(started, requestedKey, cached, started.generation)
      stateRef.current = committed
      setState(committed)
      return
    }
    const started = startAtomicRequest(current, requestedKey)
    const generation = started.generation
    stateRef.current = started
    setState(started)
    const controller = new AbortController()
    void loadRef
      .current(requestedKey, controller.signal)
      .then((data) => {
        cacheRef.current.set(requestedKey, data)
        setState((latest) => commitAtomicRequest(latest, requestedKey, data, generation))
      })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) {
          return
        }
        const message = caught instanceof Error ? caught.message : 'Could not load'
        setState((latest) => failAtomicRequest(latest, requestedKey, message, generation))
      })
    return () => {
      controller.abort()
    }
  }, [requestedKey, retryNonce])

  useEffect(() => {
    const key = state.committedKey
    const keys = key && prefetchRef.current ? prefetchRef.current(key) : []
    if (!key || keys.length === 0) {
      return
    }
    const controller = new AbortController()
    for (const nextKey of keys) {
      if (nextKey === key || cacheRef.current.has(nextKey)) {
        continue
      }
      void loadRef
        .current(nextKey, controller.signal)
        .then((data) => {
          if (!controller.signal.aborted) {
            cacheRef.current.set(nextKey, data)
          }
        })
        .catch(() => undefined)
    }
    return () => {
      controller.abort()
    }
  }, [state.committedKey])

  const isPending = state.pendingKey != null && state.pendingKey !== state.committedKey

  useEffect(() => {
    if (!isPending) {
      setPendingVisible(false)
      return
    }
    const timer = window.setTimeout(() => {
      setPendingVisible(true)
    }, indicatorDelayMs)
    return () => {
      window.clearTimeout(timer)
    }
  }, [isPending, indicatorDelayMs])

  return {
    committedKey: state.committedKey,
    data: state.data,
    pendingKey: state.pendingKey,
    isPending,
    pendingVisible,
    error: state.error,
    retry: () => setRetryNonce((value) => value + 1),
    replaceData,
  }
}
