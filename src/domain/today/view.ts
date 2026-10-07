import type { ActivityDailyRow } from '../activity/analytics.js'
import { activityShortTermChange } from '../activity/analytics.js'
import { bodyWeightTrend } from '../progress/body-trend.js'
import { calendarDateFromInstant, calendarDaysBetween } from '../progress/dates.js'
import { findingsFromBodyWeightTrend } from '../progress/findings.js'
import type { BodyObservation } from '../progress/types.js'
import type { NutritionDailyObservation } from '../progress/nutrition.js'
import { nutritionDayTotals, type NutritionDayTotals, type NutritionTotable } from '../nutrition/totals.js'
import { resolveNutritionTarget } from '../nutrition/targets.js'
import type { NutritionTarget } from '../nutrition/types.js'
import { activityWorkoutLabel, type ProgressActivityWorkout, type ProgressSleepObservation } from '../progress/health-timeline.js'
import { analyzeCrossDomain, findingCopy, type CrossDomainFinding, type IntelligenceTrainingSession } from '../intelligence/index.js'
import { formatBodyMass } from '../body-metrics.js'
import { formatCalendarRange } from '../calendar-format.js'
import { buildTodaySupplementSection, type TodaySupplementInput, type TodaySupplementSection } from '../supplements/index.js'
import type { GoalAttentionItem } from '../goal-status.js'
import {
  selectTodayBodyReminder,
  type CadenceConfig,
  type CadenceObservation,
  type TodayBodyReminder,
} from '../body-cadence.js'
import { todayContextFromRecord, type DailyContext, type TodayContextSnapshot } from '../context.js'
import { todayDailySignalsFromDay, type DailySignalsDay, type TodayDailySignalsSnapshot } from '../daily-signals.js'
import { selectTodayRetest, type BenchmarkRetestView } from '../lab-retests.js'
import { DEFAULT_HEALTH_CALENDAR_TIME_ZONE, healthCalendarDateFromNow } from '../time.js'

export const TODAY_PATTERN_RANGE = '90d' as const
export const TODAY_PATTERN_LIMIT = 3

export type TodayTrainingSession = {
  id: string
  sessionType: 'programmed' | 'ad_hoc' | 'experiment'
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

export type TodayLabExperiment = {
  id: string
  title: string
  status: 'scheduled' | 'active'
  windowStart: string
  windowEnd: string
  reviewReady?: boolean
}

export type TodaySources = {
  now?: Date
  calendarTimeZone?: string
  activityDays: readonly ActivityDailyRow[]
  activityWorkouts?: readonly ProgressActivityWorkout[]
  nutritionEntries: readonly TodayNutritionEntry[]
  nutritionTargets: readonly NutritionTarget[]
  nutritionDays?: readonly NutritionDailyObservation[]
  trainingToday: readonly TodayTrainingSession[]
  trainingSessions: readonly IntelligenceTrainingSession[]
  sleepNights: readonly ProgressSleepObservation[]
  latestCompleteSleep: ProgressSleepObservation | null
  bodyWeights: readonly BodyObservation[]
  bodyCadence?: {
    configs: readonly CadenceConfig[]
    observations: readonly CadenceObservation[]
  }
  pendingJobs: readonly TodayPendingJob[]
  supplements?: readonly TodaySupplementInput[]
  context?: DailyContext | null
  dailySignals?: DailySignalsDay | null
  goalAttention?: readonly GoalAttentionItem[]
  lab?: {
    experiments: readonly TodayLabExperiment[]
    retests?: readonly BenchmarkRetestView[]
    coveredBenchmarkIds?: readonly string[]
  }
}

export type TodayActivityWorkout = {
  id: string
  activityType: string
  label: string
  startAt: string
  durationMinutes: number | null
  line: string
}

const TODAY_WORKOUT_LIMIT = 3

export function formatActivityWorkoutDuration(minutes: number): string {
  const rounded = Math.round(minutes)
  if (rounded < 60) {
    return `${rounded} min`
  }
  const hours = Math.trunc(rounded / 60)
  const rest = rounded % 60
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

function activityWorkoutLine(label: string, durationMinutes: number | null): string {
  if (durationMinutes == null || !Number.isFinite(durationMinutes)) {
    return label
  }
  return `${label} · ${formatActivityWorkoutDuration(durationMinutes)}`
}

function todayActivityWorkouts(
  workouts: readonly ProgressActivityWorkout[] | undefined,
  date: string,
  timezone = DEFAULT_HEALTH_CALENDAR_TIME_ZONE,
): {
  workouts: TodayActivityWorkout[]
  additionalWorkoutCount: number
} {
  const todays = (workouts ?? [])
    .filter((workout) => calendarDateFromInstant(new Date(workout.startAt), timezone) === date)
    .slice()
    .sort((left, right) => left.startAt.localeCompare(right.startAt) || left.id.localeCompare(right.id))
  return {
    workouts: todays.slice(0, TODAY_WORKOUT_LIMIT).map((workout) => {
      const label = activityWorkoutLabel(workout.activityType)
      return {
        id: workout.id,
        activityType: workout.activityType,
        label,
        startAt: workout.startAt,
        durationMinutes: workout.durationMinutes,
        line: activityWorkoutLine(label, workout.durationMinutes),
      }
    }),
    additionalWorkoutCount: Math.max(0, todays.length - TODAY_WORKOUT_LIMIT),
  }
}

export type TodayNutrientTarget = {
  calories: number
  protein: number
  carbs: number | null
  fat: number | null
  fiber: number | null
  sodium: number | null
}

export type TodayViewModel = {
  date: string
  timezone: string
  activity: {
    inProgress: boolean
    steps: number | null
    activeEnergyKcal: number | null
    exerciseMinutes: number | null
    restingHeartRateBpm: number | null
    updatedAt: string | null
    workouts: TodayActivityWorkout[]
    additionalWorkoutCount: number
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
    measurementDue: TodayBodyReminder | null
    goalSupport: string | null
  }
  pendingItems: Array<{ id: string; title: string; href: string; action: string }>
  goalAttention: GoalAttentionItem[]
  changedItems: Array<{
    id: string
    direction: 'higher' | 'lower' | null
    headline: string
    detail: string
    text: string
  }>
  patterns: Array<{ id: string; text: string; tone: 'positive' | 'negative' | 'neutral' }>
  supplements: TodaySupplementSection | null
  context: TodayContextSnapshot
  dailySignals?: TodayDailySignalsSnapshot
  lab: {
    experiments: TodayLabExperiment[]
    retest: BenchmarkRetestView | null
    otherDueRetestCount: number
    goalSupport: string | null
  }
}

function finite(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function motivationalPatternTone(finding: CrossDomainFinding): 'positive' | 'negative' | 'neutral' {
  if (finding.id !== 'activity_training:steps' || finding.kind !== 'group_comparison') {
    return 'neutral'
  }
  const steps = finding.metrics.metrics.find((metric) => metric.metric === 'steps')
  if (steps?.delta == null || steps.delta === 0) return 'neutral'
  return steps.delta > 0 ? 'positive' : 'negative'
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

function whole(value: number): string {
  return Math.round(value).toLocaleString('en-US')
}

function signedMass(value: number, unit: string): string {
  const text = formatBodyMass(Math.abs(value), unit)
  if (value > 0) {
    return `+${text}`
  }
  if (value < 0) {
    return `-${text}`
  }
  return text
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

function todayLab(sources: TodaySources): TodayViewModel['lab'] {
  const selected = selectTodayRetest(sources.lab?.retests ?? [], new Set(sources.lab?.coveredBenchmarkIds ?? []))
  return {
    experiments: [...(sources.lab?.experiments ?? [])],
    retest: selected.retest,
    otherDueRetestCount: selected.otherDueCount,
    goalSupport: null,
  }
}

export function buildTodayView(sources: TodaySources): TodayViewModel {
  const timezone = sources.calendarTimeZone ?? DEFAULT_HEALTH_CALENDAR_TIME_ZONE
  const date = healthCalendarDateFromNow(sources.now ?? new Date(), timezone)
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
  const measurementDue = selectTodayBodyReminder(
    sources.bodyCadence?.configs ?? [],
    sources.bodyCadence?.observations ?? [],
    date,
  )
  const lab = todayLab(sources)
  const absorbed = new Set<string>()
  let bodyGoalSupport: string | null = null
  let labGoalSupport: string | null = null
  for (const item of sources.goalAttention ?? []) {
    if (measurementDue && item.key === `body_metric_due:${measurementDue.metricKey}`) {
      bodyGoalSupport = item.detail
      absorbed.add(item.key)
    }
    if (lab.retest && item.key === `benchmark_retest_due:${lab.retest.benchmarkDefinitionId}/${lab.retest.protocolVersionId}`) {
      labGoalSupport = item.detail
      absorbed.add(item.key)
    }
  }
  const goalAttention = (sources.goalAttention ?? []).filter((item) => !absorbed.has(item.key))
  const kind = sleepKind(night)
  const latest = sources.latestCompleteSleep
  const showLatest = kind === 'none' && latest && latest.sleepDate !== date && latest.analysisEligible && finite(latest.totalSleepMinutes)
  const activityWorkouts = todayActivityWorkouts(sources.activityWorkouts, date, timezone)
  const change = activityShortTermChange(sources.activityDays, date, date)
  const changedItems: TodayViewModel['changedItems'] = []
  if (change.steps.status === 'available' && change.steps.value.absoluteDelta !== 0) {
    const higher = change.steps.value.absoluteDelta > 0
    const percent = change.steps.value.percentDelta
    const percentText = percent == null ? '' : `${Math.abs(Math.round(percent))}% `
    const headline = `Steps averaged ${percentText}${higher ? 'higher' : 'lower'} than the previous week`
    const currentRange = formatCalendarRange(change.currentStart, change.currentEnd)
    const previousRange = formatCalendarRange(change.previousStart, change.previousEnd)
    const detail = `${whole(change.steps.value.current)}/day · ${currentRange}\nvs ${whole(change.steps.value.previous)}/day · ${previousRange}`
    changedItems.push({
      id: 'activity:steps:recent',
      direction: higher ? 'higher' : 'lower',
      headline,
      detail,
      text: `${headline}. ${detail.replace('\n', ' ')}`,
    })
  }
  if (trendFinding?.kind === 'body_weight_trend' && latestWeight && typeof trendFinding.slopePerWeek === 'number') {
    const signed = signedMass(trendFinding.slopePerWeek, latestWeight.unit)
    const headline = `Weight trend ${signed} per week`
    const detail = `Across ${trendFinding.observationCount} measurements`
    changedItems.push({
      id: 'body:weight_trend',
      direction: trendFinding.slopePerWeek > 0 ? 'higher' : trendFinding.slopePerWeek < 0 ? 'lower' : null,
      headline,
      detail,
      text: `${headline} across ${trendFinding.observationCount} measurements.`,
    })
  }
  const patterns: TodayViewModel['patterns'] = []
  for (const finding of analyzeCrossDomain({
    range: TODAY_PATTERN_RANGE,
    asOf: date,
    today: date,
    timezone,
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
      patterns.push({ id: finding.id, text, tone: motivationalPatternTone(finding) })
    }
  }

  return {
    date,
    timezone,
    activity: {
      inProgress:
        steps != null ||
        activeEnergyKcal != null ||
        exerciseMinutes != null ||
        restingHeartRateBpm != null ||
        activityWorkouts.workouts.length > 0,
      steps,
      activeEnergyKcal,
      exerciseMinutes,
      restingHeartRateBpm,
      updatedAt: activityRow?.updatedAt ?? null,
      workouts: activityWorkouts.workouts,
      additionalWorkoutCount: activityWorkouts.additionalWorkoutCount,
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
            fiber: target.fiberTarget,
            sodium: target.sodiumTarget ?? null,
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
          ? `Weight trend ${signedMass(trend.value.slopePerWeek, latestWeight.unit)} per week`
          : null,
      measurementDue,
      goalSupport: bodyGoalSupport,
    },
    supplements: buildTodaySupplementSection(date, sources.supplements ?? []),
    context: todayContextFromRecord(sources.context ?? null),
    dailySignals: todayDailySignalsFromDay(sources.dailySignals ?? null),
    lab: { ...lab, goalSupport: labGoalSupport },
    pendingItems: [
      ...sources.pendingJobs.flatMap((job) => {
        const title = attentionTitle(job)
        if (!title) {
          return []
        }
        return [{ id: job.id, title, href: pendingHref(job, date), action: 'Review' }]
      }),
      ...(sources.lab?.experiments ?? [])
        .filter((experiment) => experiment.reviewReady)
        .map((experiment) => ({
          id: `experiment-review:${experiment.id}`,
          title: 'Experiment ready to review',
          href: `/lab/experiments/${experiment.id}/result`,
          action: 'Review result',
        })),
    ],
    goalAttention,
    changedItems,
    patterns,
  }
}
