import { handleApiError, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from './http.js'
import authHandler from './handlers/auth.js'
import bodyMeasurementsHandler from './handlers/body-measurements.js'
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

export type HealthApiRoute =
  | 'health'
  | 'session'
  | 'auth'
  | 'body-measurements'
  | 'fit-profile-preview'
  | 'fit-profile-commit'
  | 'training-exercises'
  | 'training-templates'
  | 'training-sessions'
  | 'training-session-detail'
  | 'transcription-jobs'
  | 'transcription-job-detail'
  | 'transcription-commit'

type HealthApiHandler = (req: ApiRequest, res: ApiResponse) => unknown | Promise<unknown>

const HANDLERS: Record<HealthApiRoute, HealthApiHandler> = {
  health: healthHandler,
  session: sessionHandler,
  auth: authHandler,
  'body-measurements': bodyMeasurementsHandler,
  'fit-profile-preview': fitProfilePreviewHandler,
  'fit-profile-commit': fitProfileCommitHandler,
  'training-exercises': trainingExercisesHandler,
  'training-templates': trainingTemplatesHandler,
  'training-sessions': trainingSessionsHandler,
  'training-session-detail': trainingSessionDetailHandler,
  'transcription-jobs': transcriptionJobsHandler,
  'transcription-job-detail': transcriptionJobDetailHandler,
  'transcription-commit': transcriptionCommitHandler,
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
    case '/api/session':
      return 'session'
    case '/api/body/measurements':
      return 'body-measurements'
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
    default:
      break
  }
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) {
    return 'auth'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/sessions/')) {
    return 'training-session-detail'
  }
  if (isSingleSegmentAfter(pathname, '/api/training/transcription/jobs/')) {
    return 'transcription-job-detail'
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
