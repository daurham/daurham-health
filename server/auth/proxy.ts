import { handleAuthProxyRequest } from '@neondatabase/neon-js/auth/server'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { getNeonAuthProxyConfig } from './config.js'
import { authProxyPath, incomingToWebRequest, writeWebResponse } from './node-request.js'

const BLOCKED_AUTH_PATHS = new Set([
  'sign-up',
  'sign-up/email',
  'forget-password',
  'request-password-reset',
  'reset-password',
])

export async function proxyNeonAuth(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (!req.method) {
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const path = authProxyPath(req)
    if (path.length === 0 || BLOCKED_AUTH_PATHS.has(path) || path.startsWith('sign-up/')) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    const config = await getNeonAuthProxyConfig()
    const request = await incomingToWebRequest(req)
    const response = await handleAuthProxyRequest({
      request,
      path,
      baseUrl: config.authBaseUrl,
      cookieSecret: config.cookieSecret,
      sessionDataTtl: config.sessionDataTtl,
      sameSite: config.sameSite,
    })
    await writeWebResponse(res, response)
  } catch (error) {
    handleApiError(res, error)
  }
}
