import { calendarDateFromInstant } from './progress/dates.js'

const WALL_CLOCK =
  /^(\d{1,2})\/(\d{1,2})\/(\d{4})[ T](\d{1,2}):(\d{2}):(\d{2})$/

/**
 * Backward-compatible default for the original owner deployment.
 * Runtime server flows pass the configured instance timezone explicitly.
 */
export const DEFAULT_HEALTH_CALENDAR_TIME_ZONE = 'America/Phoenix'

/** @deprecated Prefer DEFAULT_HEALTH_CALENDAR_TIME_ZONE or an explicit configured timezone. */
export const HEALTH_CALENDAR_TIME_ZONE = DEFAULT_HEALTH_CALENDAR_TIME_ZONE

export function healthCalendarDateFromInstant(
  instant: Date,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  return calendarDateFromInstant(instant, assertIanaTimeZone(timeZone))
}

export function healthCalendarDateFromNow(
  now = new Date(),
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): string {
  return healthCalendarDateFromInstant(now, timeZone)
}

export function assertIanaTimeZone(timeZone: string): string {
  const value = timeZone.trim()
  if (value.length === 0 || value.length > 64 || value.includes('..')) {
    throw new Error('Invalid timezone')
  }
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date())
  } catch {
    throw new Error('Invalid timezone')
  }
  return value
}

export function instantAtStartOfCalendarDate(
  isoDate: string,
  timeZone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) {
    throw new Error('Date must be YYYY-MM-DD')
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('Date must be YYYY-MM-DD')
  }
  const zone = assertIanaTimeZone(timeZone)
  const utcGuess = Date.UTC(year, month - 1, day)
  const offset1 = timeZoneOffsetMs(new Date(utcGuess), zone)
  let instant = utcGuess - offset1
  const offset2 = timeZoneOffsetMs(new Date(instant), zone)
  if (offset1 !== offset2) {
    instant = utcGuess - offset2
  }
  return new Date(instant)
}

function timeZoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  const asUtc = Date.UTC(
    Number(map.year),
    Number(map.month) - 1,
    Number(map.day),
    Number(map.hour),
    Number(map.minute),
    Number(map.second),
  )
  return asUtc - date.getTime()
}

export function parseWallClockInTimeZone(
  input: string,
  timeZone: string,
): Date {
  const zone = assertIanaTimeZone(timeZone)
  const match = WALL_CLOCK.exec(input.trim())
  if (!match) {
    throw new Error('Measure Time must be MM/DD/YYYY HH:MM:SS')
  }

  const month = Number(match[1])
  const day = Number(match[2])
  const year = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error('Measure Time must be MM/DD/YYYY HH:MM:SS')
  }

  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second)
  const offset1 = timeZoneOffsetMs(new Date(utcGuess), zone)
  let instant = utcGuess - offset1
  const offset2 = timeZoneOffsetMs(new Date(instant), zone)
  if (offset1 !== offset2) {
    instant = utcGuess - offset2
  }

  const verify = timeZoneOffsetMs(new Date(instant), zone)
  const wall = new Date(instant + verify)
  if (
    wall.getUTCFullYear() !== year ||
    wall.getUTCMonth() + 1 !== month ||
    wall.getUTCDate() !== day ||
    wall.getUTCHours() !== hour ||
    wall.getUTCMinutes() !== minute ||
    wall.getUTCSeconds() !== second
  ) {
    throw new Error('Measure Time is not a valid local time in the given timezone')
  }

  return new Date(instant)
}
