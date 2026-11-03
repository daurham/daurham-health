import { useEffect, useState } from 'react'
import { addCalendarDays } from '@/domain/progress/dates'
import { healthCalendarDateFromNow, instantAtStartOfCalendarDate } from '@/domain/time'

/** True next midnight in the instance's calendar timezone (including DST). */
export function nextHealthMidnight(now: Date, timeZone: string): Date {
  return instantAtStartOfCalendarDate(addCalendarDays(healthCalendarDateFromNow(now, timeZone), 1), timeZone)
}

/** Check at midnight, tab resume, and window focus; no recurring polling. */
export function useHealthCalendarDay(timeZone: string): string {
  const [snapshot, setSnapshot] = useState(() => ({
    timeZone, day: healthCalendarDateFromNow(new Date(), timeZone),
  }))
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const sync = () => {
      if (timer !== undefined) clearTimeout(timer)
      const now = new Date()
      const day = healthCalendarDateFromNow(now, timeZone)
      setSnapshot((old) => old.timeZone === timeZone && old.day === day ? old : { timeZone, day })
      const delay = nextHealthMidnight(now, timeZone).getTime() - now.getTime() + 50
      timer = setTimeout(sync, Math.min(2_147_483_647, Math.max(250, delay)))
    }
    const onVisible = () => { if (!document.hidden) sync() }
    sync()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [timeZone])
  return snapshot.timeZone === timeZone
    ? snapshot.day
    : healthCalendarDateFromNow(new Date(), timeZone)
}
