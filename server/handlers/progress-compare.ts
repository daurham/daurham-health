import { getProgressCompare } from '../progress/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function progressCompareHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(
      res,
      200,
      await getProgressCompare({
        startA: requestQueryValue(req, 'startA'),
        endA: requestQueryValue(req, 'endA'),
        startB: requestQueryValue(req, 'startB'),
        endB: requestQueryValue(req, 'endB'),
        checkpointId: requestQueryValue(req, 'checkpointId'),
        asOf: requestQueryValue(req, 'asOf'),
      }),
    )
  } catch (error) {
    handleApiError(res, error)
  }
})
