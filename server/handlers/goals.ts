import {
  archiveGoal,
  changeGoalLifecycle,
  createGoal,
  getGoal,
  listGoals,
  readGoalProjection,
  reviseGoal,
} from '../goals/service.js'
import { healthCalendarDateFromNow } from '../../src/domain/time.js'
import { parseProjectionAsOf } from '../../src/domain/goal-projection.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { HttpError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const ITEM = new RegExp(`^/api/goals/(${UUID})(?:/(pause|resume|complete|reopen|versions|projection))?$`, 'i')

export function matchGoalRoute(pathname: string):
  | { kind: 'list' }
  | { kind: 'item'; id: string; action: 'pause' | 'resume' | 'complete' | 'reopen' | 'versions' | 'projection' | null }
  | null {
  if (pathname === '/api/goals') {
    return { kind: 'list' }
  }
  const match = ITEM.exec(pathname)
  if (!match?.[1]) {
    return null
  }
  const action = match[2]
  if (action === 'pause' || action === 'resume' || action === 'complete' || action === 'reopen' || action === 'versions' || action === 'projection') {
    return { kind: 'item', id: match[1], action }
  }
  return { kind: 'item', id: match[1], action: null }
}

export async function handleGoals(req: ApiRequest, res: ApiResponse): Promise<void> {
  const route = matchGoalRoute(requestApiPathname(req))
  if (!route) {
    throw new HttpError(404, 'Not found')
  }
  if (route.kind === 'list') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listGoals())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createGoal(await readJsonBody(req)))
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  if (route.action === 'projection') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const url = new URL(req.url ?? '/', 'http://health.local')
    const parsed = parseProjectionAsOf(url.searchParams.get('asOf'), healthCalendarDateFromNow())
    if ('error' in parsed) {
      throw new HttpError(400, parsed.error)
    }
    sendJson(res, 200, await readGoalProjection(route.id, parsed.asOf))
    return
  }
  if (route.action === 'versions') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 201, await reviseGoal(route.id, await readJsonBody(req)))
    return
  }
  if (route.action) {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await changeGoalLifecycle(route.id, route.action))
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, await archiveGoal(route.id))
    return
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  sendJson(res, 200, await getGoal(route.id))
}

export default withOwnerAuth(handleGoals)
