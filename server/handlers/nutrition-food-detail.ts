import { getNutritionFood, patchNutritionFood } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, pathParamAfter, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { HttpError } from '../http.js'

export default withOwnerAuth(async function nutritionFoodDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const id = pathParamAfter(req, '/api/nutrition/foods')
    if (!id) {
      throw new HttpError(404, 'Not found')
    }
    if (req.method === 'GET') {
      sendJson(res, 200, await getNutritionFood(id))
      return
    }
    if (req.method === 'PATCH') {
      sendJson(res, 200, await patchNutritionFood(id, await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, PATCH')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
