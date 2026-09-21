import { listTemplates } from '../../server/training/service.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../../server/http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await listTemplates())
  } catch (error) {
    handleApiError(res, error)
  }
}
