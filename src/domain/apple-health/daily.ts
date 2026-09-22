import type { AppleActivitySummary } from './activity-summary.js'
import { healthTimeZone } from './calendar.js'
import { ACTIVITY_CALCULATION_VERSION } from './priority.js'
import {
  reconcileIntervalMetric,
  reconcileRestingHeartRate,
  type IntervalSample,
  type ReconciledInterval,
  type ReconciledRestingHeartRate,
  type RestingObservation,
} from './reconcile.js'

export type DailyEvidence = {
  derivation: 'health_canonical_day'
  calculationVersion: string
  steps: ReconciledInterval
  walkingRunningDistance: ReconciledInterval
  activeEnergy: {
    value: number | null
    basis: 'apple_activity_summary' | 'unavailable'
    reason?: 'no_activity_summary'
  }
  exerciseTime: {
    value: number | null
    basis: 'apple_activity_summary' | 'unavailable'
    reason?: 'no_activity_summary'
  }
  restingHeartRate: ReconciledRestingHeartRate
  activitySummaryContext: AppleActivitySummary['sourceContext'] | null
}

export type ActivityDailySummary = {
  date: string
  timezone: string
  stepsCount: number | null
  activeEnergyKcal: number | null
  exerciseMinutes: number | null
  walkingRunningDistanceM: number | null
  restingHeartRateBpm: number | null
  calculationVersion: string
  evidence: DailyEvidence
}

export function activityDailyFingerprint(date: string, timezone = healthTimeZone()): string {
  return `apple_health|activity_daily|${timezone}|${date}`
}

export function buildActivityDailySummary(input: {
  date: string
  steps: readonly IntervalSample[]
  distance: readonly IntervalSample[]
  resting: readonly RestingObservation[]
  summary: AppleActivitySummary | null
  calculationVersion?: string
}): ActivityDailySummary | null {
  const calculationVersion = input.calculationVersion ?? ACTIVITY_CALCULATION_VERSION
  const steps = reconcileIntervalMetric(input.steps, 'steps', calculationVersion)
  const distance = reconcileIntervalMetric(input.distance, 'walking_running_distance', calculationVersion)
  const resting = reconcileRestingHeartRate(input.resting, calculationVersion)
  const summary = input.summary?.date === input.date ? input.summary : null
  const activeEnergyKcal = summary ? summary.activeEnergyKcal : null
  const exerciseMinutes = summary ? summary.exerciseMinutes : null
  const present =
    steps.value != null ||
    distance.value != null ||
    resting.value != null ||
    activeEnergyKcal != null ||
    exerciseMinutes != null
  if (!present) {
    return null
  }
  return {
    date: input.date,
    timezone: healthTimeZone(),
    stepsCount: steps.value,
    activeEnergyKcal,
    exerciseMinutes,
    walkingRunningDistanceM: distance.value,
    restingHeartRateBpm: resting.value,
    calculationVersion,
    evidence: {
      derivation: 'health_canonical_day',
      calculationVersion,
      steps,
      walkingRunningDistance: distance,
      activeEnergy: summary
        ? { value: activeEnergyKcal, basis: 'apple_activity_summary' }
        : { value: null, basis: 'unavailable', reason: 'no_activity_summary' },
      exerciseTime: summary
        ? { value: exerciseMinutes, basis: 'apple_activity_summary' }
        : { value: null, basis: 'unavailable', reason: 'no_activity_summary' },
      restingHeartRate: resting,
      activitySummaryContext: summary?.sourceContext ?? null,
    },
  }
}
