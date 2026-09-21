import { isCalendarDate } from '../training.js'

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MS_PER_DAY = 86_400_000

export function parseCalendarDateUtc(value: string): Date {
  if (!isCalendarDate(value)) {
    throw new Error(`Invalid calendar date: ${value}`)
  }
  const match = ISO_DATE.exec(value)
  if (!match) {
    throw new Error(`Invalid calendar date: ${value}`)
  }
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
}

export function formatCalendarDateUtc(date: Date): string {
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addCalendarDays(isoDate: string, days: number): string {
  const utc = parseCalendarDateUtc(isoDate)
  return formatCalendarDateUtc(new Date(utc.getTime() + days * MS_PER_DAY))
}

export function calendarDaysBetween(start: string, end: string): number {
  return Math.round((parseCalendarDateUtc(end).getTime() - parseCalendarDateUtc(start).getTime()) / MS_PER_DAY)
}

export function inclusiveDayCount(start: string, end: string): number {
  return calendarDaysBetween(start, end) + 1
}

export function calendarDateFromInstant(instant: Date, timeZone: string | null): string {
  if (timeZone && timeZone.trim() !== '') {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timeZone.trim(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(instant)
      const map = Object.fromEntries(parts.map((part) => [part.type, part.value]))
      const iso = `${map.year}-${map.month}-${map.day}`
      if (isCalendarDate(iso)) {
        return iso
      }
    } catch {
      // Fall through to UTC calendar date.
    }
  }
  return formatCalendarDateUtc(instant)
}

export function utcCalendarDateFromNow(now: Date): string {
  return formatCalendarDateUtc(now)
}

export function compareIsoDateTime(left: string, right: string): number {
  if (left < right) {
    return -1
  }
  if (left > right) {
    return 1
  }
  return 0
}
