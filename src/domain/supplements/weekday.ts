import { parseCalendarDateUtc } from '../progress/dates.js'

/**
 * ISO-week mask. Bit 0 is Monday and bit 6 is Sunday.
 * 127 means every day. The mask is applied to the Health calendar date,
 * not to the host timezone's local weekday.
 */
export const WEEKDAY_BITS = {
  monday: 1,
  tuesday: 2,
  wednesday: 4,
  thursday: 8,
  friday: 16,
  saturday: 32,
  sunday: 64,
} as const

export const EVERY_DAY_MASK = 127

export const WEEKDAYS = [
  { key: 'monday', label: 'Mon', bit: WEEKDAY_BITS.monday },
  { key: 'tuesday', label: 'Tue', bit: WEEKDAY_BITS.tuesday },
  { key: 'wednesday', label: 'Wed', bit: WEEKDAY_BITS.wednesday },
  { key: 'thursday', label: 'Thu', bit: WEEKDAY_BITS.thursday },
  { key: 'friday', label: 'Fri', bit: WEEKDAY_BITS.friday },
  { key: 'saturday', label: 'Sat', bit: WEEKDAY_BITS.saturday },
  { key: 'sunday', label: 'Sun', bit: WEEKDAY_BITS.sunday },
] as const

/** Monday = 0 ... Sunday = 6 for a date-only ISO value. */
export function weekdayIndexMondayZero(isoDate: string): number {
  const sundayZero = parseCalendarDateUtc(isoDate).getUTCDay()
  return sundayZero === 0 ? 6 : sundayZero - 1
}

export function weekdayBitForCalendarDate(isoDate: string): number {
  return 1 << weekdayIndexMondayZero(isoDate)
}

export function isWeekdayMask(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= EVERY_DAY_MASK
}

export function maskIncludesDate(mask: number, isoDate: string): boolean {
  return (mask & weekdayBitForCalendarDate(isoDate)) !== 0
}

export function formatWeekdayMask(mask: number): string {
  if (mask === EVERY_DAY_MASK) {
    return 'Every day'
  }
  return WEEKDAYS.filter((day) => (mask & day.bit) !== 0)
    .map((day) => day.label)
    .join(', ')
}
