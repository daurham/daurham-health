import { isCalendarDate } from '../../src/domain/training.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { currentHealthDate } from '../health-time.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { loadGoalControlState } from '../intelligence/goal-control.js'

export async function handleGoalControl(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const today = await currentHealthDate()
    const asOf = requestQueryValue(req, 'asOf') ?? today
    if (!isCalendarDate(asOf) || asOf > today) {
      sendJson(res, 400, { error: 'asOf must be a non-future YYYY-MM-DD Health date' })
      return
    }
    sendJson(res, 200, { goalControl: await loadGoalControlState(asOf) })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleGoalControl)
