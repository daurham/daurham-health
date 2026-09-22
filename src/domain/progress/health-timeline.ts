import type { ActivityDailyRow } from '../activity/analytics.js'
import { calendarDateFromInstant } from './dates.js'
import { dateInInclusiveRange } from './periods.js'
import type { SleepSummaryNight } from '../sleep/analytics.js'
import type { SleepObservationStatus } from '../sleep/completeness.js'
import { ACTIVITY_TIMEZONE } from '../activity/config.js'

export type ProgressActivityWorkout = {
  id: string
  activityType: string
  startAt: string
  endAt: string
  durationMinutes: number | null
  energyKcal: number | null
}

export type ProgressSleepObservation = SleepSummaryNight & {
  sourceName: string
  startAt: string
  endAt: string
  observationStatus: SleepObservationStatus
}

const WORKOUT_LABELS: Record<string, string> = {
  HKWorkoutActivityTypeWalking: 'Walking',
  HKWorkoutActivityTypeRunning: 'Running',
  HKWorkoutActivityTypeHiking: 'Hiking',
  HKWorkoutActivityTypeYoga: 'Yoga',
  HKWorkoutActivityTypeTraditionalStrengthTraining: 'Strength',
  HKWorkoutActivityTypeFunctionalStrengthTraining: 'Strength',
  HKWorkoutActivityTypeHighIntensityIntervalTraining: 'HIIT',
  HKWorkoutActivityTypeCycling: 'Cycling',
  HKWorkoutActivityTypeSwimming: 'Swimming',
}

export function activityWorkoutLabel(activityType: string): string {
  const known = WORKOUT_LABELS[activityType]
  if (known) {
    return known
  }
  const stripped = activityType.replace(/^HKWorkoutActivityType/, '')
  const spaced = stripped.replace(/([a-z])([A-Z])/g, '$1 $2').trim()
  return spaced || 'Activity'
}

export function activityDayInProgress(date: string, today?: string): boolean {
  return today != null && date === today
}

export function sleepObservationsInRange(
  nights: readonly ProgressSleepObservation[],
  start: string,
  end: string,
): ProgressSleepObservation[] {
  return nights.filter(
    (night) =>
      dateInInclusiveRange(night.sleepDate, start, end) &&
      (night.observationStatus === 'analysis_eligible' || night.observationStatus === 'partial_observation'),
  )
}

export function activityDaysInRange(rows: readonly ActivityDailyRow[], start: string, end: string): ActivityDailyRow[] {
  return rows.filter((row) => {
    if (!dateInInclusiveRange(row.date, start, end)) {
      return false
    }
    return (
      row.stepsCount != null ||
      row.activeEnergyKcal != null ||
      row.exerciseMinutes != null ||
      row.restingHeartRateBpm != null
    )
  })
}

export function activityWorkoutsInRange(
  workouts: readonly ProgressActivityWorkout[],
  start: string,
  end: string,
): Array<ProgressActivityWorkout & { date: string }> {
  return workouts
    .map((workout) => ({
      ...workout,
      date: calendarDateFromInstant(new Date(workout.startAt), ACTIVITY_TIMEZONE),
    }))
    .filter((workout) => dateInInclusiveRange(workout.date, start, end))
}
