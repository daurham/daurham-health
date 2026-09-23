const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

export type CalendarDateParts = {
  year: number
  month: number
  day: number
}

/** Parse a date-only value. This does not construct a local or UTC instant. */
export function calendarDateParts(isoDate: string): CalendarDateParts | null {
  const match = ISO_DATE.exec(isoDate)
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }
  return { year, month, day }
}

function weekdayName(parts: CalendarDateParts): string {
  const index = new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay()
  return WEEKDAYS[index] ?? 'Day'
}

export function formatCompactCalendarDate(isoDate: string): string {
  const parts = calendarDateParts(isoDate)
  if (!parts) {
    return isoDate
  }
  return `${MONTHS[parts.month - 1]} ${parts.day}`
}

export function formatFullCalendarDate(isoDate: string): string {
  const parts = calendarDateParts(isoDate)
  if (!parts) {
    return isoDate
  }
  return `${MONTHS[parts.month - 1]} ${parts.day}, ${parts.year}`
}

export function formatWeekdayCalendarDate(isoDate: string): string {
  const parts = calendarDateParts(isoDate)
  if (!parts) {
    return isoDate
  }
  return `${weekdayName(parts)}, ${MONTHS[parts.month - 1]} ${parts.day}`
}

export function formatCalendarRange(start: string, end: string): string {
  const left = calendarDateParts(start)
  const right = calendarDateParts(end)
  if (!left || !right) {
    return `${start}–${end}`
  }
  if (left.year === right.year && left.month === right.month) {
    return `${MONTHS[left.month - 1]} ${left.day}–${right.day}`
  }
  if (left.year === right.year) {
    return `${MONTHS[left.month - 1]} ${left.day}–${MONTHS[right.month - 1]} ${right.day}`
  }
  return `${formatFullCalendarDate(start)}–${formatFullCalendarDate(end)}`
}
