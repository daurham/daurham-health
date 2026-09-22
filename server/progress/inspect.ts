import { getProgressCompare, getProgressOverview, getProgressTimeline } from './service.js'
import { loadProgressCanonicalRows } from './queries.js'
import { exclusionReasonForSet } from '../../src/domain/progress/exercise-performance.js'
import { supportsLoadedRepStrength, supportsTimedExternal } from '../../src/domain/progress/exercise-classification.js'

function countBy<T extends string>(items: T[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const item of items) {
    counts[item] = (counts[item] ?? 0) + 1
  }
  return counts
}

async function main(): Promise<void> {
  const rows = await loadProgressCanonicalRows()
  const overview = await getProgressOverview({
    range: 'all',
    asOf: null,
  })
  const overview30 = await getProgressOverview({
    range: '30d',
    asOf: '2026-09-21',
  })
  const timeline = await getProgressTimeline({
    range: 'all',
    asOf: null,
  })
  const timeline30 = await getProgressTimeline({
    range: '30d',
    asOf: '2026-09-21',
  })
  const compare = await getProgressCompare({
    startA: '2026-08-23',
    endA: '2026-09-21',
    startB: '2026-07-24',
    endB: '2026-08-22',
    checkpointId: null,
    asOf: '2026-09-21',
  })
  const checkpoint = rows.checkpoints[0]
  const sinceCheckpoint = checkpoint
    ? await getProgressCompare({
        startA: null,
        endA: null,
        startB: null,
        endB: null,
        checkpointId: checkpoint.id,
        asOf: '2026-09-21',
      })
    : null
  const exercisesById = new Map(rows.exercises.map((exercise) => [exercise.id, exercise]))
  const enoughTrend = overview.exercises.filter((exercise) => exercise.trend.status === 'available')
  const prCount = overview.exercises.reduce((sum, exercise) => sum + exercise.recentPrs.length, 0)
  const prFindings = overview.findings.filter((item) => item.kind === 'performance_best')
  const classified = countBy(overview.exercises.map((exercise) => exercise.performanceType))
  const loadedRepExercises = overview.exercises.filter((exercise) => exercise.performanceType === 'loaded_reps')
  const timedExercises = overview.exercises.filter((exercise) => exercise.performanceType === 'timed')
  const unilateralIncluded = overview.exercises.filter(
    (exercise) => exercise.analyticsRepMode === 'per_side' && exercise.latestPerformance != null,
  )
  const excludedSets: Array<{ setId: string; exercise: string; reason: string }> = []
  for (const set of rows.sets) {
    const exercise = exercisesById.get(set.exerciseId)
    if (!exercise) {
      excludedSets.push({ setId: set.setId, exercise: set.exerciseId, reason: 'unknown_exercise' })
      continue
    }
    const reason = exclusionReasonForSet(set, exercise)
    if (reason) {
      excludedSets.push({ setId: set.setId, exercise: exercise.name, reason })
    }
  }
  const historicalBestExercises = overview.exercises.filter(
    (exercise) => exercise.latestPerformance != null || exercise.frontier.length > 0,
  )
  const timedCarryFrontier = timedExercises.map((exercise) => ({
    name: exercise.name,
    externalId: exercise.externalId,
    frontier: exercise.frontier,
    latestPerformance: exercise.latestPerformance,
    recentPrs: exercise.recentPrs.length,
    estimatedStrength: exercise.estimatedStrength.status,
    trend: exercise.trend.status,
  }))
  const report = {
    period: overview.period,
    workoutsSeen: overview.training.workouts.status === 'available' ? overview.training.workouts.value.count : 0,
    exercisesClassified: overview.exercises.length,
    loadedRepExerciseCount: loadedRepExercises.length,
    timedExerciseCount: timedExercises.length,
    performanceTypes: classified,
    unilateralExercisesNowIncluded: unilateralIncluded.map((exercise) => exercise.name),
    setsExcluded: {
      count: excludedSets.length,
      byReason: countBy(excludedSets.map((item) => item.reason as string)),
      samples: excludedSets.slice(0, 20),
    },
    baselineHistoricalBestCount: historicalBestExercises.length,
    genuinePrEventCount: prCount,
    previousFirstPerformancePrCount: 24,
    performanceBestFindings: prFindings.length,
    exercisesWithEnoughStrengthHistory: enoughTrend.map((exercise) => exercise.name),
    timedCarryFrontier,
    latestBodyWeightKg:
      overview.body.weight.latest == null
        ? null
        : { value: overview.body.weight.latest.value, date: overview.body.weight.latest.calendarDate },
    bodyWeightTrendStatus: overview.body.weight.trend.status,
    findingKinds: countBy(overview.findings.map((item) => item.kind)),
    findingDomains: countBy(overview.findings.map((item) => item.domain)),
    timeline: {
      period: timeline.period,
      eventCounts: countBy(timeline.events.map((event) => `${event.domain}:${event.kind}`)),
      days: [...new Set(timeline.events.map((event) => event.date))],
      trainingTitles: timeline.events
        .filter((event) => event.kind === 'training_session')
        .map((event) => ({
          date: event.date,
          title: event.title,
          sessionId: event.kind === 'training_session' ? event.data.sessionId : null,
          performanceBestIds: event.kind === 'training_session' ? event.data.performanceBestIds : [],
          timePrecision: event.timePrecision,
          occurredAt: event.occurredAt ?? null,
        })),
      performanceBests: timeline.events
        .filter((event) => event.kind === 'performance_best')
        .map((event) =>
          event.kind === 'performance_best'
            ? {
                date: event.date,
                exerciseName: event.data.exerciseName,
                sessionId: event.data.sessionId,
                sessionTitle: event.data.sessionTitle,
                achievements: event.data.achievements,
              }
            : null,
        ),
      bodyEvents: timeline.events
        .filter((event) => event.kind === 'body_measurement')
        .map((event) =>
          event.kind === 'body_measurement'
            ? {
                date: event.date,
                occurredAt: event.occurredAt,
                weightKg: event.data.weightKg,
                metricKeys: event.data.metrics.map((item) => item.key),
                partial: event.data.partial,
              }
            : null,
        ),
      seriesCounts: {
        bodyWeight: timeline.series.bodyWeight.length,
        workouts: timeline.series.workouts.length,
        performanceBests: timeline.series.performanceBests.length,
        nutritionCalories: timeline.series.nutritionCalories.length,
      },
      nutritionDays: timeline.events
        .filter((event) => event.kind === 'nutrition_day')
        .map((event) =>
          event.kind === 'nutrition_day'
            ? {
                date: event.date,
                occurredAt: event.occurredAt ?? null,
                entryCount: event.data.entryCount,
                calories: event.data.calories,
                protein: event.data.protein,
              }
            : null,
        ),
    },
    nutrition: {
      all: {
        calendarDays: overview.nutrition.calendarDays,
        loggedDays: overview.nutrition.loggedDays,
        coveragePct: overview.nutrition.coveragePct,
        calories: overview.nutrition.calories,
        protein: overview.nutrition.protein,
        carbs: overview.nutrition.carbs,
        fat: overview.nutrition.fat,
        fiber: overview.nutrition.fiber,
        observationDates: overview.nutrition.observations.map((item) => item.date),
        proteinStatuses: overview.nutrition.observations.map((item) => item.protein.status),
      },
      last30d: {
        calendarDays: overview30.nutrition.calendarDays,
        loggedDays: overview30.nutrition.loggedDays,
        coveragePct: overview30.nutrition.coveragePct,
        calories: overview30.nutrition.calories,
        protein: overview30.nutrition.protein,
        carbs: overview30.nutrition.carbs,
        fat: overview30.nutrition.fat,
        fiber: overview30.nutrition.fiber,
        observationDates: overview30.nutrition.observations.map((item) => item.date),
        sep20: overview30.nutrition.observations.find((item) => item.date === '2026-09-20') ?? null,
        sep21: overview30.nutrition.observations.find((item) => item.date === '2026-09-21') ?? null,
      },
      timelineEventCount: {
        all: timeline.events.filter((event) => event.kind === 'nutrition_day').length,
        last30d: timeline30.events.filter((event) => event.kind === 'nutrition_day').length,
      },
      compare: {
        coverageDiffers: compare.nutrition.coverageDiffers,
        a: {
          loggedDays: compare.nutrition.a.loggedDays,
          calendarDays: compare.nutrition.a.calendarDays,
          coveragePct: compare.nutrition.a.coveragePct,
          caloriesAvg: compare.nutrition.a.calories.averageOnLoggedDays,
          proteinObservedDays: compare.nutrition.a.protein.observedDays,
        },
        b: {
          loggedDays: compare.nutrition.b.loggedDays,
          calendarDays: compare.nutrition.b.calendarDays,
          coveragePct: compare.nutrition.b.coveragePct,
          caloriesAvg: compare.nutrition.b.calories.averageOnLoggedDays,
          proteinObservedDays: compare.nutrition.b.protein.observedDays,
        },
      },
      sinceCheckpoint: sinceCheckpoint
        ? {
            label: sinceCheckpoint.checkpoint?.label ?? null,
            start: sinceCheckpoint.periodB.start,
            end: sinceCheckpoint.periodB.end,
            loggedDays: sinceCheckpoint.nutrition.b.loggedDays,
            calendarDays: sinceCheckpoint.nutrition.b.calendarDays,
            coveragePct: sinceCheckpoint.nutrition.b.coveragePct,
            caloriesAvg: sinceCheckpoint.nutrition.b.calories.averageOnLoggedDays,
            protein: sinceCheckpoint.nutrition.b.protein,
          }
        : null,
      loadedEntryCount: rows.nutritionEntries.length,
      loadedTargetCount: rows.nutritionTargets.length,
      entryDates: [...new Set(rows.nutritionEntries.map((item) => item.logDate))].sort(),
      targets: rows.nutritionTargets.map((item) => ({
        effectiveFrom: item.effectiveFrom,
        caloriesTarget: item.caloriesTarget,
        proteinTarget: item.proteinTarget,
      })),
    },
    loadedRepEligible: rows.exercises.filter(supportsLoadedRepStrength).map((exercise) => exercise.name),
    timedEligible: rows.exercises.filter(supportsTimedExternal).map((exercise) => exercise.name),
  }
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Progress inspection failed'
  process.stderr.write(`${message}\n`)
  process.exitCode = 1
})
