import { saveAiReusableFood, saveUsdaReusableFood, searchUsdaFoods } from '../nutrition/recipe-ingredients.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function nutritionRecipeFoodsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const pathname = requestApiPathname(req)
    const body = await readJsonBody(req)
    if (pathname === '/api/nutrition/usda/search') {
      const query = body && typeof body === 'object' && !Array.isArray(body) ? (body as { query?: unknown }).query : ''
      sendJson(res, 200, await searchUsdaFoods(typeof query === 'string' ? query : ''))
      return
    }
    if (pathname === '/api/nutrition/usda/foods') {
      sendJson(res, 200, await saveUsdaReusableFood(body))
      return
    }
    if (pathname === '/api/nutrition/recipe-foods') {
      sendJson(res, 200, await saveAiReusableFood(body))
      return
    }
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    handleApiError(res, error)
  }
})
