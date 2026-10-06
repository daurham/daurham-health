import { experimentNeedsReview } from '../../src/domain/experiment-results.js'
import { resolveCadence } from '../../src/domain/body-cadence.js'
import { metricDefinition } from '../../src/domain/body-manual.js'
import { performanceBestsForExercise } from '../../src/domain/progress/prs.js'
import { weeklyCoachPeriods, type WeeklyCoachInput } from '../../src/domain/weekly-coach/index.js'
import { computeSleepDurationBaseline, latestBaselineNight } from '../../src/domain/sleep/baseline.js'
import { getSql } from '../db.js'
import { listActivityDailySummaries } from '../activity/queries.js'
import { loadCadenceEvidence } from '../body/cadence-service.js'
import { listGoalAskSnapshots } from '../goals/service.js'
import { getProactiveInsights } from '../insights/service.js'
import { listBenchmarkRetests } from '../lab/retests.js'
import { loadProgressCanonicalRows } from '../progress/queries.js'
import { listSleepNightlySummaries } from '../sleep/queries.js'
import { listSupplementRangeInputs } from '../supplements/queries.js'
import { healthCalendarTimeZone } from '../health-time.js'

export async function loadWeeklyCoachInput(asOf: string): Promise<WeeklyCoachInput> {
  const timezone = await healthCalendarTimeZone()
  const { period } = weeklyCoachPeriods(asOf)
  const [rows, activityDays, sleepNights, supplements, goals, insights, retests, cadence, experiments, benchmarks, captures] =
    await Promise.all([
      loadProgressCanonicalRows(),
      listActivityDailySummaries(timezone),
      listSleepNightlySummaries(timezone),
      listSupplementRangeInputs(period.start, period.end),
      listGoalAskSnapshots(asOf),
      getProactiveInsights({ range: '30d', asOf }),
      listBenchmarkRetests(asOf),
      loadCadenceEvidence(),
      listWeeklyExperiments(asOf, period.start, period.end, timezone),
      listWeeklyBenchmarks(asOf, period.start, period.end, timezone),
      listReviewCaptures(period.end, timezone),
    ])
  const visibleSets = rows.sets.filter((set) => set.sessionDate <= period.end)
  const performanceBests = rows.exercises.flatMap((exercise) =>
    performanceBestsForExercise(
      visibleSets.filter((set) => set.exerciseId === exercise.id),
      exercise,
    )
      .filter((event) => event.date >= period.start && event.date <= period.end)
      .map((event) => ({
        exerciseId: event.exerciseId,
        name: exercise.name,
        date: event.date,
        summary: event.achievements.map((item) => item.replaceAll('_', ' ')).join(', '),
      })),
  )
  const nights = sleepNights.filter((night) => night.sleepDate <= period.end)
  const baselineNight = latestBaselineNight(nights, period, timezone)
  const baseline = baselineNight ? computeSleepDurationBaseline(nights, baselineNight) : null
  return {
    asOf,
    timezone,
    activityDays: activityDays.filter((row) => row.date <= period.end),
    sleepNights: nights.map((night) => ({
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
    })),
    nutritionEntries: rows.nutritionEntries.filter((entry) => entry.logDate <= period.end),
    nutritionTargets: rows.nutritionTargets,
    trainingSessions: await listTrainingSessions(period.end),
    performanceBests,
    bodyObservations: rows.bodyObservations.filter((item) => item.calendarDate <= period.end),
    supplements,
    goals: goals.map((goal) => ({
      id: goal.id,
      label: goal.label,
      kind: goal.kind,
      lifecycle: goal.lifecycle,
      targetState: goal.targetState,
      deadlineState: goal.deadlineState,
    })),
    experiments,
    retests: retests.retests.map((item) => ({
      id: item.benchmarkDefinitionId,
      title: item.benchmarkTitle,
      status: item.status,
    })),
    benchmarkResults: benchmarks,
    reviewCaptures: captures,
    cadenceDue: cadence.configs.flatMap((config) => {
      const resolution = resolveCadence(
        config,
        cadence.observations.filter((item) => item.calendarDate <= asOf),
        asOf,
      )
      if (resolution.status === 'current') {
        return []
      }
      return [{ key: config.metricKey, label: metricDefinition(config.metricKey)?.label ?? config.metricKey, status: resolution.status }]
    }),
    insights: insights.insights,
    sleepBaseline:
      baseline && baseline.state === 'available' && baseline.currentValue != null && baseline.baselineMedian != null
        ? {
            sleepDate: baseline.targetSleepDate,
            sourceName: baseline.sourceFamily ?? 'Unknown source',
            currentMinutes: baseline.currentValue,
            medianMinutes: baseline.baselineMedian,
            priorNights: baseline.baselineObservationCount,
          }
        : null,
    activeBodyGoal: goals.some((goal) => goal.lifecycle === 'active' && goal.kind === 'body_metric'),
  }
}

async function listTrainingSessions(end: string): Promise<WeeklyCoachInput['trainingSessions']> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT workout_date::text AS performed_on, session_type
       FROM workout_sessions
      WHERE workout_date <= $1::date
      ORDER BY workout_date, id`,
    [end],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({ performedOn: String(row.performed_on), sessionType: String(row.session_type) }))
}

async function listWeeklyExperiments(
  asOf: string,
  start: string,
  end: string,
  timezone: string,
): Promise<WeeklyCoachInput['experiments']> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT e.id::text AS id,
            e.title,
            e.status,
            e.window_end::text AS window_end,
            EXISTS (
              SELECT 1 FROM experiment_results r
               WHERE r.experiment_id = e.id
                 AND r.status = 'valid'
                 AND (r.created_at AT TIME ZONE $4)::date <= $1::date
            ) AS has_valid,
            EXISTS (
              SELECT 1 FROM experiment_results r
               WHERE r.experiment_id = e.id
                 AND r.status = 'valid'
                 AND r.effective_end_date BETWEEN $2::date AND $3::date
                 AND (r.created_at AT TIME ZONE $4)::date <= $1::date
            ) AS completed_in_week
       FROM experiments e
      WHERE (e.created_at AT TIME ZONE $4)::date <= $1::date`,
    [asOf, start, end, timezone],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    reviewReady: experimentNeedsReview({
      status: String(row.status),
      windowEnd: row.window_end == null ? null : String(row.window_end),
      today: asOf,
      hasValidResult: row.has_valid === true,
    }),
    completedInWeek: row.completed_in_week === true,
  }))
}

async function listWeeklyBenchmarks(
  asOf: string,
  start: string,
  end: string,
  timezone: string,
): Promise<WeeklyCoachInput['benchmarkResults']> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT r.id::text AS id, p.title, r.result_date::text AS result_date
       FROM benchmark_results r
       JOIN benchmark_definitions b ON b.id = r.benchmark_definition_id
       JOIN lab_protocols p ON p.id = b.protocol_id
      WHERE r.status = 'valid'
        AND r.result_date BETWEEN $1::date AND $2::date
        AND (r.created_at AT TIME ZONE $4)::date <= $3::date
      ORDER BY r.result_date, r.id`,
    [start, end, asOf, timezone],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({ id: String(row.id), title: String(row.title), date: String(row.result_date) }))
}

async function listReviewCaptures(
  end: string,
  timezone: string,
): Promise<WeeklyCoachInput['reviewCaptures']> {
  const sql = await getSql()
  const rows = (await sql.query(
    `SELECT home_ai_job_id
       FROM workout_transcription_jobs
      WHERE status = 'completed'
        AND workout_session_id IS NULL
        AND (created_at AT TIME ZONE $2)::date <= $1::date
      ORDER BY created_at, home_ai_job_id`,
    [end, timezone],
  )) as Array<Record<string, unknown>>
  return rows.map((row) => ({
    id: String(row.home_ai_job_id),
    label: 'workout capture',
    detailPath: '/training',
  }))
}
