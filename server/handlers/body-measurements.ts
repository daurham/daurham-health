import {
  createManualMeasurement,
  deleteManualMeasurement,
  updateManualMeasurement,
} from '../body/manual-service.js'
import { listBodyMeasurements } from '../body/fit-profile-import.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function matchBodyMeasurementRoute(pathname: string): { kind: 'collection' } | { kind: 'detail'; id: string } | null {
  if (pathname === '/api/body/measurements') {
    return { kind: 'collection' }
  }
  const prefix = '/api/body/measurements/'
  if (!pathname.startsWith(prefix)) {
    return null
  }
  const id = pathname.slice(prefix.length)
  if (!UUID.test(id) || id.includes('/')) {
    return null
  }
  return { kind: 'detail', id }
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleBodyMeasurements(req: ApiRequest, res: ApiResponse) {
  const route = matchBodyMeasurementRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'collection') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listBodyMeasurements())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createManualMeasurement(await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'GET, POST')
    return
  }
  if (req.method === 'PATCH') {
    sendJson(res, 200, await updateManualMeasurement(route.id, await readJsonBody(req)))
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, await deleteManualMeasurement(route.id))
    return
  }
  methodNotAllowed(res, 'PATCH, DELETE')
}

async function guarded(req: ApiRequest, res: ApiResponse) {
  try {
    await handleBodyMeasurements(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(guarded)
