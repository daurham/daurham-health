import { getHealthProfile, putHealthProfile } from '../profile/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

async function handleProfile(req: ApiRequest, res: ApiResponse) {
  if (req.method === 'GET') {
    sendJson(res, 200, { profile: await getHealthProfile() })
    return
  }
  if (req.method === 'PUT') {
    sendJson(res, 200, { profile: await putHealthProfile(await readJsonBody(req)) })
    return
  }
  res.setHeader('Allow', 'GET, PUT')
  sendJson(res, 405, { error: 'Method not allowed' })
}

async function profileHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handleProfile(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(profileHandler)
