import { deleteProgressCheckpoint, updateProgressCheckpoint } from '../progress/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  pathParamAfter,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const PREFIX = '/api/progress/checkpoints'

export default withOwnerAuth(async function progressCheckpointDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const id = pathParamAfter(req, PREFIX)
    if (req.method === 'PATCH') {
      sendJson(res, 200, await updateProgressCheckpoint(id ?? '', await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await deleteProgressCheckpoint(id ?? ''))
      return
    }
    res.setHeader('Allow', 'PATCH, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
