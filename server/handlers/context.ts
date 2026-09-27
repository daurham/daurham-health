import {
  deleteDailyContext,
  getDailyContext,
  listDailyContexts,
  putDailyContext,
} from '../context/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  requestApiPathname,
  requestQueryValue,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const DATE_PATH = /^\/api\/context\/days\/(\d{4}-\d{2}-\d{2})$/

export function matchContextRoute(
  pathname: string,
): { kind: 'collection' } | { kind: 'day'; date: string } | null {
  if (pathname === '/api/context/days') {
    return { kind: 'collection' }
  }
  const match = DATE_PATH.exec(pathname)
  if (!match?.[1]) {
    return null
  }
  return { kind: 'day', date: match[1] }
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleContext(req: ApiRequest, res: ApiResponse) {
  const route = matchContextRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'collection') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(
      res,
      200,
      {
        contexts: await listDailyContexts(
          requestQueryValue(req, 'start') ?? '',
          requestQueryValue(req, 'end') ?? '',
        ),
      },
    )
    return
  }
  if (req.method === 'GET') {
    sendJson(res, 200, { context: await getDailyContext(route.date) })
    return
  }
  if (req.method === 'PUT') {
    sendJson(res, 200, await putDailyContext(route.date, await readJsonBody(req)))
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, { deleted: await deleteDailyContext(route.date) })
    return
  }
  methodNotAllowed(res, 'GET, PUT, DELETE')
}

async function contextHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handleContext(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(contextHandler)
