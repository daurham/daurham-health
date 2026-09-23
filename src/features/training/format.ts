import { formatCompactCalendarDate } from '@/domain/calendar-format'
import { kilogramsToPounds } from '@/domain/units'
import type { LoadState, TemplatePrescription } from '@/domain/training'
import { formatPrescription } from '@/domain/training'

import { healthCalendarDateFromNow } from '@/domain/time'

export function localIsoDate(now = new Date()): string {
  return healthCalendarDateFromNow(now)
}

export function formatWorkoutDate(isoDate: string): string {
  return formatCompactCalendarDate(isoDate)
}

export function formatPounds(kg: number | null | undefined): string {
  if (kg == null) {
    return '—'
  }
  return kilogramsToPounds(kg).toLocaleString('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  })
}

export function formatLoad(loadState: LoadState, weightKg: number | null): string {
  if (loadState === 'bodyweight') {
    return 'BW'
  }
  if (loadState === 'unknown') {
    return '?'
  }
  return `${formatPounds(weightKg)} lb`
}

export function formatSetPerformance(input: {
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
}): string {
  if (input.reps != null) {
    return `${input.reps}`
  }
  if (input.durationSec != null) {
    return `${input.durationSec}s`
  }
  if (input.leftReps != null || input.rightReps != null) {
    return `L ${input.leftReps ?? '—'} · R ${input.rightReps ?? '—'}`
  }
  if (input.leftDurationSec != null || input.rightDurationSec != null) {
    return `L ${input.leftDurationSec ?? '—'}s · R ${input.rightDurationSec ?? '—'}s`
  }
  return '—'
}

export { formatPrescription }
export type { TemplatePrescription }
