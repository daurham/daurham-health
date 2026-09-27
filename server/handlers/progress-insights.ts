import { getProactiveInsights } from '../insights/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, requestQueryValue, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export async function handleProgressInsights(req: ApiRequest, res: ApiResponse) {
  try {
    sendJson(
      res,
      200,
      await getProactiveInsights({
        range: requestQueryValue(req, 'range'),
        asOf: requestQueryValue(req, 'asOf'),
      }),
    )
  } catch (error) {
    handleApiError(res, error)
  }
}

const readInsights = withOwnerAuth(handleProgressInsights)

export default async function progressInsightsRoute(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  return readInsights(req, res)
}
