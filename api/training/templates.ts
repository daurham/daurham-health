import { listTemplates } from '../../server/training/service.js'
import { withOwnerAuth } from '../../server/auth/with-owner.js'
import { sendJson, type ApiRequest, type ApiResponse } from '../../server/http.js'

async function templatesHandler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  sendJson(res, 200, await listTemplates())
}

export default withOwnerAuth(templatesHandler)
