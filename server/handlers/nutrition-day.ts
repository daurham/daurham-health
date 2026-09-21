import { getNutritionDay, parseNutritionDayQuery } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, queryStringParam, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionDayHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await getNutritionDay(parseNutritionDayQuery(queryStringParam(req, 'date'))))
  } catch (error) {
    handleApiError(res, error)
  }
})
