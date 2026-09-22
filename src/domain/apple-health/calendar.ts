import { HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromInstant } from '../time.js'

/** Phoenix is UTC−7 all year, so a Health midnight is 07:00 UTC. */
const PHOENIX_UTC_OFFSET_HOURS = 7

export function addIsoDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split('-').map(Number)
  const shifted = new Date(Date.UTC(year!, (month ?? 1) - 1, (day ?? 1) + days))
  return shifted.toISOString().slice(0, 10)
}

export function phoenixDayStartMs(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number)
  return Date.UTC(year!, (month ?? 1) - 1, day, PHOENIX_UTC_OFFSET_HOURS, 0, 0, 0)
}

export function phoenixCalendarDate(instantMs: number): string {
  return healthCalendarDateFromInstant(new Date(instantMs))
}

export function healthTimeZone(): string {
  return HEALTH_CALENDAR_TIME_ZONE
}

export type TimedSample = {
  sourceName: string
  startMs: number
  endMs: number
  value: number
}

/**
 * Split a sample at America/Phoenix midnights.
 * Value is prorated by duration. The result is still Health-derived:
 * it is not Apple's own daily total.
 */
export function splitSampleOnPhoenixDays(sample: TimedSample): TimedSample[] {
  const startMs = sample.startMs
  const endMs = sample.endMs
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs || !Number.isFinite(sample.value)) {
    return []
  }
  if (endMs === startMs) {
    return [{ ...sample, sourceName: sample.sourceName }]
  }
  const pieces: TimedSample[] = []
  const total = endMs - startMs
  let cursor = startMs
  while (cursor < endMs) {
    const date = phoenixCalendarDate(cursor)
    const dayEnd = phoenixDayStartMs(addIsoDays(date, 1))
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
