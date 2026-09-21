import { patchNutritionFood } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, pathParamAfter, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { HttpError } from '../http.js'

export default withOwnerAuth(async function nutritionFoodDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const id = pathParamAfter(req, '/api/nutrition/foods')
    if (!id) {
      throw new HttpError(404, 'Not found')
    }
    if (req.method !== 'PATCH') {
      res.setHeader('Allow', 'PATCH')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await patchNutritionFood(id, await readJsonBody(req)))
  } catch (error) {
    handleApiError(res, error)
  }
})
