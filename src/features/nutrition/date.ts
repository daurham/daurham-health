import { addCalendarDays, calendarDateFromInstant } from '@/domain/progress/dates'
import { NUTRITION_CONFIG } from '@/domain/nutrition'
import { isCalendarDate } from '@/domain/training'

export function todayNutritionDate(now = new Date()): string {
  return calendarDateFromInstant(now, NUTRITION_CONFIG.calendarTimeZone)
}

export function parseNutritionDateParam(value: string | null, today = todayNutritionDate()): string {
  if (value && isCalendarDate(value)) {
    return value
  }
  return today
}

export function nutritionDateSearch(date: string): string {
  return `?date=${date}`
}

export function shiftNutritionDate(date: string, days: number): string {
  return addCalendarDays(date, days)
}

export function formatNutritionDayLabel(date: string, today = todayNutritionDate()): string {
  if (date === today) {
    return 'Today'
  }
  const [year, month, day] = date.split('-').map(Number)
  const utc = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1))
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(utc)
}
