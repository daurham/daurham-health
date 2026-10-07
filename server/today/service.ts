import { nutritionDailyObservations } from '../../src/domain/progress/nutrition.js'
import { trailingPeriod } from '../../src/domain/progress/periods.js'
import { buildTodayView, TODAY_PATTERN_RANGE, type TodayPendingJob, type TodayViewModel } from '../../src/domain/today/index.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { getInstanceConfig } from '../instance-config.js'
import { listOutstandingLabelJobs } from '../nutrition/label-jobs.js'
import { listAllTargets, listEntriesBetween } from '../nutrition/queries.js'
import { listOutstandingTranscriptionJobs } from '../training/job-store.js'
import { listTodaySupplementInputs } from '../supplements/queries.js'
import { getDailyContext } from '../context/service.js'
import { getDailySignalsDay } from '../daily-signals/service.js'
import { benchmarkIdsWithActionableExperiment } from '../../src/domain/lab-retests.js'
import { listTodayLabExperiments } from '../lab/service.js'
import { listBenchmarkRetests, listRetestExperimentLinks } from '../lab/retests.js'
import { loadCadenceEvidence } from '../body/cadence-service.js'
import { goalAttentionForToday } from '../goals/service.js'
import { listProtocolRetestViews } from '../lab/retests.js'
import {
  latestCompleteSleepNight,
  listActivityDaysBetween,
  listBodyWeights,
  listSleepNightsBetween,
  listTrainingSessionsBetween,
  listTrainingToday,
  listTodayActivityWorkouts,
} from './queries.js'

export async function getTodayView(now = new Date()): Promise<TodayViewModel> {
  const instance = await getInstanceConfig()
  const timezone = instance.calendarTimeZone
  const date = healthCalendarDateFromNow(now, timezone)
  const period = trailingPeriod(TODAY_PATTERN_RANGE, date)
  const [activityDays, activityWorkouts, sleepNights, latestCompleteSleep, trainingToday, trainingSessions, nutritionEntries, nutritionTargets, bodyWeights, workoutJobs, labelJobs, mealJobs, supplements, bodyCadence, context, dailySignals, labExperiments, retests, retestLinks] =
    await Promise.all([
      listActivityDaysBetween(period.start, date, timezone),
      listTodayActivityWorkouts(date, timezone),
      listSleepNightsBetween(period.start, date, timezone),
      latestCompleteSleepNight(date, timezone),
      listTrainingToday(date),
      listTrainingSessionsBetween(period.start, date),
      listEntriesBetween(period.start, date),
      listAllTargets(),
      listBodyWeights(),
      listOutstandingTranscriptionJobs(),
      listOutstandingLabelJobs('nutrition_label'),
      listOutstandingLabelJobs('meal_photo'),
      listTodaySupplementInputs(date),
      loadCadenceEvidence(),
      getDailyContext(date, now),
      getDailySignalsDay(date, now),
      listTodayLabExperiments(),
      listBenchmarkRetests(date),
      listRetestExperimentLinks(),
    ])
  const protocolRetests = await listProtocolRetestViews(date)
  const goalAttention = await goalAttentionForToday(date, bodyCadence, protocolRetests)
  const pendingJobs: TodayPendingJob[] = [
    ...workoutJobs.map((job) => ({ id: job.id, kind: 'workout_transcription' as const, status: job.status })),
    ...labelJobs.map((job) => ({ id: job.id, kind: 'nutrition_label' as const, status: job.status })),
    ...mealJobs.map((job) => ({ id: job.id, kind: 'meal_photo' as const, status: job.status })),
  ]
  return buildTodayView({
    now,
    calendarTimeZone: timezone,
    activityDays,
    activityWorkouts,
    nutritionEntries: nutritionEntries.filter((entry) => entry.logDate === date),
    nutritionTargets,
    nutritionDays: nutritionDailyObservations({ entries: nutritionEntries, targets: nutritionTargets, start: period.start, end: date }),
    trainingToday,
    trainingSessions,
    sleepNights,
    latestCompleteSleep,
    bodyWeights,
    bodyCadence,
    pendingJobs,
    supplements,
    context,
    dailySignals,
    goalAttention,
    lab: {
      experiments: labExperiments,
      retests: retests.retests,
      coveredBenchmarkIds: [...benchmarkIdsWithActionableExperiment(retestLinks)],
    },
  })
}
