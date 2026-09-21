import { createNutritionFood, searchNutritionFoods } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, queryStringParam, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionFoodsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, { foods: await searchNutritionFoods(queryStringParam(req, 'query')) })
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createNutritionFood(await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
