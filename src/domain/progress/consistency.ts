import { calendarDaysBetween, inclusiveDayCount } from './dates.js'
import { median } from './statistics.js'
import { availableMetric, type MetricResult, type ProgressWorkoutSummary } from './types.js'

export type ConsistencyValue = {
  workoutCount: number
  workoutsPerWeek: number
  medianGapDays: number | null
  longestGapDays: number | null
  uniqueDates: number
}

function uniqueSortedDates(workouts: readonly ProgressWorkoutSummary[]): string[] {
  return [...new Set(workouts.map((item) => item.sessionDate))].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  )
}

export function trainingConsistency(
  workouts: readonly ProgressWorkoutSummary[],
  periodStart: string,
  periodEnd: string,
): MetricResult<ConsistencyValue> {
  const inPeriod = workouts.filter((item) => item.sessionDate >= periodStart && item.sessionDate <= periodEnd)
  const dates = uniqueSortedDates(inPeriod)
  const dayCount = inclusiveDayCount(periodStart, periodEnd)
  const workoutsPerWeek = dayCount > 0 ? (inPeriod.length * 7) / dayCount : 0
  if (dates.length < 2) {
    return availableMetric(
      {
        workoutCount: inPeriod.length,
        workoutsPerWeek,
        medianGapDays: null,
        longestGapDays: null,
        uniqueDates: dates.length,
      },
      inPeriod.length,
    )
  }
  const gaps: number[] = []
  for (let index = 1; index < dates.length; index += 1) {
    gaps.push(calendarDaysBetween(dates[index - 1]!, dates[index]!))
  }
  return availableMetric(
    {
      workoutCount: inPeriod.length,
      workoutsPerWeek,
      medianGapDays: median(gaps),
      longestGapDays: Math.max(...gaps),
      uniqueDates: dates.length,
    },
    inPeriod.length,
  )
}
