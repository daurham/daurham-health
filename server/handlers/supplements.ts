import {
  addSchedule,
  createSupplement,
  deleteSupplement,
  listSupplements,
  recordAdherence,
  setLifecycleStatus,
  stopSchedule,
  updateFutureSchedule,
  updateSupplement,
  versionSchedule,
} from '../supplements/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SupplementRoute =
  | { kind: 'collection' }
  | { kind: 'adherence' }
  | { kind: 'detail'; id: string }
  | { kind: 'schedules'; id: string }
  | { kind: 'schedule'; id: string; scheduleId: string }
  | { kind: 'schedule-version'; id: string; scheduleId: string }
  | { kind: 'schedule-stop'; id: string; scheduleId: string }
  | { kind: 'status'; id: string }

function uuid(value: string): string | null {
  return UUID.test(value) ? value : null
}

export function matchSupplementRoute(pathname: string): SupplementRoute | null {
  if (pathname === '/api/supplements') {
    return { kind: 'collection' }
  }
  if (pathname === '/api/supplements/adherence') {
    return { kind: 'adherence' }
  }
  const parts = pathname.split('/').filter((part) => part.length > 0)
  if (parts[0] !== 'api' || parts[1] !== 'supplements') {
    return null
  }
  const id = parts[2] ? uuid(parts[2]) : null
  if (!id) {
    return null
  }
  if (parts.length === 3) {
    return { kind: 'detail', id }
  }
  if (parts.length === 4 && parts[3] === 'schedules') {
    return { kind: 'schedules', id }
  }
  if (parts.length === 4 && parts[3] === 'status') {
    return { kind: 'status', id }
  }
  const scheduleId = parts[3] === 'schedules' && parts[4] ? uuid(parts[4]) : null
  if (!scheduleId) {
    return null
  }
  if (parts.length === 5) {
    return { kind: 'schedule', id, scheduleId }
  }
  if (parts.length === 6 && parts[5] === 'version') {
    return { kind: 'schedule-version', id, scheduleId }
  }
  if (parts.length === 6 && parts[5] === 'stop') {
    return { kind: 'schedule-stop', id, scheduleId }
  }
  return null
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleSupplements(req: ApiRequest, res: ApiResponse): Promise<void> {
  const route = matchSupplementRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'collection') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listSupplements())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createSupplement(await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'GET, POST')
    return
  }
  if (route.kind === 'adherence') {
    if (req.method === 'POST') {
      sendJson(res, 200, await recordAdherence(await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'POST')
    return
  }
  if (route.kind === 'detail') {
    if (req.method === 'GET') {
      const list = await listSupplements()
      const supplement = list.supplements.find((item) => item.id === route.id)
      if (!supplement) {
        sendJson(res, 404, { error: 'Supplement not found' })
        return
      }
      sendJson(res, 200, supplement)
      return
    }
    if (req.method === 'PATCH') {
      sendJson(res, 200, await updateSupplement(route.id, await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await deleteSupplement(route.id))
      return
    }
    methodNotAllowed(res, 'GET, PATCH, DELETE')
    return
  }
  if (route.kind === 'schedules') {
    if (req.method === 'POST') {
      sendJson(res, 201, await addSchedule(route.id, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'POST')
    return
  }
  if (route.kind === 'schedule') {
    if (req.method === 'PATCH') {
      sendJson(res, 200, await updateFutureSchedule(route.id, route.scheduleId, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'PATCH')
    return
  }
  if (route.kind === 'schedule-version') {
    if (req.method === 'POST') {
      sendJson(res, 201, await versionSchedule(route.id, route.scheduleId, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'POST')
    return
  }
  if (route.kind === 'schedule-stop') {
    if (req.method === 'POST') {
      sendJson(res, 200, await stopSchedule(route.id, route.scheduleId, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'POST')
    return
  }
  if (req.method === 'POST') {
    sendJson(res, 200, await setLifecycleStatus(route.id, await readJsonBody(req)))
    return
  }
  methodNotAllowed(res, 'POST')
}

async function supplementsHandler(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    await handleSupplements(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(supplementsHandler)
