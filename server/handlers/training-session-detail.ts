import { z } from 'zod'
import { deleteManualSession, getSession, updateManualSession } from '../training/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  pathParamAfter,
  queryStringParam,
  readJsonBody,
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
    const parsed = sessionIdSchema.safeParse(sessionIdFromRequest(req))
    if (!parsed.success) {
      sendJson(res, 400, { error: 'Workout id is invalid' })
      return
    }
    if (req.method === 'GET') {
      sendJson(res, 200, await getSession(parsed.data))
      return
    }
    if (req.method === 'PATCH' || req.method === 'PUT') {
      sendJson(res, 200, await updateManualSession(parsed.data, await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      await deleteManualSession(parsed.data)
      sendJson(res, 200, { deleted: true, id: parsed.data })
      return
    }
    res.setHeader('Allow', 'GET, PATCH, PUT, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
