import { calendarDateFromInstant } from '../progress/dates.js'
import { healthCalendarDateFromInstant } from '../time.js'
import { SLEEP_GAP_BOUNDARIES_MINUTES, SLEEP_SESSION_GAP_MINUTES, SLEEP_TIMEZONE } from './config.js'
import { intervalMs, type TimeInterval } from './intervals.js'
import { logicalSleepSource } from './sources.js'
import { isAsleepCategory, normalizeSleepAnalyticsCategory } from './stages.js'
import type { SleepAnalyticsCategory } from './config.js'

export type SleepIntervalRow = {
  id: string
  startAt: string
  endAt: string
  stage: string
  sourceCategory: string
  sourceName: string | null
  sourceVersion?: string | null
  deviceName?: string | null
  sourceId?: string | null
}

export type ClassifiedSleepInterval = {
  id: string
  startAt: string
  endAt: string
  startMs: number
  endMs: number
  category: SleepAnalyticsCategory
  sourceKey: string
  sourceName: string
  rawSourceName: string | null
}

export type SleepEpisode = {
  sourceKey: string
  sourceName: string
  startMs: number
  endMs: number
  startAt: string
  endAt: string
  sleepDate: string
  intervals: ClassifiedSleepInterval[]
}

export type SleepGapBucket = {
  maxMinutes: number | null
  count: number
}

export function classifySleepInterval(row: SleepIntervalRow): ClassifiedSleepInterval | null {
  const category = normalizeSleepAnalyticsCategory(row.stage, row.sourceCategory)
  const span = intervalMs(row.startAt, row.endAt)
  if (!category || !span) {
    return null
  }
  const source = logicalSleepSource(row.sourceName)
  return {
    id: row.id,
    startAt: row.startAt,
    endAt: row.endAt,
    startMs: span.startMs,
    endMs: span.endMs,
    category,
    sourceKey: source.key,
    sourceName: source.name,
    rawSourceName: row.sourceName,
  }
}

export function classifySleepIntervals(rows: readonly SleepIntervalRow[]): ClassifiedSleepInterval[] {
  return rows
    .map(classifySleepInterval)
    .filter((item): item is ClassifiedSleepInterval => item != null)
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs || left.id.localeCompare(right.id))
}

export function sessionizeSleepEpisodes(intervals: readonly ClassifiedSleepInterval[]): SleepEpisode[] {
  const bySource = new Map<string, ClassifiedSleepInterval[]>()
  for (const interval of intervals) {
    const list = bySource.get(interval.sourceKey) ?? []
    list.push(interval)
    bySource.set(interval.sourceKey, list)
  }
  const episodes: SleepEpisode[] = []
  const gapMs = SLEEP_SESSION_GAP_MINUTES * 60_000
  for (const [sourceKey, sourceIntervals] of bySource) {
    const sorted = [...sourceIntervals].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
    let current: ClassifiedSleepInterval[] = []
    let episodeEnd = Number.NEGATIVE_INFINITY
    for (const interval of sorted) {
      if (current.length > 0 && interval.startMs - episodeEnd > gapMs) {
        episodes.push(episodeFrom(sourceKey, current))
        current = []
      }
      current.push(interval)
      episodeEnd = Math.max(episodeEnd === Number.NEGATIVE_INFINITY ? interval.endMs : episodeEnd, interval.endMs)
    }
    if (current.length > 0) {
      episodes.push(episodeFrom(sourceKey, current))
    }
  }
  return episodes.sort((left, right) => left.endMs - right.endMs || left.startMs - right.startMs || left.sourceKey.localeCompare(right.sourceKey))
}

function episodeFrom(sourceKey: string, intervals: ClassifiedSleepInterval[]): SleepEpisode {
  const startMs = Math.min(...intervals.map((item) => item.startMs))
  const endMs = Math.max(...intervals.map((item) => item.endMs))
  return {
    sourceKey,
    sourceName: intervals[0]!.sourceName,
    startMs,
    endMs,
    startAt: new Date(startMs).toISOString(),
    endAt: new Date(endMs).toISOString(),
    sleepDate: healthCalendarDateFromInstant(new Date(endMs)),
    intervals,
  }
}

export function sleepDateFromEnd(endAt: string, timeZone = SLEEP_TIMEZONE): string {
  return calendarDateFromInstant(new Date(endAt), timeZone)
}

export function gapMinutes(previousEndMs: number, nextStartMs: number): number | null {
  if (nextStartMs <= previousEndMs) {
    return 0
  }
  return (nextStartMs - previousEndMs) / 60_000
}

export function sleepGapDistribution(intervals: readonly ClassifiedSleepInterval[]): SleepGapBucket[] {
  const gaps: number[] = []
  const bySource = new Map<string, ClassifiedSleepInterval[]>()
  for (const interval of intervals) {
    const list = bySource.get(interval.sourceKey) ?? []
    list.push(interval)
    bySource.set(interval.sourceKey, list)
  }
  for (const sourceIntervals of bySource.values()) {
    const sorted = [...sourceIntervals].sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs)
    for (let index = 1; index < sorted.length; index += 1) {
      const minutes = gapMinutes(sorted[index - 1]!.endMs, sorted[index]!.startMs)
      if (minutes != null && minutes > 0) {
        gaps.push(minutes)
      }
    }
  }
  const buckets: SleepGapBucket[] = SLEEP_GAP_BOUNDARIES_MINUTES.map((maxMinutes) => ({
    maxMinutes,
    count: gaps.filter((gap) => gap <= maxMinutes).length,
  }))
  buckets.push({
    maxMinutes: null,
    count: gaps.filter((gap) => gap > SLEEP_GAP_BOUNDARIES_MINUTES[SLEEP_GAP_BOUNDARIES_MINUTES.length - 1]!).length,
  })
  return buckets
}

export function episodeHasActualSleep(episode: SleepEpisode): boolean {
  return episode.intervals.some((item) => isAsleepCategory(item.category))
}

export function asTimeInterval(interval: ClassifiedSleepInterval): TimeInterval {
  return { startMs: interval.startMs, endMs: interval.endMs }
}
