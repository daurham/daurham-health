import type { MetricResult, ProgressFinding, ProgressOverview, ProgressRange, TimelineFocus } from '@/domain/progress'
import { kilogramsToPounds } from '@/domain/units'
import {
  ACHIEVEMENT_LABELS,
  formatBodyCanonical,
  formatCalendarDate,
  formatPercent,
  formatPerformed,
  formatSigned,
} from './format'
import { formatKcal } from '@/features/nutrition/format'

export const RANGE_OPTIONS: Array<{ id: ProgressRange; label: string }> = [
  { id: '30d', label: '30D' },
  { id: '90d', label: '90D' },
  { id: '6m', label: '6M' },
  { id: '1y', label: '1Y' },
  { id: 'all', label: 'ALL' },
]

export const TIMELINE_FOCUS_OPTIONS: Array<{ id: TimelineFocus; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'training', label: 'Training' },
  { id: 'body', label: 'Body' },
  { id: 'nutrition', label: 'Nutrition' },
  { id: 'bests', label: 'Performance Bests' },
]

export const RANGE_HEADINGS: Record<ProgressRange, string> = {
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  '6m': 'Last 6 months',
  '1y': 'Last year',
  all: 'All time',
}

export function workoutActivityByDate(
  sessions: Array<{ sessionId: string; sessionDate: string }>,
): Array<{ date: string; count: number }> {
  const counts = new Map<string, number>()
  for (const session of sessions) {
    counts.set(session.sessionDate, (counts.get(session.sessionDate) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([date, count]) => ({ date, count }))
}

export function remainingCount(result: MetricResult<unknown>): number | null {
  if (result.status !== 'insufficient_data' || result.required == null) {
    return null
  }
  return Math.max(0, result.required - result.observations)
}

export function appearanceProgressCopy(observations: number, required: number | undefined): string {
  if (required == null) {
    return `${observations} appearance${observations === 1 ? '' : 's'}`
  }
  return `${observations} / ${required} appearances`
}

export function appearanceFractionCopy(observations: number, required: number | undefined): string {
  if (required == null) {
    return String(observations)
  }
  return `${observations} / ${required}`
}

export function compactTrendCopy(exercise: ProgressOverview['exercises'][number]): string {
  if (exercise.trend.status === 'not_applicable') {
    return '—'
  }
  if (exercise.trend.status === 'insufficient_data') {
    return `Building · ${appearanceFractionCopy(exercise.appearanceCount, exercise.trend.required)}`
  }
  return trendStatusCopy(exercise.trend)
}

export function trendStatusCopy(trend: ProgressOverview['exercises'][number]['trend']): string {
  if (trend.status === 'not_applicable') {
    return 'Not applicable'
  }
  if (trend.status === 'unsupported') {
    return 'Unsupported'
  }
  if (trend.status === 'insufficient_data') {
    const remaining = remainingCount(trend)
    if (remaining != null && remaining > 0) {
      return remaining === 1
        ? 'Building trend · 1 more appearance needed'
        : `Building trend · ${remaining} more appearances needed`
    }
    return 'Building your trend'
  }
  if (trend.status === 'available') {
    if (trend.value.direction === 'improving') {
      return `Improving ${formatPercent(trend.value.changePercent)}`
    }
    if (trend.value.direction === 'decreasing') {
      return `Decreasing ${formatPercent(trend.value.changePercent)}`
    }
    return 'Stable'
  }
  return 'Unavailable'
}

export function bodyTrendCopy(overview: ProgressOverview): string {
  const { trend, observations, requirements } = overview.body.weight
  if (trend.status === 'available') {
    return `${formatSigned(kilogramsToPounds(trend.value.slopePerWeek), 2, 'lb')}/week`
  }
  if (observations.length === 0) {
    return 'No weight measurements yet'
  }
  const remaining = remainingCount(trend)
  const need =
    remaining != null && remaining > 0
      ? `${remaining} more measurement${remaining === 1 ? '' : 's'} needed`
      : `${requirements.minimumMeasurements} measurements across at least ${requirements.minimumSpanDays} days are required`
  return `Not enough weight history yet · ${need}`
}

export function findingTitle(kind: string): string {
  switch (kind) {
    case 'performance_best':
      return 'Performance best'
    case 'exercise_improved':
      return 'Estimated strength improved'
    case 'exercise_decreased':
      return 'Estimated strength decreased'
    case 'body_weight_trend':
      return 'Weight trend'
    case 'training_frequency_change':
      return 'Workout frequency'
    case 'nutrition_logging_summary':
      return 'Nutrition logging'
    case 'nutrition_period_average':
      return 'Calories on logged days'
    default:
      return kind.replace(/_/g, ' ')
  }
}

export function findingHeadline(finding: ProgressFinding, overview: ProgressOverview): string {
  if (finding.kind === 'performance_best') {
    const exercise = overview.exercises.find((item) => item.exerciseId === finding.exerciseId)
    const event = exercise?.recentPrs.find((item) => item.date === finding.evidence[0]?.date)
    const performed = event ? formatPerformed(event.performed) : finding.evidence[0] ? formatPerformed({
      loadKg: finding.evidence[0].loadKg,
      reps: finding.evidence[0].reps ?? finding.evidence[0].strengthReps,
      durationSec: finding.evidence[0].durationSec,
      leftReps: finding.evidence[0].leftReps,
      rightReps: finding.evidence[0].rightReps,
    }) : null
    return [exercise?.name, performed].filter(Boolean).join(' · ')
  }
  if (finding.kind === 'exercise_improved' || finding.kind === 'exercise_decreased') {
    const exercise = overview.exercises.find((item) => item.exerciseId === finding.exerciseId)
    const change = finding.changePercent != null ? formatPercent(finding.changePercent) : null
    return [exercise?.name, change].filter(Boolean).join(' · ')
  }
  if (finding.kind === 'body_weight_trend' && finding.slopePerWeek != null) {
    const latest = overview.body.weight.latest
    const latestLabel = latest ? formatBodyCanonical(latest.unit, latest.value) : null
    return [`${formatSigned(kilogramsToPounds(finding.slopePerWeek), 2, 'lb')}/week`, latestLabel].filter(Boolean).join(' · ')
  }
  if (finding.kind === 'training_frequency_change') {
    return `${finding.currentWorkouts ?? 0} workouts`
  }
  if (finding.kind === 'nutrition_logging_summary' && finding.loggedDays != null && finding.calendarDays != null) {
    return `${finding.loggedDays} of ${finding.calendarDays} days logged`
  }
  if (finding.kind === 'nutrition_period_average' && finding.average != null && finding.observedDays != null) {
    return `${formatKcal(finding.average)} avg on ${finding.observedDays} logged day${finding.observedDays === 1 ? '' : 's'}`
  }
  return findingTitle(finding.kind)
}

export function findingEventName(finding: ProgressFinding, overview: ProgressOverview): string {
  if (finding.exerciseId) {
    return overview.exercises.find((item) => item.exerciseId === finding.exerciseId)?.name ?? findingTitle(finding.kind)
  }
  return findingTitle(finding.kind)
}

export function findingResult(finding: ProgressFinding, overview: ProgressOverview): string | null {
  if (finding.kind === 'performance_best') {
    const exercise = overview.exercises.find((item) => item.exerciseId === finding.exerciseId)
    const event = exercise?.recentPrs.find((item) => item.date === finding.evidence[0]?.date)
    if (event) {
      return formatPerformed(event.performed)
    }
    if (finding.evidence[0]) {
      return formatPerformed({
        loadKg: finding.evidence[0].loadKg,
        reps: finding.evidence[0].reps ?? finding.evidence[0].strengthReps,
        durationSec: finding.evidence[0].durationSec,
        leftReps: finding.evidence[0].leftReps,
        rightReps: finding.evidence[0].rightReps,
      })
    }
    return null
  }
  if ((finding.kind === 'exercise_improved' || finding.kind === 'exercise_decreased') && finding.changePercent != null) {
    return formatPercent(finding.changePercent)
  }
  if (finding.kind === 'body_weight_trend' && finding.slopePerWeek != null) {
    return `${formatSigned(kilogramsToPounds(finding.slopePerWeek), 2, 'lb')}/week`
  }
  if (finding.kind === 'training_frequency_change' && finding.currentWorkouts != null) {
    return `${finding.currentWorkouts} workout${finding.currentWorkouts === 1 ? '' : 's'}`
  }
  if (finding.kind === 'nutrition_logging_summary' && finding.loggedDays != null && finding.calendarDays != null) {
    return `${finding.loggedDays} / ${finding.calendarDays}`
  }
  if (finding.kind === 'nutrition_period_average' && finding.average != null) {
    return formatKcal(finding.average)
  }
  return null
}

export function findingDate(finding: ProgressFinding): string | null {
  const date = finding.evidence.find((item) => item.date)?.date
  return date ? formatCalendarDate(date) : null
}

export function achievementList(finding: ProgressFinding): string[] {
  return (finding.achievements ?? []).map((item) => ACHIEVEMENT_LABELS[item] ?? item)
}

export function progressBriefLines(overview: ProgressOverview): string[] {
  const lines: string[] = []
  const workouts = overview.training.workouts
  if (workouts.status === 'available') {
    const count = workouts.value.count
    lines.push(`${count} workout${count === 1 ? '' : 's'}`)
    const comparison = overview.training.comparison.workoutCount
    if (comparison.status === 'available' && comparison.value.change !== 0) {
      const abs = Math.abs(comparison.value.change)
      lines.push(
        comparison.value.change > 0
          ? `${abs} more than the previous period`
          : `${abs} fewer than the previous period`,
      )
    }
  }

  const prs = overview.findings.filter((item) => item.kind === 'performance_best')
  if (prs.length > 0) {
    lines.push(`${prs.length} performance best${prs.length === 1 ? '' : 's'}`)
  }

  const improving = overview.exercises.filter(
    (exercise) => exercise.trend.status === 'available' && exercise.trend.value.direction === 'improving',
  )
  const enoughHistory = overview.exercises.filter((exercise) => exercise.trend.status === 'available')
  if (enoughHistory.length > 0) {
    lines.push(`${improving.length} of ${enoughHistory.length} tracked exercises improved`)
  } else if (overview.exercises.some((exercise) => exercise.latestPerformance && exercise.trend.status === 'insufficient_data')) {
    lines.push('Strength trends building')
  }

  const weightTrend = overview.body.weight.trend
  if (weightTrend.status === 'available') {
    lines.push(`Weight trend ${formatSigned(kilogramsToPounds(weightTrend.value.slopePerWeek), 2, 'lb')}/week`)
  }

  if (overview.nutrition.loggedDays > 0) {
    lines.push(
      `${overview.nutrition.loggedDays} nutrition day${overview.nutrition.loggedDays === 1 ? '' : 's'} logged`,
    )
  }

  return lines
}

export function strengthOverviewCopy(overview: ProgressOverview): {
  improving: number
  stable: number
  decreasing: number
  building: number
  timed: number
} {
  let improving = 0
  let stable = 0
  let decreasing = 0
  let building = 0
  let timed = 0
  for (const exercise of overview.exercises) {
    if (exercise.trend.status === 'not_applicable') {
      timed += 1
      continue
    }
    if (exercise.trend.status !== 'available') {
      if (exercise.latestPerformance) {
        building += 1
      }
      continue
    }
    if (exercise.trend.value.direction === 'improving') {
      improving += 1
    } else if (exercise.trend.value.direction === 'decreasing') {
      decreasing += 1
    } else {
      stable += 1
    }
  }
  return { improving, stable, decreasing, building, timed }
}
