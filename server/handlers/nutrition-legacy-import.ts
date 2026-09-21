import { commitLegacyNutrition, parseLegacyImportOptions, previewLegacyNutrition } from '../nutrition/migrate.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  HttpError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

async function optionalImportOptions(req: ApiRequest) {
  try {
    return parseLegacyImportOptions(await readJsonBody(req))
  } catch (error) {
    if (error instanceof HttpError && error.message === 'Expected JSON body') {
      return parseLegacyImportOptions({})
    }
    throw error
  }
}

export default withOwnerAuth(async function nutritionLegacyImportHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const pathname = requestApiPathname(req)
    const options = await optionalImportOptions(req)
    if (pathname === '/api/nutrition/import/legacy/preview') {
      sendJson(res, 200, await previewLegacyNutrition(undefined, options))
      return
    }
    if (pathname === '/api/nutrition/import/legacy/commit') {
      sendJson(res, 200, await commitLegacyNutrition(undefined, options))
      return
    }
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    handleApiError(res, error)
  }
})
