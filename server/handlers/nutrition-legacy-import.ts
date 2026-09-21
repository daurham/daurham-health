import { commitLegacyNutrition, previewLegacyNutrition } from '../nutrition/migrate.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionLegacyImportHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const pathname = requestApiPathname(req)
    if (pathname === '/api/nutrition/import/legacy/preview') {
      sendJson(res, 200, await previewLegacyNutrition())
      return
    }
    if (pathname === '/api/nutrition/import/legacy/commit') {
      sendJson(res, 200, await commitLegacyNutrition())
      return
    }
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    handleApiError(res, error)
  }
})
