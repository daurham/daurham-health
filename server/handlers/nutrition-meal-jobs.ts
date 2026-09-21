import { createNutritionMealJob, listNutritionMealJobs } from '../nutrition/meal.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionMealJobsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === 'GET') {
      sendJson(res, 200, await listNutritionMealJobs())
      return
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 202, await createNutritionMealJob(req))
  } catch (error) {
    handleApiError(res, error)
  }
})
