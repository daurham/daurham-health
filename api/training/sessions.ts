import { createManualSession, listSessions } from '../../server/training/service.js'
import {
  handleApiError,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../server/http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
