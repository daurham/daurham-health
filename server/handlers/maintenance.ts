import { isCalendarDate } from '../../src/domain/training.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { currentHealthDate } from '../health-time.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { loadMaintenanceState } from '../intelligence/maintenance.js'

export async function handleMaintenance(req: ApiRequest, res: ApiResponse): Promise<void> {
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
    sendJson(res, 200, { maintenance: await loadMaintenanceState({ asOf }) })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleMaintenance)
