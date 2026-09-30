import { handleApiError, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from './http.js'
import authHandler from './handlers/auth.js'
import bodyMeasurementsHandler from './handlers/body-measurements.js'
import bodyInboxHandler from './handlers/body-inbox.js'
import bodyCaptureIngestHandler from './handlers/body-capture-ingest.js'
import bodyCadencesHandler from './handlers/body-cadences.js'
import fitProfileCommitHandler from './handlers/fit-profile-commit.js'
import fitProfilePreviewHandler from './handlers/fit-profile-preview.js'
import healthHandler from './handlers/health.js'
import sessionHandler from './handlers/session.js'
import trainingExercisesHandler from './handlers/training-exercises.js'
import trainingSessionDetailHandler from './handlers/training-session-detail.js'
import trainingSessionsHandler from './handlers/training-sessions.js'
import trainingTemplatesHandler from './handlers/training-templates.js'
import transcriptionCommitHandler from './handlers/transcription-commit.js'
import transcriptionJobDetailHandler from './handlers/transcription-job-detail.js'
import transcriptionJobsHandler from './handlers/transcription-jobs.js'
import progressOverviewHandler from './handlers/progress-overview.js'
import progressInsightsHandler from './handlers/progress-insights.js'
import progressWeeklyHandler from './handlers/progress-weekly.js'
import progressActivityHandler from './handlers/progress-activity.js'
import progressSleepHandler from './handlers/progress-sleep.js'
import progressSleepDetailHandler from './handlers/progress-sleep-detail.js'
import progressTimelineHandler from './handlers/progress-timeline.js'
import progressCompareHandler from './handlers/progress-compare.js'
import progressCheckpointsHandler from './handlers/progress-checkpoints.js'
import progressCheckpointDetailHandler from './handlers/progress-checkpoint-detail.js'
import nutritionDayHandler from './handlers/nutrition-day.js'
import nutritionEntriesHandler from './handlers/nutrition-entries.js'
import nutritionEntryDetailHandler from './handlers/nutrition-entry-detail.js'
import nutritionFoodsHandler from './handlers/nutrition-foods.js'
import nutritionFoodDetailHandler from './handlers/nutrition-food-detail.js'
import nutritionLegacyImportHandler from './handlers/nutrition-legacy-import.js'
import nutritionTargetsHandler from './handlers/nutrition-targets.js'
import nutritionBarcodeHandler from './handlers/nutrition-barcode.js'
import nutritionLabelJobsHandler from './handlers/nutrition-label-jobs.js'
import nutritionLabelJobDetailHandler from './handlers/nutrition-label-job-detail.js'
import nutritionLabelCommitHandler from './handlers/nutrition-label-commit.js'
import nutritionMealJobsHandler from './handlers/nutrition-meal-jobs.js'
import nutritionMealJobDetailHandler from './handlers/nutrition-meal-job-detail.js'
import nutritionMealCommitHandler from './handlers/nutrition-meal-commit.js'
import nutritionDescribeHandler from './handlers/nutrition-describe.js'
import nutritionRecipesHandler from './handlers/nutrition-recipes.js'
import nutritionRecipeFoodsHandler from './handlers/nutrition-recipe-foods.js'
import appleHealthImportHandler from './handlers/apple-health-import.js'
import appleHealthSyncHandler from './handlers/apple-health-sync.js'
import todayHandler from './handlers/today.js'
import supplementsHandler from './handlers/supplements.js'
import contextHandler from './handlers/context.js'
import labHandler from './handlers/lab.js'
import goalsHandler from './handlers/goals.js'
import askHealthHandler from './handlers/ask-health.js'
import askHealthLiteratureHandler from './handlers/ask-health-literature.js'
import backupExportHandler from './handlers/backup-export.js'
import coachHandler from './handlers/coach.js'
import rewardsHandler from './handlers/rewards.js'

export type HealthApiRoute =
  | 'health'
  | 'session'
  | 'auth'
  | 'body-measurements'
  | 'body-inbox'
  | 'body-capture-ingest'
  | 'body-cadences'
  | 'fit-profile-preview'
  | 'fit-profile-commit'
  | 'training-exercises'
  | 'training-templates'
  | 'training-sessions'
  | 'training-session-detail'
  | 'transcription-jobs'
  | 'transcription-job-detail'
  | 'transcription-commit'
  | 'progress-overview'
  | 'progress-insights'
  | 'progress-weekly'
  | 'progress-activity'
  | 'progress-sleep'
  | 'progress-sleep-detail'
  | 'progress-timeline'
  | 'progress-compare'
  | 'progress-checkpoints'
  | 'progress-checkpoint-detail'
  | 'nutrition-day'
  | 'nutrition-entries'
  | 'nutrition-entry-detail'
  | 'nutrition-foods'
  | 'nutrition-food-detail'
  | 'nutrition-legacy-import'
  | 'nutrition-targets'
  | 'nutrition-barcode'
  | 'nutrition-label-jobs'
  | 'nutrition-label-job-detail'
  | 'nutrition-label-commit'
  | 'nutrition-meal-jobs'
  | 'nutrition-meal-job-detail'
  | 'nutrition-meal-commit'
  | 'nutrition-describe'
  | 'nutrition-recipes'
  | 'nutrition-recipe-foods'
  | 'apple-health-import'
  | 'apple-health-sync'
  | 'today'
  | 'supplements'
  | 'context'
  | 'lab'
  | 'goals'
  | 'ask-health'
  | 'ask-health-literature'
  | 'backup-export'
  | 'coach'
  | 'rewards'

type HealthApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>

const HANDLERS: Record<HealthApiRoute, HealthApiHandler> = {
  health: healthHandler,
  session: sessionHandler,
  auth: authHandler,
  'body-measurements': bodyMeasurementsHandler,
  'body-inbox': bodyInboxHandler,
  'body-capture-ingest': bodyCaptureIngestHandler,
  'body-cadences': bodyCadencesHandler,
  'fit-profile-preview': fitProfilePreviewHandler,
  'fit-profile-commit': fitProfileCommitHandler,
  'training-exercises': trainingExercisesHandler,
  'training-templates': trainingTemplatesHandler,
  'training-sessions': trainingSessionsHandler,
  'training-session-detail': trainingSessionDetailHandler,
  'transcription-jobs': transcriptionJobsHandler,
  'transcription-job-detail': transcriptionJobDetailHandler,
  'transcription-commit': transcriptionCommitHandler,
  'progress-overview': progressOverviewHandler,
  'progress-insights': progressInsightsHandler,
  'progress-weekly': progressWeeklyHandler,
  'progress-activity': progressActivityHandler,
  'progress-sleep': progressSleepHandler,
  'progress-sleep-detail': progressSleepDetailHandler,
  'progress-timeline': progressTimelineHandler,
  'progress-compare': progressCompareHandler,
  'progress-checkpoints': progressCheckpointsHandler,
  'progress-checkpoint-detail': progressCheckpointDetailHandler,
  'nutrition-day': nutritionDayHandler,
  'nutrition-entries': nutritionEntriesHandler,
  'nutrition-entry-detail': nutritionEntryDetailHandler,
  'nutrition-foods': nutritionFoodsHandler,
  'nutrition-food-detail': nutritionFoodDetailHandler,
  'nutrition-legacy-import': nutritionLegacyImportHandler,
  'nutrition-targets': nutritionTargetsHandler,
  'nutrition-barcode': nutritionBarcodeHandler,
  'nutrition-label-jobs': nutritionLabelJobsHandler,
  'nutrition-label-job-detail': nutritionLabelJobDetailHandler,
  'nutrition-label-commit': nutritionLabelCommitHandler,
  'nutrition-meal-jobs': nutritionMealJobsHandler,
  'nutrition-meal-job-detail': nutritionMealJobDetailHandler,
  'nutrition-meal-commit': nutritionMealCommitHandler,
  'nutrition-describe': nutritionDescribeHandler,
  'nutrition-recipes': nutritionRecipesHandler,
  'nutrition-recipe-foods': nutritionRecipeFoodsHandler,
  'apple-health-import': appleHealthImportHandler,
  'apple-health-sync': appleHealthSyncHandler,
  today: todayHandler,
  supplements: supplementsHandler,
  context: contextHandler,
  lab: labHandler,
  goals: goalsHandler,
  'ask-health': askHealthHandler,
  'ask-health-literature': askHealthLiteratureHandler,
  'backup-export': backupExportHandler,
  coach: coachHandler,
  rewards: rewardsHandler,
}

function isSingleSegmentAfter(pathname: string, prefix: string): boolean {
  if (!pathname.startsWith(prefix)) {
    return false
  }
  const rest = pathname.slice(prefix.length)
  return rest.length > 0 && !rest.includes('/')
}

export function matchHealthApiRoute(pathname: string): HealthApiRoute | null {
  switch (pathname) {
    case '/api/health':
      return 'health'
    case '/api/today':
      return 'today'
    case '/api/backup/export':
      return 'backup-export'
    case '/api/coach':
    case '/api/coach/ensure':
    case '/api/coach/lab/snooze':
      return 'coach'
    case '/api/session':
      return 'session'
    case '/api/body/measurements':
      return 'body-measurements'
    case '/api/body/inbox':
      return 'body-inbox'
    case '/api/ingest/body':
      return 'body-capture-ingest'
    case '/api/body/import/fit-profile/preview':
      return 'fit-profile-preview'
    case '/api/body/import/fit-profile/commit':
      return 'fit-profile-commit'
    case '/api/training/exercises':
      return 'training-exercises'
    case '/api/training/templates':
      return 'training-templates'
    case '/api/training/sessions':
      return 'training-sessions'
    case '/api/training/transcription/jobs':
      return 'transcription-jobs'
    case '/api/training/transcription/commit':
      return 'transcription-commit'
    case '/api/progress/overview':
      return 'progress-overview'
    case '/api/progress/insights':
      return 'progress-insights'
    case '/api/progress/weekly':
      return 'progress-weekly'
    case '/api/progress/activity':
      return 'progress-activity'
    case '/api/progress/sleep':
      return 'progress-sleep'
    case '/api/progress/timeline':
      return 'progress-timeline'
    case '/api/progress/compare':
      return 'progress-compare'
    case '/api/progress/checkpoints':
      return 'progress-checkpoints'
    case '/api/nutrition/day':
      return 'nutrition-day'
    case '/api/nutrition/entries':
      return 'nutrition-entries'
    case '/api/nutrition/foods':
      return 'nutrition-foods'
    case '/api/nutrition/targets':
      return 'nutrition-targets'
    case '/api/nutrition/barcode/save':
      return 'nutrition-barcode'
    case '/api/nutrition/label/jobs':
      return 'nutrition-label-jobs'
    case '/api/nutrition/label/commit':
      return 'nutrition-label-commit'
    case '/api/nutrition/meal/jobs':
      return 'nutrition-meal-jobs'
    case '/api/nutrition/meal/commit':
      return 'nutrition-meal-commit'
    case '/api/nutrition/describe':
    case '/api/nutrition/describe/commit':
      return 'nutrition-describe'
    case '/api/nutrition/usda/search':
    case '/api/nutrition/usda/foods':
    case '/api/nutrition/recipe-foods':
      return 'nutrition-recipe-foods'
    case '/api/nutrition/import/legacy/preview':
    case '/api/nutrition/import/legacy/commit':
      return 'nutrition-legacy-import'
    case '/api/apple-health/import/status':
    case '/api/apple-health/import/preview':
    case '/api/apple-health/import/commit':
      return 'apple-health-import'
    case '/api/ingest/apple-health':
      return 'apple-health-sync'
    case '/api/ask-health':
      return 'ask-health'
    case '/api/ask-health/literature':
      return 'ask-health-literature'
    default:
      break
  }
  if (pathname === '/api/nutrition/recipe-entries' || pathname === '/api/nutrition/recipes' || pathname.startsWith('/api/nutrition/recipes/')) {
    return 'nutrition-recipes'
  }
  if (pathname === '/api/supplements' || pathname.startsWith('/api/supplements/')) {
    return 'supplements'
  }
  if (pathname === '/api/context/days' || pathname.startsWith('/api/context/days/')) {
    return 'context'
  }
  if (pathname === '/api/lab' || pathname.startsWith('/api/lab/')) {
    return 'lab'
  }
  if (pathname === '/api/goals' || pathname.startsWith('/api/goals/')) {
    return 'goals'
  }
  if (pathname.startsWith('/api/coach/tasks/')) {
    return 'coach'
  }
  if (pathname === '/api/rewards' || pathname.startsWith('/api/rewards/')) {
    return 'rewards'
  }
  if (pathname === '/api/body/inbox' || pathname.startsWith('/api/body/inbox/')) {
    return 'body-inbox'
  }
  if (pathname === '/api/body/measurements' || pathname.startsWith('/api/body/measurements/')) {
    return 'body-measurements'
  }
  if (pathname === '/api/body/cadences' || pathname.startsWith('/api/body/cadences/')) {
    return 'body-cadences'
  }
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    return 'auth'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/exercises/')) {
    return 'training-exercises'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/templates/')) {
    return 'training-templates'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/sessions/')) {
    return 'training-session-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/transcription/jobs/')) {
    return 'transcription-job-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/progress/checkpoints/')) {
    return 'progress-checkpoint-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/progress/sleep/')) {
    return 'progress-sleep-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/nutrition/entries/')) {
    return 'nutrition-entry-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/nutrition/foods/')) {
    return 'nutrition-food-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/nutrition/barcode/')) {
    return 'nutrition-barcode'
  }
  if (pathname.startsWith('/api/nutrition/label/jobs/')) {
    const rest = pathname.slice('/api/nutrition/label/jobs/'.length)
    if (rest.length > 0 && (rest.split('/').length === 1 || rest.endsWith('/image') || rest.endsWith('/reanalyze'))) {
      return 'nutrition-label-job-detail'
    }
  }
  if (pathname.startsWith('/api/nutrition/meal/jobs/')) {
    const rest = pathname.slice('/api/nutrition/meal/jobs/'.length)
    const parts = rest.split('/')
    if (
      parts.length === 1 ||
      (parts.length === 2 && (parts[1] === 'image' || parts[1] === 'reanalyze')) ||
      (parts.length === 3 && parts[1] === 'images' && /^\d+$/.test(parts[2] ?? ''))
    ) {
      return 'nutrition-meal-job-detail'
    }
  }
  return null
}

export async function dispatchHealthApi(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const route = matchHealthApiRoute(requestApiPathname(req))
    if (!route) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    await HANDLERS[route](req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}
