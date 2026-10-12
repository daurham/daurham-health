import { getAiUsageReport } from '../ai-usage/report.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function aiUsageHandler(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  try {
    sendJson(res, 200, await getAiUsageReport())
  } catch (error) {
    handleApiError(res, error)
  }
})
