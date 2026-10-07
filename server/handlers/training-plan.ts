import {
  deleteTrainingDayOverride,
  getTrainingPlan,
  moveTrainingDay,
  putTrainingDayOverride,
  putTrainingPlan,
} from '../training/plan-service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  requestApiPathname,
  requestQueryValue,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const OVERRIDE_PATH = /^\/api\/training\/plan\/overrides\/(\d{4}-\d{2}-\d{2})$/

async function handleTrainingPlan(req: ApiRequest, res: ApiResponse) {
  const pathname = requestApiPathname(req)

  if (pathname === '/api/training/plan') {
    if (req.method === 'GET') {
      sendJson(res, 200, { plan: await getTrainingPlan(requestQueryValue(req, 'asOf') ?? undefined) })
      return
    }
    if (req.method === 'PUT') {
      sendJson(res, 200, { plan: await putTrainingPlan(await readJsonBody(req)) })
      return
    }
    res.setHeader('Allow', 'GET, PUT')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (pathname === '/api/training/plan/move') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, { plan: await moveTrainingDay(await readJsonBody(req)) })
    return
  }

  const match = OVERRIDE_PATH.exec(pathname)
  if (!match?.[1]) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  const date = match[1]
  if (req.method === 'PUT') {
    sendJson(res, 200, { plan: await putTrainingDayOverride(date, await readJsonBody(req)) })
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, { plan: await deleteTrainingDayOverride(date) })
    return
  }
  res.setHeader('Allow', 'PUT, DELETE')
  sendJson(res, 405, { error: 'Method not allowed' })
}

async function trainingPlanHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handleTrainingPlan(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(trainingPlanHandler)
