import { convertDurationToMinutes, convertEnergyToKcal } from './units.js'

const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Apple's ActivitySummary dateComponents is already the device calendar day.
 * It is stored as that Health calendar date and is not shifted through UTC.
 * appleExerciseTime has no unit attribute in the export; Apple's value is minutes.
 * Goals are source context only and are never Health targets.
 */
export type AppleActivitySummary = {
  date: string
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  sourceContext: {
    activeEnergyGoalKcal: number | null
    exerciseGoalMinutes: number | null
    moveTimeMinutes: number | null
    moveTimeGoalMinutes: number | null
    standHours: number | null
    standHoursGoal: number | null
  }
}

export type ParsedActivitySummary =
  | { kind: 'summary'; summary: AppleActivitySummary }
  | { kind: 'skip'; reason: 'sentinel' | 'malformed' }

function optionalNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === '') {
    return null
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function optionalEnergy(value: string | undefined, unit: string | undefined): number | null {
  const parsed = optionalNumber(value)
  if (parsed == null || unit == null || unit.trim() === '') {
    return null
  }
  try {
    return convertEnergyToKcal(parsed, unit)
  } catch {
    return null
  }
}

function optionalExercise(value: string | undefined, unit: string | undefined): number | null {
  const parsed = optionalNumber(value)
  if (parsed == null) {
    return null
  }
  if (unit == null || unit.trim() === '') {
    return parsed
  }
  try {
    return convertDurationToMinutes(parsed, unit)
  } catch {
    return null
  }
}

function calendarDate(value: string | undefined): { date: string; sentinel: boolean } | null {
  if (!value) {
    return null
  }
  const match = CALENDAR_DATE.exec(value.trim())
  if (!match) {
    return null
  }
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const check = new Date(Date.UTC(year, month - 1, day))
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    return null
  }
  return { date: `${match[1]}-${match[2]}-${match[3]}`, sentinel: year < 2010 }
}

export function parseActivitySummaryTag(tag: string): ParsedActivitySummary {
  const attrs: Record<string, string> = {}
  const attr = /([A-Za-z0-9_]+)="([^"]*)"/g
  let match: RegExpExecArray | null
  while ((match = attr.exec(tag))) {
    attrs[match[1]!] = match[2] ?? ''
  }
  const date = calendarDate(attrs.dateComponents)
  if (!date) {
    return { kind: 'skip', reason: 'malformed' }
  }
  if (date.sentinel) {
    return { kind: 'skip', reason: 'sentinel' }
  }
  return {
    kind: 'summary',
    summary: {
      date: date.date,
      activeEnergyKcal: optionalEnergy(attrs.activeEnergyBurned, attrs.activeEnergyBurnedUnit),
      exerciseMinutes: optionalExercise(attrs.appleExerciseTime, attrs.appleExerciseTimeUnit),
      sourceContext: {
        activeEnergyGoalKcal: optionalEnergy(attrs.activeEnergyBurnedGoal, attrs.activeEnergyBurnedUnit),
        exerciseGoalMinutes: optionalExercise(attrs.appleExerciseTimeGoal, attrs.appleExerciseTimeUnit),
        moveTimeMinutes: optionalExercise(attrs.appleMoveTime, attrs.appleMoveTimeUnit),
        moveTimeGoalMinutes: optionalExercise(attrs.appleMoveTimeGoal, attrs.appleMoveTimeUnit),
        standHours: optionalNumber(attrs.appleStandHours),
        standHoursGoal: optionalNumber(attrs.appleStandHoursGoal),
      },
    },
  }
}
