import { withOwnerAuth } from '../auth/with-owner.js'
import { healthCalendarTimeZone } from '../health-time.js'
import { requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { parseWeeklyAsOf } from '../weekly-coach/service.js'
import { loadTrainingProgressionState } from '../intelligence/training-progression.js'

async function handleTrainingProgression(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const timezone = await healthCalendarTimeZone()
  const asOf = parseWeeklyAsOf(requestQueryValue(req, 'asOf'), new Date(), timezone)
  sendJson(res, 200, await loadTrainingProgressionState(asOf))
}

export default withOwnerAuth(handleTrainingProgression)
