import { addCalendarDays, calendarDaysBetween } from './progress/dates.js'
import { metricCatalogIndex, metricDefinition } from './body-manual.js'

export type CadenceStatus = 'current' | 'due' | 'stale' | 'initial_due'

export type CadenceConfig = {
  metricKey: string
  intervalDays: number
  enabledFrom: string
}

export type CadenceObservation = {
  metricKey: string
  calendarDate: string
  measuredAt: string
}

export type CadenceResolution = {
  metricKey: string
  status: CadenceStatus
  intervalDays: number
  lastMeasuredDate: string | null
  daysSinceLast: number | null
  dueDate: string
  daysOverdue: number
}

export type TodayBodyReminder = {
  metricKey: string
  label: string
  status: 'due' | 'stale' | 'initial_due'
  lastMeasuredDate: string | null
  daysSinceLast: number | null
  dueCount: number
}

const STATUS_RANK: Record<TodayBodyReminder['status'], number> = {
  stale: 0,
  initial_due: 1,
  due: 2,
}

export function latestCadenceObservation(
  observations: readonly CadenceObservation[],
  metricKey: string,
  asOf: string,
): CadenceObservation | null {
  const eligible = observations.filter((item) => item.metricKey === metricKey && item.calendarDate <= asOf)
  eligible.sort((left, right) => {
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? 1 : -1
    }
    if (left.measuredAt !== right.measuredAt) {
      return left.measuredAt < right.measuredAt ? 1 : -1
    }
    return 0
  })
  return eligible[0] ?? null
}

export function resolveCadence(
  config: CadenceConfig,
  observations: readonly CadenceObservation[],
  asOf: string,
): CadenceResolution {
  const latest = latestCadenceObservation(observations, config.metricKey, asOf)
  if (!latest) {
    return {
      metricKey: config.metricKey,
      status: 'initial_due',
      intervalDays: config.intervalDays,
      lastMeasuredDate: null,
      daysSinceLast: null,
      dueDate: config.enabledFrom,
      daysOverdue: asOf >= config.enabledFrom ? calendarDaysBetween(config.enabledFrom, asOf) : 0,
    }
  }
  const daysSinceLast = calendarDaysBetween(latest.calendarDate, asOf)
  const dueDate = addCalendarDays(latest.calendarDate, config.intervalDays)
  const status: CadenceStatus =
    daysSinceLast < config.intervalDays
      ? 'current'
      : daysSinceLast < config.intervalDays * 2
        ? 'due'
        : 'stale'
  return {
    metricKey: config.metricKey,
    status,
    intervalDays: config.intervalDays,
    lastMeasuredDate: latest.calendarDate,
    daysSinceLast,
    dueDate,
    daysOverdue: status === 'current' ? 0 : calendarDaysBetween(dueDate, asOf),
  }
}

export function selectTodayBodyReminder(
  configs: readonly CadenceConfig[],
  observations: readonly CadenceObservation[],
  asOf: string,
): TodayBodyReminder | null {
  const reminders = configs
    .map((config) => ({ config, resolution: resolveCadence(config, observations, asOf) }))
    .filter((item) => item.resolution.status !== 'current' && asOf >= item.config.enabledFrom)
    .sort((left, right) => {
      const leftStatus = left.resolution.status as TodayBodyReminder['status']
      const rightStatus = right.resolution.status as TodayBodyReminder['status']
      if (STATUS_RANK[leftStatus] !== STATUS_RANK[rightStatus]) {
        return STATUS_RANK[leftStatus] - STATUS_RANK[rightStatus]
      }
      if (left.resolution.daysOverdue !== right.resolution.daysOverdue) {
        return right.resolution.daysOverdue - left.resolution.daysOverdue
      }
      return metricCatalogIndex(left.config.metricKey) - metricCatalogIndex(right.config.metricKey)
    })
  const primary = reminders[0]
  if (!primary || primary.resolution.status === 'current') {
    return null
  }
  const definition = metricDefinition(primary.config.metricKey)
  return {
    metricKey: primary.config.metricKey,
    label: definition?.label ?? primary.config.metricKey,
    status: primary.resolution.status,
    lastMeasuredDate: primary.resolution.lastMeasuredDate,
    daysSinceLast: primary.resolution.daysSinceLast,
    dueCount: reminders.length,
  }
}

export function bodyReminderCopy(reminder: TodayBodyReminder): { title: string; detail: string; more: string | null } {
  const title =
    reminder.status === 'stale'
      ? `${reminder.label} measurement is stale`
      : reminder.status === 'initial_due'
        ? `${reminder.label} baseline measurement due`
        : `${reminder.label} measurement due`
  const detail =
    reminder.status === 'initial_due' || reminder.daysSinceLast == null
      ? 'No measurement recorded yet'
      : reminder.daysSinceLast === 1
        ? 'Last measured 1 day ago'
        : `Last measured ${reminder.daysSinceLast} days ago`
  const others = reminder.dueCount - 1
  const more =
    others <= 0 ? null : others === 1 ? '1 other measurement due' : `${others} other measurements due`
  return { title, detail, more }
}

export function measureHref(metricKey: string): string {
  return `/body?action=measure&metric=${encodeURIComponent(metricKey)}`
}
