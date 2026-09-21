import { withOwnerAuth } from '../auth/with-owner.js'
import { sendJson, type ApiRequest, type ApiResponse } from '../http.js'

async function sessionHandler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  sendJson(res, 200, { owner: true })
}

export default withOwnerAuth(sessionHandler)
