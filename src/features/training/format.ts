import { kilogramsToPounds } from '@/domain/units'
import type { LoadState, TemplatePrescription } from '@/domain/training'
import { formatPrescription } from '@/domain/training'

export function localIsoDate(now = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatWorkoutDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!match) {
    return isoDate
  }
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date)
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
