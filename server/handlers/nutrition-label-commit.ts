import { commitNutritionLabel } from '../nutrition/label.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionLabelCommitHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 201, await commitNutritionLabel(await readJsonBody(req)))
  } catch (error) {
    handleApiError(res, error)
  }
})
