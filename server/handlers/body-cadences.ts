import { deleteCadence, listCadences, saveCadence } from '../body/cadence-service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const METRIC_KEY = /^[a-z][a-z0-9_]*$/

export function matchBodyCadenceRoute(pathname: string): { kind: 'collection' } | { kind: 'metric'; metricKey: string } | null {
  if (pathname === '/api/body/cadences') {
    return { kind: 'collection' }
  }
  const prefix = '/api/body/cadences/'
  if (!pathname.startsWith(prefix)) {
    return null
  }
  const metricKey = pathname.slice(prefix.length)
  if (!METRIC_KEY.test(metricKey) || metricKey.includes('/')) {
    return null
  }
  return { kind: 'metric', metricKey }
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleBodyCadences(req: ApiRequest, res: ApiResponse) {
  const route = matchBodyCadenceRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'collection') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listCadences())
      return
    }
    methodNotAllowed(res, 'GET')
    return
  }
  if (req.method === 'PUT') {
    sendJson(res, 200, await saveCadence(route.metricKey, await readJsonBody(req)))
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, await deleteCadence(route.metricKey))
    return
  }
  methodNotAllowed(res, 'PUT, DELETE')
}

async function guarded(req: ApiRequest, res: ApiResponse) {
  try {
    await handleBodyCadences(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(guarded)
