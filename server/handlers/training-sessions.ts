import { createManualSession, listSessions } from '../training/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

async function sessionsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await listSessions())
      return
    }
    if (req.method === 'POST') {
      const body = await readJsonBody(req)
      sendJson(res, 201, await createManualSession(body))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(sessionsHandler)
