import { healthCalendarDateFromNow } from '../src/domain/time.js'
import { getInstanceConfig } from './instance-config.js'

export async function healthCalendarTimeZone(): Promise<string> {
  return (await getInstanceConfig()).calendarTimeZone
}

export async function currentHealthDate(now = new Date()): Promise<string> {
  const timezone = await healthCalendarTimeZone()
  return healthCalendarDateFromNow(now, timezone)
}

export async function healthTimeContext(now = new Date()): Promise<{
  timezone: string
  date: string
}> {
  const timezone = await healthCalendarTimeZone()
  return {
    timezone,
    date: healthCalendarDateFromNow(now, timezone),
  }
}
