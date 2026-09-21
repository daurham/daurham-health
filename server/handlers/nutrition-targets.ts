import { getNutritionTarget, parseNutritionDayQuery, saveNutritionTarget } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, queryStringParam, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionTargetsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { target: await getNutritionTarget(parseNutritionDayQuery(queryStringParam(req, 'date'))) })
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await saveNutritionTarget(await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
