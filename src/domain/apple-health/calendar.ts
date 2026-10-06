import {
  DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
  healthCalendarDateFromInstant,
  instantAtStartOfCalendarDate,
} from '../time.js'

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

export function healthDayStartMs(
  isoDate: string,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): number {
  return instantAtStartOfCalendarDate(isoDate, timeZone).getTime()
}

export function healthCalendarDate(
  instantMs: number,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  return healthCalendarDateFromInstant(new Date(instantMs), timeZone)
}

export function healthTimeZone(
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  return timeZone
}

export type TimedSample = {
  sourceName: string
  startMs: number
  endMs: number
  value: number
}

/**
 * Split a sample at Health-calendar midnights in the configured IANA timezone.
 * Value is prorated by duration. The result is still Health-derived:
 * it is not Apple's own daily total.
 */
export function splitSampleOnHealthDays(
  sample: TimedSample,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): TimedSample[] {
  const startMs = sample.startMs
  const endMs = sample.endMs
  if (
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs < startMs ||
    !Number.isFinite(sample.value)
  ) {
    return []
  }
  if (endMs === startMs) {
    return [{ ...sample, sourceName: sample.sourceName }]
  }
  const pieces: TimedSample[] = []
  const total = endMs - startMs
  let cursor = startMs
  while (cursor < endMs) {
    const date = healthCalendarDate(cursor, timeZone)
    const dayEnd = healthDayStartMs(addIsoDays(date, 1), timeZone)
    const pieceEnd = Math.min(endMs, dayEnd)
    if (pieceEnd <= cursor) {
      break
    }
    const uncovered = pieceEnd - cursor
    pieces.push({
      sourceName: sample.sourceName,
      startMs: cursor,
      endMs: pieceEnd,
      value: uncovered === total ? sample.value : (sample.value * uncovered) / total,
    })
    cursor = pieceEnd
  }
  return pieces
}

/**
 * Backward-compatible aliases retained for tests and older scripts.
 * New runtime code should use the generic Health-calendar functions.
 */
export function phoenixDayStartMs(isoDate: string): number {
  return healthDayStartMs(isoDate, DEFAULT_HEALTH_CALENDAR_TIME_ZONE)
}

export function phoenixCalendarDate(instantMs: number): string {
  return healthCalendarDate(instantMs, DEFAULT_HEALTH_CALENDAR_TIME_ZONE)
}

export function splitSampleOnPhoenixDays(sample: TimedSample): TimedSample[] {
  return splitSampleOnHealthDays(sample, DEFAULT_HEALTH_CALENDAR_TIME_ZONE)
}
