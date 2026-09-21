import { z } from 'zod'
import { getSession } from '../training/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  pathParamAfter,
  queryStringParam,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const sessionIdSchema = z.uuid()

const SESSION_PATH_PREFIX = '/api/training/sessions'

export function sessionIdFromRequest(req: ApiRequest): string | null {
  return queryStringParam(req, 'id') ?? pathParamAfter(req, SESSION_PATH_PREFIX)
}

export default withOwnerAuth(async function sessionDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const parsed = sessionIdSchema.safeParse(sessionIdFromRequest(req))
    if (!parsed.success) {
      sendJson(res, 400, { error: 'Workout id is invalid' })
      return
    }
    sendJson(res, 200, await getSession(parsed.data))
  } catch (error) {
    handleApiError(res, error)
  }
})
