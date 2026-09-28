import { withOwnerAuth } from '../auth/with-owner.js'
import { commitBodyCapture, discardBodyCapture, getBodyInbox, listBodyInbox } from '../body/body-capture-service.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function matchBodyInboxRoute(
  pathname: string,
): { kind: 'list' } | { kind: 'detail' | 'commit' | 'discard'; id: string } | null {
  if (pathname === '/api/body/inbox') {
    return { kind: 'list' }
  }
  const prefix = '/api/body/inbox/'
  if (!pathname.startsWith(prefix)) {
    return null
  }
  const rest = pathname.slice(prefix.length)
  const [id, action] = rest.split('/')
  if (!id || !UUID.test(id) || rest.split('/').length > 2) {
    return null
  }
  if (!action) {
    return { kind: 'detail', id }
  }
  if (action === 'commit') {
    return { kind: 'commit', id }
  }
  if (action === 'discard') {
    return { kind: 'discard', id }
  }
  return null
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleBodyInbox(req: ApiRequest, res: ApiResponse) {
  const route = matchBodyInboxRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'list') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, await listBodyInbox())
    return
  }
  if (route.kind === 'detail') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, await getBodyInbox(route.id))
    return
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST')
    return
  }
  if (route.kind === 'commit') {
    sendJson(res, 200, await commitBodyCapture(route.id, await readJsonBody(req)))
    return
  }
  sendJson(res, 200, await discardBodyCapture(route.id))
}

async function guarded(req: ApiRequest, res: ApiResponse) {
  try {
    await handleBodyInbox(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(guarded)
