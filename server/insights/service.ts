import { analyzeCrossDomain } from '../../src/domain/intelligence/analyze.js'
import { deriveProactiveInsights, type ProactiveInsights } from '../../src/domain/insights/index.js'
import { addCalendarDays } from '../../src/domain/progress/dates.js'
import { nutritionDailyObservations } from '../../src/domain/progress/nutrition.js'
import { buildProgressOverview } from '../../src/domain/progress/index.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { listActivityDailySummaries } from '../activity/queries.js'
import { getSql } from '../db.js'
import { loadProgressCanonicalRows } from '../progress/queries.js'
import { parseProgressQuery } from '../progress/service.js'
import { listSleepNightlySummaries } from '../sleep/queries.js'

export async function getProactiveInsights(input: {
  range: string | null
  asOf: string | null
  now?: Date
}): Promise<ProactiveInsights> {
  const query = parseProgressQuery(input)
  const today = healthCalendarDateFromNow(input.now ?? new Date())
  const rows = await loadProgressCanonicalRows()
  const overview = buildProgressOverview({
    asOf: query.asOf,
    range: query.range,
    exercises: rows.exercises,
    workouts: rows.workouts,
    sets: rows.sets,
    bodyObservations: rows.bodyObservations,
    nutritionEntries: rows.nutritionEntries,
    nutritionTargets: rows.nutritionTargets,
  })
  const [activityRows, sleepNights, trainingSessions, weightGoalId] = await Promise.all([
    listActivityDailySummaries(),
    listSleepNightlySummaries(),
    listCanonicalTrainingSessions(query.asOf),
    activeWeightGoalId(query.asOf),
  ])
  const nutritionStart = addCalendarDays(query.asOf, -27)
  const findings = analyzeCrossDomain({
    range: query.range,
    asOf: query.asOf,
    today: query.asOf === today ? today : null,
    activityDays: activityRows.filter((row) => row.date <= query.asOf),
    sleepNights: sleepNights.filter((night) => night.sleepDate <= query.asOf),
    nutritionDays: overview.nutrition.observations,
    trainingSessions: overview.training.sessions.map((session) => ({
      sessionId: session.sessionId,
      sessionDate: session.sessionDate,
      effort: session.effort ?? null,
      painLevel: null,
    })),
    bodyWeights: overview.body.weight.observations.filter((item) => item.calendarDate <= query.asOf),
  }).findings
  return deriveProactiveInsights({
    range: query.range,
    asOf: query.asOf,
    today: query.asOf === today ? today : null,
    activityDays: activityRows.filter((row) => row.date <= query.asOf),
    sleepNights: sleepNights
      .filter((night) => night.sleepDate <= query.asOf)
      .map((night) => ({
        sleepDate: night.sleepDate,
        analysisEligible: night.analysisEligible,
        totalSleepMinutes: night.totalSleepMinutes,
        logicalSourceKey: night.logicalSourceKey,
        sourceName: night.sourceName,
      })),
    nutritionDays: nutritionDailyObservations({
      entries: rows.nutritionEntries,
      targets: rows.nutritionTargets,
      start: nutritionStart,
      end: query.asOf,
    }).map((day) => ({
      date: day.date,
      calories: day.calories.status === 'available' ? (day.calories.value ?? null) : null,
      protein: day.protein.status === 'available' ? (day.protein.value ?? null) : null,
    })),
    trainingSessions,
    bodyWeights: rows.bodyObservations.filter((item) => item.calendarDate <= query.asOf),
    strengthExercises: overview.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      latestDate: exercise.estimatedStrengthHistory.length
        ? exercise.estimatedStrengthHistory[exercise.estimatedStrengthHistory.length - 1]!.date
        : null,
      trend: exercise.trend,
    })),
    findings,
    weightGoalId,
  })
}

async function listCanonicalTrainingSessions(asOf: string): Promise<Array<{ performedOn: string; sessionType: string }>> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT workout_date::text AS performed_on, session_type
       FROM workout_sessions
      WHERE workout_date <= $1::date
      ORDER BY workout_date, id`,
    [asOf],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    performedOn: String(row.performed_on),
    sessionType: String(row.session_type),
  }))
}

async function activeWeightGoalId(asOf: string): Promise<string | null> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT id::text AS id
       FROM goals
      WHERE goal_kind = 'body_metric'
        AND body_metric_key = 'weight'
        AND status = 'active'
        AND started_on <= $1::date
      ORDER BY id
      LIMIT 1`,
    [asOf],
  )) as Array<Record<string, unknown>>
  const id = rows[0]?.id
  return typeof id === 'string' ? id : null
}
