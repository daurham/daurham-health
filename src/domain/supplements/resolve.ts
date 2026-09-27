import { addCalendarDays } from '../progress/dates.js'
import { SupplementInputError } from './errors.js'
import type {
  AdherenceSummary,
  AdherenceWindow,
  LifecycleStatus,
  OccurrenceState,
  ScheduleWindow,
  StatusEventWindow,
  SupplementDaySummary,
  TodaySupplementInput,
  TodaySupplementItem,
  TodaySupplementSection,
} from './types.js'
import { maskIncludesDate } from './weekday.js'

export function lifecycleStatusOnDate(
  events: readonly StatusEventWindow[],
  date: string,
): LifecycleStatus | null {
  let best: StatusEventWindow | null = null
  for (const event of events) {
    if (event.effectiveDate > date) {
      continue
    }
    if (!best || event.effectiveDate >= best.effectiveDate) {
      best = event
    }
  }
  return best?.status ?? null
}

export function scheduleCoversDate(schedule: ScheduleWindow, date: string): boolean {
  if (date < schedule.effectiveFrom) {
    return false
  }
  if (schedule.effectiveThrough != null && date > schedule.effectiveThrough) {
    return false
  }
  return maskIncludesDate(schedule.weekdayMask, date)
}

/**
 * Resolve one schedule occurrence.
 * No adherence row stays unknown. Paused and discontinued never become skipped.
 */
export function resolveOccurrence(input: {
  events: readonly StatusEventWindow[]
  schedule: ScheduleWindow
  date: string
  adherence: { status: 'taken' | 'skipped' } | null
}): OccurrenceState {
  const lifecycle = lifecycleStatusOnDate(input.events, input.date)
  if (lifecycle === 'paused') {
    return 'paused'
  }
  if (lifecycle !== 'active') {
    return 'not_scheduled'
  }
  if (!scheduleCoversDate(input.schedule, input.date)) {
    return 'not_scheduled'
  }
  if (input.adherence?.status === 'taken') {
    return 'taken'
  }
  if (input.adherence?.status === 'skipped') {
    return 'skipped'
  }
  return 'unknown'
}

export function aggregateOccurrenceStates(states: readonly OccurrenceState[]): AdherenceSummary {
  let takenCount = 0
  let skippedCount = 0
  let unknownCount = 0
  for (const state of states) {
    if (state === 'taken') {
      takenCount += 1
    } else if (state === 'skipped') {
      skippedCount += 1
    } else if (state === 'unknown') {
      unknownCount += 1
    }
  }
  const scheduledCount = takenCount + skippedCount + unknownCount
  return {
    scheduledCount,
    takenCount,
    skippedCount,
    unknownCount: scheduledCount - takenCount - skippedCount,
    recordedCount: takenCount + skippedCount,
    adherenceRatio: scheduledCount === 0 ? null : takenCount / scheduledCount,
    captureCoverageRatio: scheduledCount === 0 ? null : (takenCount + skippedCount) / scheduledCount,
  }
}

export function eachCalendarDate(start: string, end: string): string[] {
  if (end < start) {
    return []
  }
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addCalendarDays(cursor, 1)
    if (dates.length > 3660) {
      throw new SupplementInputError('Date range is too long')
    }
  }
  return dates
}

export function resolveScheduleRange(input: {
  schedules: readonly ScheduleWindow[]
  events: readonly StatusEventWindow[]
  adherence: readonly AdherenceWindow[]
  start: string
  end: string
}): OccurrenceState[] {
  const states: OccurrenceState[] = []
  for (const date of eachCalendarDate(input.start, input.end)) {
    for (const schedule of input.schedules) {
      const observation =
        input.adherence.find((item) => item.scheduleId === schedule.id && item.scheduledDate === date) ?? null
      states.push(
        resolveOccurrence({
          events: input.events,
          schedule,
          date,
          adherence: observation,
        }),
      )
    }
  }
  return states
}

export function supplementDaySummary(counts: {
  scheduledCount: number
  skippedCount: number
  unknownCount: number
}): SupplementDaySummary {
  if (counts.scheduledCount === 0) {
    return { kind: 'unscheduled' }
  }
  if (counts.unknownCount > 0) {
    return { kind: 'remaining', unknownCount: counts.unknownCount }
  }
  if (counts.skippedCount > 0) {
    return { kind: 'recorded', skippedCount: counts.skippedCount }
  }
  return { kind: 'complete' }
}

export function supplementSummaryText(summary: SupplementDaySummary): string {
  if (summary.kind === 'unscheduled') {
    return 'Nothing scheduled today'
  }
  if (summary.kind === 'remaining') {
    return summary.unknownCount === 1 ? '1 remaining' : `${summary.unknownCount} remaining`
  }
  if (summary.kind === 'recorded') {
    return summary.skippedCount === 1
      ? 'Supplements recorded · 1 skipped'
      : `Supplements recorded · ${summary.skippedCount} skipped`
  }
  return 'Supplements complete'
}

export function checkboxAdherenceAction(state: TodaySupplementItem['state']): 'taken' | 'clear' {
  return state === 'taken' ? 'clear' : 'taken'
}

function adherenceFor(scheduleId: string, date: string, rows: readonly AdherenceWindow[]): AdherenceWindow | null {
  return rows.find((item) => item.scheduleId === scheduleId && item.scheduledDate === date) ?? null
}

export function buildTodaySupplementSection(
  date: string,
  supplements: readonly TodaySupplementInput[],
): TodaySupplementSection | null {
  if (supplements.length === 0) {
    return null
  }
  const items: TodaySupplementItem[] = []
  const ordered = [...supplements].sort((left, right) => {
    if (left.sortOrder !== right.sortOrder) {
      return left.sortOrder - right.sortOrder
    }
    if (left.name !== right.name) {
      return left.name < right.name ? -1 : 1
    }
    return left.id < right.id ? -1 : 1
  })
  for (const supplement of ordered) {
    const schedules = [...supplement.schedules].sort((left, right) => {
      if (left.sortOrder !== right.sortOrder) {
        return left.sortOrder - right.sortOrder
      }
      const leftSlot = left.slotLabel ?? ''
      const rightSlot = right.slotLabel ?? ''
      if (leftSlot !== rightSlot) {
        return leftSlot < rightSlot ? -1 : 1
      }
      return left.id < right.id ? -1 : 1
    })
    for (const schedule of schedules) {
      const observation = adherenceFor(schedule.id, date, supplement.adherence)
      const state = resolveOccurrence({
        events: supplement.events,
        schedule,
        date,
        adherence: observation,
      })
      if (state !== 'taken' && state !== 'skipped' && state !== 'unknown') {
        continue
      }
      items.push({
        scheduleId: schedule.id,
        supplementId: supplement.id,
        name: supplement.name,
        slotLabel: schedule.slotLabel,
        plannedDoseAmount: schedule.doseAmount,
        plannedDoseUnit: schedule.doseUnit,
        actualDoseAmount: observation?.actualDoseAmount ?? null,
        actualDoseUnit: observation?.actualDoseUnit ?? null,
        state,
      })
    }
  }
  const counts = aggregateOccurrenceStates(items.map((item) => item.state))
  return {
    scheduledCount: counts.scheduledCount,
    takenCount: counts.takenCount,
    skippedCount: counts.skippedCount,
    unknownCount: counts.unknownCount,
    summary: supplementDaySummary(counts),
    items,
  }
}
