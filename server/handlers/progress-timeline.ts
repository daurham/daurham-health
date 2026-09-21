import { getProgressTimeline } from '../progress/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function progressTimelineHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(
      res,
      200,
      await getProgressTimeline({
        range: requestQueryValue(req, 'range'),
        asOf: requestQueryValue(req, 'asOf'),
      }),
    )
  } catch (error) {
    handleApiError(res, error)
  }
})
