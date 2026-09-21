import { displayValueForMetric } from '@/domain/body-metrics'
import type { CanonicalUnit } from '@/domain/body-metrics'
import type { CanonicalEvidence, LatestPerformance, PrAchievement } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import { formatPounds, formatWorkoutDate } from '@/features/training/format'

export function formatKgAsLb(kg: number | null | undefined): string {
  if (kg == null) {
    return '—'
  }
  return `${formatPounds(kg)} lb`
}

export function formatDurationSec(durationSec: number | null | undefined): string {
  if (durationSec == null) {
    return '—'
  }
  return `${durationSec}s`
}

export function formatReps(reps: number | null | undefined): string {
  if (reps == null) {
    return '—'
  }
  return String(reps)
}

export function formatCalendarDate(isoDate: string): string {
  return formatWorkoutDate(isoDate)
}

export function formatSigned(value: number, digits = 1, unit = ''): string {
  const formatted = value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
    signDisplay: 'exceptZero',
  })
  return unit ? `${formatted} ${unit}` : formatted
}

export function formatPercent(value: number): string {
  return `${value.toLocaleString('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
    signDisplay: 'exceptZero',
  })}%`
}

export function formatBodyCanonical(unit: string, value: number, digits = 1): string {
  const display = displayValueForMetric(unit as CanonicalUnit, value)
  const formatted = display.value.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  })
  if (display.unit === '%') {
    return `${formatted}%`
  }
  if (display.unit === 'ratio' || display.unit === 'index') {
    return formatted
  }
  return `${formatted} ${display.unit}`
}

export function formatBodyMetricChange(unit: string, change: number | null | undefined): string {
  if (change == null) {
    return '—'
  }
  if (unit === 'kg') {
    return formatSigned(kilogramsToPounds(change), 1, 'lb')
  }
  if (unit === 'percent') {
    return formatSigned(change, 1, '%')
  }
  return formatSigned(change, 1, unit === 'ratio' || unit === 'index' ? '' : unit)
}

export function formatPerformed(input: {
  loadKg: number | null | undefined
  reps?: number | null
  durationSec?: number | null
  leftReps?: number | null
  rightReps?: number | null
}): string {
  const load = formatKgAsLb(input.loadKg)
  if (input.durationSec != null) {
    return `${load} × ${formatDurationSec(input.durationSec)}`
  }
  if (input.leftReps != null || input.rightReps != null) {
    return `${load} × L ${input.leftReps ?? '—'} · R ${input.rightReps ?? '—'}`
  }
  if (input.reps != null) {
    return `${load} × ${input.reps}`
  }
  return load
}

export function formatLatestPerformance(latest: LatestPerformance | null): string {
  if (!latest) {
    return 'No recorded performance yet'
  }
  return formatPerformed(latest)
}

export function formatEvidenceSet(item: CanonicalEvidence): string {
  return formatPerformed({
    loadKg: item.loadKg,
    reps: item.reps ?? item.strengthReps,
    durationSec: item.durationSec,
    leftReps: item.leftReps,
    rightReps: item.rightReps,
  })
}

export const ACHIEVEMENT_LABELS: Record<PrAchievement, string> = {
  load: 'Heaviest load',
  rep_at_load: 'Most reps at this load',
  duration_at_load: 'Longest duration at this load',
  estimated_strength: 'Estimated-strength best',
  frontier: 'Expanded performance frontier',
  session_volume: 'Highest session volume',
}

export function performanceTypeLabel(performanceType: string): string {
  if (performanceType === 'timed') {
    return 'Timed'
  }
  if (performanceType === 'loaded_reps') {
    return 'Loaded reps'
  }
  return performanceType.replace(/_/g, ' ')
}

export function bodyMetricLabel(key: string): string {
  const labels: Record<string, string> = {
    weight: 'Weight',
    body_fat_percentage: 'Body fat',
    muscle_mass: 'Muscle mass',
    body_water_percentage: 'Body water',
    skeletal_muscle_percentage: 'Skeletal muscle',
    bmi: 'BMI',
    bmr: 'BMR',
    visceral_fat: 'Visceral fat',
    bone_mass: 'Bone mass',
    fat_free_mass: 'Fat-free mass',
    waist_hip_ratio: 'Waist-hip ratio',
    protein_percentage: 'Protein',
    metabolic_age: 'Metabolic age',
    skeletal_muscle_mass: 'Skeletal muscle mass',
    subcutaneous_fat_percentage: 'Subcutaneous fat',
  }
  return labels[key] ?? key.replace(/_/g, ' ')
}
