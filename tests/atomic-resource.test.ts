import { describe, expect, it } from 'vitest'
import {
  commitAtomicRequest,
  emptyAtomicTransition,
  failAtomicRequest,
  KeyedResourceCache,
  refreshAtomicRequest,
  replaceAtomicData,
  startAtomicRequest,
} from '../src/lib/atomic-resource.ts'

const SEP_21 = '2026-09-21'
const SEP_20 = '2026-09-20'
const SEP_19 = '2026-09-19'

type Day = { date: string; calories: number }

function day(date: string, calories: number): Day {
  return { date, calories }
}

describe('atomic keyed-resource transition', () => {
  it('does not change the committed date until the payload arrives', () => {
    const idle = emptyAtomicTransition<string, Day>()
    const loaded = commitAtomicRequest(startAtomicRequest(idle, SEP_21), SEP_21, day(SEP_21, 1420), 1)
    const pending = startAtomicRequest(loaded, SEP_20)
    expect(pending.committedKey).toBe(SEP_21)
    expect(pending.data).toEqual(day(SEP_21, 1420))
    expect(pending.pendingKey).toBe(SEP_20)
    expect(pending.data?.date).toBe(pending.committedKey)
  })

  it('commits the new date and payload together', () => {
    const loaded = commitAtomicRequest(
      startAtomicRequest(emptyAtomicTransition<string, Day>(), SEP_21),
      SEP_21,
      day(SEP_21, 1420),
      1,
    )
    const pending = startAtomicRequest(loaded, SEP_20)
    const committed = commitAtomicRequest(pending, SEP_20, day(SEP_20, 1800), pending.generation)
    expect(committed.committedKey).toBe(SEP_20)
    expect(committed.data).toEqual(day(SEP_20, 1800))
    expect(committed.pendingKey).toBeNull()
    expect(committed.data?.date).toBe(committed.committedKey)
  })

  it('ignores a stale response so the latest request wins', () => {
    const loaded = commitAtomicRequest(
      startAtomicRequest(emptyAtomicTransition<string, Day>(), SEP_21),
      SEP_21,
      day(SEP_21, 1420),
      1,
    )
    const first = startAtomicRequest(loaded, SEP_20)
    const second = startAtomicRequest(first, SEP_19)
    const stale = commitAtomicRequest(second, SEP_20, day(SEP_20, 1), first.generation)
    expect(stale).toBe(second)
    expect(stale.committedKey).toBe(SEP_21)
    expect(stale.data).toEqual(day(SEP_21, 1420))
    const latest = commitAtomicRequest(second, SEP_19, day(SEP_19, 900), second.generation)
    expect(latest.committedKey).toBe(SEP_19)
    expect(latest.data).toEqual(day(SEP_19, 900))
  })

  it('keeps the committed snapshot when the requested date fails', () => {
    const loaded = commitAtomicRequest(
      startAtomicRequest(emptyAtomicTransition<string, Day>(), SEP_21),
      SEP_21,
      day(SEP_21, 1420),
      1,
    )
    const pending = startAtomicRequest(loaded, SEP_20)
    const failed = failAtomicRequest(pending, SEP_20, 'network', pending.generation)
    expect(failed.committedKey).toBe(SEP_21)
    expect(failed.data).toEqual(day(SEP_21, 1420))
    expect(failed.pendingKey).toBeNull()
    expect(failed.error).toEqual({ key: SEP_20, message: 'network' })
  })

  it('refreshes the same key while keeping the committed payload visible', () => {
    const loaded = commitAtomicRequest(
      startAtomicRequest(emptyAtomicTransition<string, Day>(), SEP_21),
      SEP_21,
      day(SEP_21, 1420),
      1,
    )
    const refreshing = refreshAtomicRequest(loaded, SEP_21)
    expect(refreshing.committedKey).toBe(SEP_21)
    expect(refreshing.data).toEqual(day(SEP_21, 1420))
    expect(refreshing.pendingKey).toBe(SEP_21)
    expect(refreshing.generation).toBeGreaterThan(loaded.generation)
    const next = commitAtomicRequest(refreshing, SEP_21, day(SEP_21, 1680), refreshing.generation)
    expect(next.committedKey).toBe(SEP_21)
    expect(next.data).toEqual(day(SEP_21, 1680))
    expect(next.pendingKey).toBeNull()
    const failed = failAtomicRequest(refreshing, SEP_21, 'network', refreshing.generation)
    expect(failed.committedKey).toBe(SEP_21)
    expect(failed.data).toEqual(day(SEP_21, 1420))
    expect(failed.pendingKey).toBeNull()
  })

  it('replaces committed data without changing the key', () => {
    const loaded = commitAtomicRequest(
      startAtomicRequest(emptyAtomicTransition<string, Day>(), SEP_21),
      SEP_21,
      day(SEP_21, 1420),
      1,
    )
    const next = replaceAtomicData(loaded, (current) => ({ ...current, calories: 1600 }))
    expect(next.committedKey).toBe(SEP_21)
    expect(next.data?.calories).toBe(1600)
  })

  it('caches adjacent days and evicts the oldest past capacity', () => {
    const cache = new KeyedResourceCache<string, Day>(2)
    cache.set(SEP_19, day(SEP_19, 1))
    cache.set(SEP_20, day(SEP_20, 2))
    expect(cache.has(SEP_19)).toBe(true)
    cache.set(SEP_21, day(SEP_21, 3))
    expect(cache.has(SEP_19)).toBe(false)
    expect(cache.get(SEP_20)?.calories).toBe(2)
    expect(cache.get(SEP_21)?.calories).toBe(3)
  })
})
