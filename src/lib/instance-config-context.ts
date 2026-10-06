import { createContext, useContext } from 'react'
import type { PublicInstanceConfig } from '@/domain/instance-config'
import {
  DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
  healthCalendarDateFromNow,
} from '@/domain/time'

export const InstanceConfigContext = createContext<PublicInstanceConfig | null>(null)

export function useInstanceConfig(): PublicInstanceConfig | null {
  return useContext(InstanceConfigContext)
}

export function useHealthCalendarTimeZone(): string {
  return useInstanceConfig()?.calendarTimeZone ?? DEFAULT_HEALTH_CALENDAR_TIME_ZONE
}

export function useHealthCalendarDate(now = new Date()): string {
  return healthCalendarDateFromNow(now, useHealthCalendarTimeZone())
}
