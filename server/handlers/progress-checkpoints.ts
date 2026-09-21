import { createProgressCheckpoint, getProgressCheckpointList } from '../progress/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function progressCheckpointsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await getProgressCheckpointList())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createProgressCheckpoint(await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
