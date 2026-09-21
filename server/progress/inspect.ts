import { getProgressOverview } from './service.js'
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
