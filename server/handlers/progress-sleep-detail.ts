import { getSleepNightDetail } from '../progress/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function progressSleepDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const sleepDate = requestApiPathname(req).split('/').pop() ?? ''
    sendJson(res, 200, await getSleepNightDetail(decodeURIComponent(sleepDate)))
  } catch (error) {
    handleApiError(res, error)
  }
})
