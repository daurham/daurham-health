import { patchNutritionEntry, removeNutritionEntry } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, pathParamAfter, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { HttpError } from '../http.js'

export default withOwnerAuth(async function nutritionEntryDetailHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const id = pathParamAfter(req, '/api/nutrition/entries')
    if (!id) {
      throw new HttpError(404, 'Not found')
    }
    if (req.method === 'PATCH') {
      sendJson(res, 200, await patchNutritionEntry(id, await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      await removeNutritionEntry(id)
      sendJson(res, 200, { ok: true })
      return
    }
    res.setHeader('Allow', 'PATCH, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
})
