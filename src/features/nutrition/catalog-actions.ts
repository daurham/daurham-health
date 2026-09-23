import { formatCompactCalendarDate } from '@/domain/calendar-format'
import { todayNutritionDate } from './date'

export function addToDateLabel(date: string, today = todayNutritionDate()): string {
  return date === today ? 'Add to Today' : `Add to ${formatCompactCalendarDate(date)}`
}

export function catalogActionHelp(date: string, today = todayNutritionDate()): string {
  const addLabel = addToDateLabel(date, today)
  const logged = date === today ? 'today' : formatCompactCalendarDate(date)
  return `Save for later adds this food to My Foods without logging it. ${addLabel} also logs it for ${logged}.`
}
