import { buildActivityProgressView, type ActivityProgressView } from '../domain/activity/index.js'
import { analyzeCrossDomain } from '../domain/intelligence/analyze.js'
import type { NutritionEntry, NutritionFood } from '../domain/nutrition/types.js'
import {
  buildProgressCompare,
  buildProgressOverview,
  buildProgressTimeline,
  buildSinceCheckpointCompare,
  comparePeriod,
  nutritionDailyObservations,
  type ProgressCanonicalInput,
  type ProgressCompare,
  type ProgressOverview,
  type ProgressRange,
  type ProgressTimeline,
} from '../domain/progress/index.js'
import type { ProgressSleepObservation } from '../domain/progress/health-timeline.js'
import { buildSleepProgressView, type SleepProgressView } from '../domain/sleep/index.js'
import type { SleepNightlySummary } from '../domain/sleep/summarize.js'
import { buildTodayView, type TodayViewModel } from '../domain/today/view.js'
import { DEMO_AS_OF, DEMO_NOW, DEMO_RANGE_START } from './constants.js'
import { demoDataset, type DemoDataset } from './dataset.js'

/**
 * Public demo reads. This module has no database client and no owner API.
 * Missing demo records stay missing.
 */

export type DemoWorkoutDetail = {
  id: string
  date: string
  name: string
  routineCode: string | null
  exercises: Array<{
    id: string
    name: string
    sets: Array<{ id: string; label: string }>
  }>
}

function dataset(): DemoDataset {
  return demoDataset()
}

function sleepObservation(night: SleepNightlySummary): ProgressSleepObservation {
  return {
    sleepDate: night.sleepDate,
    analysisEligible: night.analysisEligible,
    totalSleepMinutes: night.totalSleepMinutes,
    timeInBedMinutes: night.timeInBedMinutes,
    stageAnalysisEligible: night.stageAnalysisEligible,
    coreMinutes: night.coreMinutes,
    deepMinutes: night.deepMinutes,
    remMinutes: night.remMinutes,
    unspecifiedSleepMinutes: night.unspecifiedSleepMinutes,
    logicalSourceKey: night.logicalSourceKey,
    observationStatus: night.observationStatus,
    sourceName: night.sourceName,
    startAt: night.startAt,
    endAt: night.endAt,
  }
}

export function demoCanonical(range: ProgressRange): ProgressCanonicalInput {
  const data = dataset()
  return {
    asOf: DEMO_AS_OF,
    range,
    today: DEMO_AS_OF,
    exercises: data.exercises,
    sets: data.sets,
    workouts: data.workouts,
    bodyObservations: data.body,
    nutritionEntries: data.entries,
    nutritionTargets: data.targets,
    activityDays: data.activity,
    sleepNights: data.sleep.map(sleepObservation),
    activityWorkouts: data.activityWorkouts,
  }
}

export function demoOverview(range: ProgressRange): ProgressOverview {
  return buildProgressOverview(demoCanonical(range))
}

export function demoActivity(range: ProgressRange): ActivityProgressView {
  return buildActivityProgressView(dataset().activity, { range, asOf: DEMO_AS_OF, today: DEMO_AS_OF })
}

export function demoSleep(range: ProgressRange): SleepProgressView {
  return buildSleepProgressView(dataset().sleep, { range, asOf: DEMO_AS_OF })
}

export function demoTimeline(range: ProgressRange): ProgressTimeline {
  const data = dataset()
  return buildProgressTimeline({ ...demoCanonical(range), checkpoints: data.checkpoints })
}

export function demoCompare(startA: string, endA: string, startB: string, endB: string): ProgressCompare {
  return buildProgressCompare({
    canonical: demoCanonical('all'),
    periodA: comparePeriod(startA, endA),
    periodB: comparePeriod(startB, endB),
  })
}

export function demoSinceCheckpoint(checkpointId: string): ProgressCompare | null {
  const checkpoint = dataset().checkpoints.find((item) => item.id === checkpointId)
  if (!checkpoint) {
    return null
  }
  return buildSinceCheckpointCompare({
    canonical: demoCanonical('all'),
    checkpoint,
    asOf: DEMO_AS_OF,
  })
}

export function demoToday(): TodayViewModel {
  const data = dataset()
  const nights = data.sleep.map(sleepObservation)
  const latestComplete = [...nights]
    .filter((night) => night.analysisEligible && night.observationStatus !== 'partial_observation' && night.totalSleepMinutes != null)
    .sort((left, right) => (left.sleepDate < right.sleepDate ? 1 : -1))[0] ?? null
  const sessionsToday = data.workouts.filter((item) => item.sessionDate === DEMO_AS_OF)
  return buildTodayView({
    now: DEMO_NOW,
    activityDays: data.activity,
    nutritionEntries: data.entries,
    nutritionTargets: data.targets,
    nutritionDays: nutritionDailyObservations({
      entries: data.entries,
      targets: data.targets,
      start: DEMO_RANGE_START,
      end: DEMO_AS_OF,
    }),
    trainingToday: sessionsToday.map((session) => {
      const sessionSets = data.sets.filter((set) => set.sessionId === session.sessionId && set.setType === 'working')
      const exerciseIds = new Set(sessionSets.map((set) => set.exerciseId))
      return {
        id: session.sessionId,
        name: session.templateName ?? 'Workout',
        exerciseCount: exerciseIds.size,
        workingSetCount: sessionSets.length,
      }
    }),
    trainingSessions: data.workouts.map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      effort: session.effort ?? null,
      painLevel: null,
    })),
    sleepNights: nights,
    latestCompleteSleep: latestComplete,
    bodyWeights: data.body.filter((item) => item.key === 'weight'),
    pendingJobs: [],
  })
}

export function demoPatterns() {
  const data = dataset()
  const nights = data.sleep.map(sleepObservation)
  return analyzeCrossDomain({
    range: '90d',
    asOf: DEMO_AS_OF,
    today: DEMO_AS_OF,
    activityDays: data.activity,
    sleepNights: nights,
    nutritionDays: nutritionDailyObservations({
      entries: data.entries,
      targets: data.targets,
      start: DEMO_RANGE_START,
      end: DEMO_AS_OF,
    }),
    trainingSessions: data.workouts.map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      effort: null,
      painLevel: null,
    })),
    bodyWeights: data.body.filter((item) => item.key === 'weight'),
  })
}

export function demoFoods(): NutritionFood[] {
  return dataset().foods
}

export function demoNutritionEntries(date: string): NutritionEntry[] | null {
  if (date < DEMO_RANGE_START || date > DEMO_AS_OF) {
    return null
  }
  return dataset().entries.filter((entry) => entry.logDate === date)
}

export function demoSessions(): ProgressOverview['training']['sessions'] {
  return [...dataset().workouts].sort((left, right) => (left.sessionDate < right.sessionDate ? 1 : -1))
}

function setLabel(set: DemoDataset['sets'][number]): string {
  if (set.durationSec != null && set.reps == null && set.leftReps == null) {
    return `${set.weightKg} kg · ${set.durationSec}s`
  }
  if (set.leftReps != null || set.rightReps != null) {
    return `${set.weightKg} kg · L ${set.leftReps ?? '—'} · R ${set.rightReps ?? '—'}`
  }
  return `${set.weightKg} kg × ${set.reps}`
}

export function demoWorkout(sessionId: string): DemoWorkoutDetail | null {
  const data = dataset()
  const workout = data.workouts.find((item) => item.sessionId === sessionId)
  if (!workout) {
    return null
  }
  const sessionSets = data.sets
    .filter((set) => set.sessionId === sessionId && set.setType === 'working')
    .sort((left, right) => left.sessionExercisePosition - right.sessionExercisePosition || left.setNumber - right.setNumber)
  const order: string[] = []
  for (const set of sessionSets) {
    if (!order.includes(set.exerciseId)) {
      order.push(set.exerciseId)
    }
  }
  return {
    id: workout.sessionId,
    date: workout.sessionDate,
    name: workout.templateName ?? 'Workout',
    routineCode: workout.routineCode ?? null,
    exercises: order.map((exerciseId) => ({
      id: exerciseId,
      name: data.exercises.find((item) => item.id === exerciseId)?.name ?? 'Exercise',
      sets: sessionSets.filter((set) => set.exerciseId === exerciseId).map((set) => ({ id: set.setId, label: setLabel(set) })),
    })),
  }
}

export function demoCheckpoints() {
  return dataset().checkpoints
}

export function demoBodyMeasurements() {
  return dataset().body
}
