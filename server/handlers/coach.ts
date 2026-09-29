import { withOwnerAuth } from '../auth/with-owner.js'
import { requestApiPathname, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import {
  acceptCoachTask,
  endCoachTask,
  ensureCoach,
  logCoachSelfReport,
  logCoachTraining,
  passCoachTask,
  readCoach,
  snoozeCoachLabItem,
} from '../coach/service.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type CoachRoute =
  | { kind: 'root' }
  | { kind: 'ensure' }
  | { kind: 'lab-snooze' }
  | { kind: 'task'; id: string; action: 'accept' | 'end' | 'pass' | 'log-training' | 'log-self-report' }

export function matchCoachRoute(pathname: string): CoachRoute | null {
  if (pathname === '/api/coach') return { kind: 'root' }
  if (pathname === '/api/coach/ensure') return { kind: 'ensure' }
  if (pathname === '/api/coach/lab/snooze') return { kind: 'lab-snooze' }
  const match = /^\/api\/coach\/tasks\/([^/]+)\/(accept|end|pass|log-training|log-self-report)$/.exec(pathname)
  if (!match || !UUID.test(match[1] ?? '')) return null
  return {
    kind: 'task',
    id: match[1]!,
    action: match[2] as 'accept' | 'end' | 'pass' | 'log-training' | 'log-self-report',
  }
}

export async function handleCoach(req: ApiRequest, res: ApiResponse) {
  const route = matchCoachRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  if (route.kind === 'root') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await readCoach())
    return
  }

  if (route.kind === 'ensure') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await ensureCoach())
    return
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  if (route.kind === 'lab-snooze') {
    sendJson(res, 200, await snoozeCoachLabItem(await readJsonBody(req)))
    return
  }

  if (route.action === 'accept') {
    sendJson(res, 200, await acceptCoachTask(route.id))
    return
  }
  if (route.action === 'end') {
    sendJson(res, 200, await endCoachTask(route.id))
    return
  }
  if (route.action === 'pass') {
    sendJson(res, 200, await passCoachTask(route.id))
    return
  }

  const body = await readJsonBody(req)
  if (route.action === 'log-training') {
    sendJson(res, 200, await logCoachTraining(route.id, body))
    return
  }
  sendJson(res, 200, await logCoachSelfReport(route.id, body))
}

export default withOwnerAuth(handleCoach)
