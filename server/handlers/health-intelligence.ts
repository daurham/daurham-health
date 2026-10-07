import { isCalendarDate } from '../../src/domain/training.js'
import { isProgressRange, type ProgressRange } from '../../src/domain/progress/index.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { currentHealthDate } from '../health-time.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { loadHealthIntelligenceSnapshot } from '../intelligence/snapshot.js'

export async function handleHealthIntelligence(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const rawRange = requestQueryValue(req, 'range') ?? '30d'
    if (!isProgressRange(rawRange)) {
      sendJson(res, 400, { error: 'range must be 30d, 90d, 6m, 1y, or all' })
      return
    }
    const today = await currentHealthDate()
    const asOf = requestQueryValue(req, 'asOf') ?? today
    if (!isCalendarDate(asOf) || asOf > today) {
      sendJson(res, 400, { error: 'asOf must be a non-future YYYY-MM-DD Health date' })
      return
    }
    sendJson(res, 200, {
      snapshot: await loadHealthIntelligenceSnapshot({ range: rawRange as ProgressRange, asOf }),
    })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleHealthIntelligence)
