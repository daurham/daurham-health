import { nutritionDailyObservations } from '../../src/domain/progress/nutrition.js'
import { trailingPeriod } from '../../src/domain/progress/periods.js'
import { buildTodayView, TODAY_PATTERN_RANGE, type TodayPendingJob, type TodayViewModel } from '../../src/domain/today/index.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { listOutstandingLabelJobs } from '../nutrition/label-jobs.js'
import { listAllTargets, listEntriesBetween } from '../nutrition/queries.js'
import { listOutstandingTranscriptionJobs } from '../training/job-store.js'
import {
  latestCompleteSleepNight,
  listActivityDaysBetween,
  listBodyWeights,
  listSleepNightsBetween,
  listTrainingSessionsBetween,
  listTrainingToday,
} from './queries.js'

export async function getTodayView(now = new Date()): Promise<TodayViewModel> {
  const date = healthCalendarDateFromNow(now)
  const period = trailingPeriod(TODAY_PATTERN_RANGE, date)
  const [activityDays, sleepNights, latestCompleteSleep, trainingToday, trainingSessions, nutritionEntries, nutritionTargets, bodyWeights, workoutJobs, labelJobs, mealJobs] =
    await Promise.all([
      listActivityDaysBetween(period.start, date),
      listSleepNightsBetween(period.start, date),
      latestCompleteSleepNight(date),
      listTrainingToday(date),
      listTrainingSessionsBetween(period.start, date),
      listEntriesBetween(period.start, date),
      listAllTargets(),
      listBodyWeights(),
      listOutstandingTranscriptionJobs(),
      listOutstandingLabelJobs('nutrition_label'),
      listOutstandingLabelJobs('meal_photo'),
    ])
  const pendingJobs: TodayPendingJob[] = [
    ...workoutJobs.map((job) => ({ id: job.id, kind: 'workout_transcription' as const, status: job.status })),
    ...labelJobs.map((job) => ({ id: job.id, kind: 'nutrition_label' as const, status: job.status })),
    ...mealJobs.map((job) => ({ id: job.id, kind: 'meal_photo' as const, status: job.status })),
  ]
  return buildTodayView({
    now,
    activityDays,
    nutritionEntries: nutritionEntries.filter((entry) => entry.logDate === date),
    nutritionTargets,
    nutritionDays: nutritionDailyObservations({ entries: nutritionEntries, targets: nutritionTargets, start: period.start, end: date }),
    trainingToday,
    trainingSessions,
    sleepNights,
    latestCompleteSleep,
    bodyWeights,
    pendingJobs,
  })
}
