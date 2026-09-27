import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { generateWeeklyCoach, parseWeeklyAsOf, readWeeklyCoach } from '../weekly-coach/service.js'

async function readWeeklyCoachRequest(req: ApiRequest, res: ApiResponse) {
  try {
    sendJson(res, 200, await readWeeklyCoach(parseWeeklyAsOf(requestQueryValue(req, 'asOf'))))
  } catch (error) {
    handleApiError(res, error)
  }
}

async function generateWeeklyCoachRequest(req: ApiRequest, res: ApiResponse) {
  try {
    sendJson(res, 200, await generateWeeklyCoach({ asOf: parseWeeklyAsOf(requestQueryValue(req, 'asOf')) }))
  } catch (error) {
    handleApiError(res, error)
  }
}

const readRoute = withOwnerAuth(readWeeklyCoachRequest)
const generateRoute = withOwnerAuth(generateWeeklyCoachRequest)

export { readWeeklyCoachRequest, generateWeeklyCoachRequest }

export default async function progressWeeklyRoute(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  if (req.method === 'GET') {
    return readRoute(req, res)
  }
  return generateRoute(req, res)
}
