import { PROGRESS_RANGES, type ProgressRange } from './types.js'
import { addCalendarDays, inclusiveDayCount } from './dates.js'

export const PROGRESS_RANGE_DAYS: Record<Exclude<ProgressRange, 'all'>, number> = {
  '30d': 30,
  '90d': 90,
  '6m': 183,
  '1y': 365,
}

export type TrailingPeriod = {
  range: ProgressRange
  start: string
  end: string
  dayCount: number
  comparisonStart: string | null
  comparisonEnd: string | null
}

export function isProgressRange(value: string): value is ProgressRange {
  return (PROGRESS_RANGES as readonly string[]).includes(value)
}

export function trailingPeriod(range: ProgressRange, asOf: string, earliestDate?: string | null): TrailingPeriod {
  if (range === 'all') {
    const start = earliestDate && earliestDate < asOf ? earliestDate : asOf
    return {
      range,
      start,
      end: asOf,
      dayCount: inclusiveDayCount(start, asOf),
      comparisonStart: null,
      comparisonEnd: null,
    }
  }
  const length = PROGRESS_RANGE_DAYS[range]
  const start = addCalendarDays(asOf, -(length - 1))
  const comparisonEnd = addCalendarDays(start, -1)
  const comparisonStart = addCalendarDays(comparisonEnd, -(length - 1))
  return {
    range,
    start,
    end: asOf,
    dayCount: length,
    comparisonStart,
    comparisonEnd,
  }
}

export function dateInInclusiveRange(date: string, start: string, end: string): boolean {
  return date >= start && date <= end
}
