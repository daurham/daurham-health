import { listTemplates } from '../training/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { sendJson, type ApiRequest, type ApiResponse } from '../http.js'

async function templatesHandler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  sendJson(res, 200, await listTemplates())
}

export default withOwnerAuth(templatesHandler)
