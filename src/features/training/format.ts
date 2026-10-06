import { formatCompactCalendarDate } from '@/domain/calendar-format'
import { kilogramsToPounds, metersToMiles, secondsPerMile } from '@/domain/units'
import type { LoadState, TemplatePrescription, TrainingPerformanceBestView } from '@/domain/training'
import { formatPrescription } from '@/domain/training'

import { healthCalendarDateFromNow } from '@/domain/time'

export function localIsoDate(now = new Date(), timezone?: string): string {
  return healthCalendarDateFromNow(now, timezone)
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

export function formatPaceSecondsPerMile(value: number): string {
  const rounded = Math.round(value)
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, '0')}/mi`
}

function formatDurationSeconds(value: number): string {
  const rounded = Math.round(value)
  if (rounded < 60) return `${rounded}s`
  const minutes = Math.floor(rounded / 60)
  const seconds = rounded % 60
  return seconds === 0 ? `${minutes} min` : `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatTrainingPerformanceBest(best: TrainingPerformanceBestView): string {
  if (best.kind === 'reps') return `Best reps · ${Math.round(best.value)}`
  if (best.kind === 'duration') return `Longest duration · ${formatDurationSeconds(best.value)}`
  if (best.kind === 'distance') return `Longest distance · ${best.value.toLocaleString('en-US', { maximumFractionDigits: 2 })} mi`
  if (best.kind === 'pace') {
    const distance = best.distanceM == null
      ? ''
      : ` · over ${metersToMiles(best.distanceM).toLocaleString('en-US', { maximumFractionDigits: 2 })} mi`
    return `Fastest pace · ${formatPaceSecondsPerMile(best.value)}${distance}`
  }
  return 'Skill achieved'
}

export function formatSetPerformance(input: {
  reps: number | null
  durationSec: number | null
  leftReps: number | null
  rightReps: number | null
  leftDurationSec: number | null
  rightDurationSec: number | null
  distanceM?: number | null
  completed?: boolean | null
}): string {
  if (input.completed != null) {
    return input.completed ? 'Achieved' : 'Not yet'
  }
  if (input.distanceM != null) {
    const miles = metersToMiles(input.distanceM)
    const distance = `${miles.toLocaleString('en-US', { maximumFractionDigits: 2 })} mi`
    if (input.durationSec != null && input.durationSec > 0) {
      const pace = secondsPerMile(input.distanceM, input.durationSec)
      return pace == null ? `${distance} · ${input.durationSec}s` : `${distance} · ${input.durationSec}s · ${formatPaceSecondsPerMile(pace)}`
    }
    return distance
  }
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
