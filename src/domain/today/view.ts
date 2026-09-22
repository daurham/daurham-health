import type { ActivityDailyRow } from '../activity/analytics.js'
import { activityShortTermChange } from '../activity/analytics.js'
import { bodyWeightTrend } from '../progress/body-trend.js'
import { calendarDaysBetween } from '../progress/dates.js'
import { findingsFromBodyWeightTrend } from '../progress/findings.js'
import type { BodyObservation } from '../progress/types.js'
import type { NutritionDailyObservation } from '../progress/nutrition.js'
import { nutritionDayTotals, type NutritionDayTotals, type NutritionTotable } from '../nutrition/totals.js'
import { resolveNutritionTarget } from '../nutrition/targets.js'
import type { NutritionTarget } from '../nutrition/types.js'
import type { ProgressSleepObservation } from '../progress/health-timeline.js'
import { analyzeCrossDomain, findingCopy, type IntelligenceTrainingSession } from '../intelligence/index.js'
import { healthCalendarDateFromNow, HEALTH_CALENDAR_TIME_ZONE } from '../time.js'

export const TODAY_PATTERN_RANGE = '90d' as const
export const TODAY_PATTERN_LIMIT = 3

export type TodayTrainingSession = {
  id: string
  name: string
  exerciseCount: number
  workingSetCount: number
}

export type TodayPendingJob = {
  id: string
  kind: 'workout_transcription' | 'meal_photo' | 'nutrition_label'
  status: 'queued' | 'processing' | 'completed' | 'failed' | 'committed'
}

export type TodayNutritionEntry = NutritionTotable & { logDate: string }

export type TodaySources = {
  now?: Date
  activityDays: readonly ActivityDailyRow[]
  nutritionEntries: readonly TodayNutritionEntry[]
  nutritionTargets: readonly NutritionTarget[]
  nutritionDays?: readonly NutritionDailyObservation[]
  trainingToday: readonly TodayTrainingSession[]
  trainingSessions: readonly IntelligenceTrainingSession[]
  sleepNights: readonly ProgressSleepObservation[]
  latestCompleteSleep: ProgressSleepObservation | null
  bodyWeights: readonly BodyObservation[]
  pendingJobs: readonly TodayPendingJob[]
}

export type TodayNutrientTarget = {
  calories: number
  protein: number
  carbs: number | null
  fat: number | null
}

export type TodayViewModel = {
  date: string
  timezone: typeof HEALTH_CALENDAR_TIME_ZONE
  activity: {
    inProgress: boolean
    steps: number | null
    activeEnergyKcal: number | null
    exerciseMinutes: number | null
    restingHeartRateBpm: number | null
  }
  nutrition: {
    logged: boolean
    totals: NutritionDayTotals | null
    target: TodayNutrientTarget | null
  }
  training: {
    logged: boolean
    sessions: TodayTrainingSession[]
  }
  sleep: {
    kind: 'complete' | 'partial' | 'none'
    minutes: number | null
    sourceName: string | null
    latestComplete: { date: string; minutes: number; sourceName: string } | null
  }
  body: {
    latest: { value: number; unit: string; calendarDate: string; ageDays: number; measuredLabel: string } | null
    trendText: string | null
  }
  pendingItems: Array<{ id: string; title: string; href: string; action: string }>
  changedItems: Array<{ id: string; text: string }>
  patterns: Array<{ id: string; text: string }>
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function measuredLabel(ageDays: number): string {
  if (ageDays <= 0) {
    return 'Measured today'
  }
  if (ageDays === 1) {
    return 'Measured yesterday'
  }
  return `Measured ${ageDays} days ago`
}

function quantity(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? rounded.toLocaleString('en-US') : rounded.toFixed(1)
}

function attentionTitle(job: TodayPendingJob): string | null {
  if (job.status === 'failed') {
    if (job.kind === 'workout_transcription') return 'Workout photo failed'
    if (job.kind === 'meal_photo') return 'Meal photo failed'
    return 'Label photo failed'
  }
  if (job.status === 'completed') {
    if (job.kind === 'workout_transcription') return 'Workout sheet needs verification'
    if (job.kind === 'meal_photo') return 'Meal photo ready for review'
    return 'Label photo ready for review'
  }
  return null
}

function pendingHref(job: TodayPendingJob, date: string): string {
  if (job.kind === 'workout_transcription') {
    return `/training/import?job=${job.id}`
  }
  return `/nutrition?date=${date}`
}

function todaySleep(nights: readonly ProgressSleepObservation[], date: string): ProgressSleepObservation | null {
  return nights.find((night) => night.sleepDate === date) ?? null
}

function sleepKind(night: ProgressSleepObservation | null): TodayViewModel['sleep']['kind'] {
  if (!night || night.observationStatus === 'in_bed_only') {
    return 'none'
  }
  if (night.analysisEligible && night.observationStatus !== 'partial_observation' && finite(night.totalSleepMinutes)) {
    return 'complete'
  }
  if (night.observationStatus === 'partial_observation' && finite(night.totalSleepMinutes)) {
    return 'partial'
  }
  return 'none'
}

export function buildTodayView(sources: TodaySources): TodayViewModel {
  const date = healthCalendarDateFromNow(sources.now ?? new Date())
  const activityRow = sources.activityDays.find((row) => row.date === date) ?? null
  const steps = activityRow && finite(activityRow.stepsCount) ? activityRow.stepsCount : null
  const activeEnergyKcal = activityRow && finite(activityRow.activeEnergyKcal) ? activityRow.activeEnergyKcal : null
  const exerciseMinutes = activityRow && finite(activityRow.exerciseMinutes) ? activityRow.exerciseMinutes : null
  const restingHeartRateBpm = activityRow && finite(activityRow.restingHeartRateBpm) ? activityRow.restingHeartRateBpm : null
  const todayEntries = sources.nutritionEntries.filter((entry) => entry.logDate === date)
  const target = resolveNutritionTarget(sources.nutritionTargets, date)
  const weights = sources.bodyWeights.filter((item) => item.key === 'weight' && item.calendarDate <= date && finite(item.value))
  const latestWeight = [...weights].sort((left, right) => {
    if (left.calendarDate !== right.calendarDate) {
      return left.calendarDate < right.calendarDate ? 1 : -1
    }
    return left.measuredAt < right.measuredAt ? 1 : -1
  })[0] ?? null
  const trend = bodyWeightTrend(weights)
  const trendFinding = findingsFromBodyWeightTrend(trend, [])[0] ?? null
  const night = todaySleep(sources.sleepNights, date)
  const kind = sleepKind(night)
  const latest = sources.latestCompleteSleep
  const showLatest = kind === 'none' && latest && latest.sleepDate !== date && latest.analysisEligible && finite(latest.totalSleepMinutes)
  const change = activityShortTermChange(sources.activityDays, date, date)
  const changedItems: TodayViewModel['changedItems'] = []
  if (change.steps.status === 'available' && change.steps.value.absoluteDelta !== 0) {
    changedItems.push({
      id: 'activity:steps:recent',
      text: `Completed-day steps averaged ${quantity(change.steps.value.current)} over ${change.currentStart}–${change.currentEnd}, compared with ${quantity(change.steps.value.previous)} over the previous 7 days.`,
    })
  }
  if (trendFinding?.kind === 'body_weight_trend' && latestWeight && typeof trendFinding.slopePerWeek === 'number') {
    const signed = `${trendFinding.slopePerWeek > 0 ? '+' : ''}${quantity(trendFinding.slopePerWeek)}`
    changedItems.push({
      id: 'body:weight_trend',
      text: `Bodyweight trend is ${signed} ${latestWeight.unit} per week across ${trendFinding.observationCount} measurements.`,
    })
  }
  const patterns: TodayViewModel['patterns'] = []
  for (const finding of analyzeCrossDomain({
    range: TODAY_PATTERN_RANGE,
    asOf: date,
    today: date,
    activityDays: sources.activityDays,
    sleepNights: sources.sleepNights,
    nutritionDays: sources.nutritionDays ?? [],
    trainingSessions: sources.trainingSessions,
    bodyWeights: weights,
  }).findings) {
    if (patterns.length >= TODAY_PATTERN_LIMIT) {
      break
    }
    const text = findingCopy(finding)
    if (text) {
      patterns.push({ id: finding.id, text })
    }
  }

  return {
    date,
    timezone: HEALTH_CALENDAR_TIME_ZONE,
    activity: {
      inProgress: steps != null || activeEnergyKcal != null || exerciseMinutes != null || restingHeartRateBpm != null,
      steps,
      activeEnergyKcal,
      exerciseMinutes,
      restingHeartRateBpm,
    },
    nutrition: {
      logged: todayEntries.length > 0,
      totals: todayEntries.length > 0 ? nutritionDayTotals(todayEntries) : null,
      target: target
        ? {
            calories: target.caloriesTarget,
            protein: target.proteinTarget,
            carbs: target.carbsTarget,
            fat: target.fatTarget,
          }
        : null,
    },
    training: {
      logged: sources.trainingToday.length > 0,
      sessions: [...sources.trainingToday],
    },
    sleep: {
      kind,
      minutes: kind === 'none' || !night || !finite(night.totalSleepMinutes) ? null : night.totalSleepMinutes,
      sourceName: kind === 'none' || !night ? null : night.sourceName,
      latestComplete: showLatest && latest && finite(latest.totalSleepMinutes)
        ? { date: latest.sleepDate, minutes: latest.totalSleepMinutes, sourceName: latest.sourceName }
        : null,
    },
    body: {
      latest: latestWeight
        ? {
            value: latestWeight.value,
            unit: latestWeight.unit,
            calendarDate: latestWeight.calendarDate,
            ageDays: Math.max(0, calendarDaysBetween(latestWeight.calendarDate, date)),
            measuredLabel: measuredLabel(Math.max(0, calendarDaysBetween(latestWeight.calendarDate, date))),
          }
        : null,
      trendText:
        trend.status === 'available' && latestWeight
          ? `Weight trend ${trend.value.slopePerWeek > 0 ? '+' : ''}${quantity(trend.value.slopePerWeek)} ${latestWeight.unit} per week`
          : null,
    },
    pendingItems: sources.pendingJobs.flatMap((job) => {
      const title = attentionTitle(job)
      if (!title) {
        return []
      }
      return [{ id: job.id, title, href: pendingHref(job, date), action: 'Review' }]
    }),
    changedItems,
    patterns,
  }
}
