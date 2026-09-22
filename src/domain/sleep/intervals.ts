export type TimeInterval = {
  startMs: number
  endMs: number
}

export function intervalMs(startAt: string, endAt: string): TimeInterval | null {
  const startMs = Date.parse(startAt)
  const endMs = Date.parse(endAt)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) {
    return null
  }
  return { startMs, endMs }
}

export function mergeIntervals(intervals: readonly TimeInterval[]): TimeInterval[] {
  const valid = intervals.filter((item) => Number.isFinite(item.startMs) && Number.isFinite(item.endMs) && item.endMs >= item.startMs)
  if (valid.length === 0) {
    return []
  }
  const sorted = [...valid].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
  const merged: TimeInterval[] = [{ ...sorted[0]! }]
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index]!
    const last = merged[merged.length - 1]!
    if (current.startMs <= last.endMs) {
      last.endMs = Math.max(last.endMs, current.endMs)
    } else {
      merged.push({ ...current })
    }
  }
  return merged
}

export function unionMinutes(intervals: readonly TimeInterval[]): number {
  return mergeIntervals(intervals).reduce((sum, item) => sum + (item.endMs - item.startMs), 0) / 60_000
}

export function intersectIntervals(left: readonly TimeInterval[], right: readonly TimeInterval[]): TimeInterval[] {
  const a = mergeIntervals(left)
  const b = mergeIntervals(right)
  const out: TimeInterval[] = []
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const startMs = Math.max(a[i]!.startMs, b[j]!.startMs)
    const endMs = Math.min(a[i]!.endMs, b[j]!.endMs)
    if (endMs > startMs) {
      out.push({ startMs, endMs })
    }
    if (a[i]!.endMs < b[j]!.endMs) {
      i += 1
    } else {
      j += 1
    }
  }
  return out
}

export function minutesOrNull(intervals: readonly TimeInterval[]): number | null {
  if (intervals.length === 0) {
    return null
  }
  return unionMinutes(intervals)
}
