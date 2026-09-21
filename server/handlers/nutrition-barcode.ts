import { lookupNutritionBarcode, NutritionBarcodeError, savePackagedFoodAndLog } from '../nutrition/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  HttpError,
  pathParamAfter,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

export default withOwnerAuth(async function nutritionBarcodeHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const pathname = requestApiPathname(req)
    if (pathname === '/api/nutrition/barcode/save') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      sendJson(res, 201, await savePackagedFoodAndLog(await readJsonBody(req)))
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const barcode = pathParamAfter(req, '/api/nutrition/barcode')
    if (!barcode) {
      throw new HttpError(404, 'Not found')
    }
    sendJson(res, 200, await lookupNutritionBarcode(barcode))
  } catch (error) {
    if (error instanceof NutritionBarcodeError) {
      sendJson(res, error.statusCode, {
        error: error.message,
        code: error.code,
        barcode: error.barcode ?? null,
      })
      return
    }
    handleApiError(res, error)
  }
})
