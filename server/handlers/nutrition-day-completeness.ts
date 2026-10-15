import { getNutritionDayCompleteness, saveNutritionDayCompleteness } from '../nutrition/day-completeness.js'
import { parseNutritionDayQuery } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError, readJsonBody, requestQueryValue, sendJson,
  type ApiRequest, type ApiResponse,
} from '../http.js'

export async function handleNutritionDayCompleteness(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      const date = parseNutritionDayQuery(requestQueryValue(req, 'date'))
      sendJson(res, 200, { day: await getNutritionDayCompleteness(date) })
      return
    }
    if (req.method === 'PUT') {
      sendJson(res, 200, { day: await saveNutritionDayCompleteness(await readJsonBody(req)) })
      return
    }
    res.setHeader('Allow', 'GET, PUT')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleNutritionDayCompleteness)
