import {
  COACH_RECOMMENDATION_OUTCOMES,
  COACH_RECOMMENDATION_RESPONSES,
  type CoachRecommendationOutcome,
  type CoachRecommendationResponse,
} from '../../src/domain/coach-intelligence.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { healthTimeContext } from '../health-time.js'
import { readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import {
  loadCoachIntelligenceState,
  recordCoachRecommendationOutcome,
  respondCoachRecommendation,
} from '../intelligence/coach-intelligence.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Route =
  | { kind: 'root' }
  | { kind: 'respond'; id: string }
  | { kind: 'outcome'; id: string }

export function matchCoachIntelligenceRoute(pathname: string): Route | null {
  if (pathname === '/api/intelligence/coach') return { kind: 'root' }
  const match = /^\/api\/intelligence\/coach\/recommendations\/([^/]+)\/(respond|outcome)$/.exec(pathname)
  if (!match || !UUID.test(match[1] ?? '')) return null
  return { kind: match[2] as 'respond' | 'outcome', id: match[1]! }
}

async function handleCoachIntelligence(req: ApiRequest, res: ApiResponse) {
  const route = matchCoachIntelligenceRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  const { date } = await healthTimeContext(new Date())
  if (route.kind === 'root') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await loadCoachIntelligenceState(date))
    return
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  const raw = await readJsonBody(req)
  const body = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {}
  if (route.kind === 'respond') {
    const response = typeof body.response === 'string' ? body.response as CoachRecommendationResponse : null
    if (!response || !(COACH_RECOMMENDATION_RESPONSES as readonly string[]).includes(response)) {
      sendJson(res, 400, { error: 'Invalid Coach recommendation response' })
      return
    }
    sendJson(res, 200, await respondCoachRecommendation(route.id, response, date))
    return
  }
  const outcome = typeof body.outcome === 'string' ? body.outcome as CoachRecommendationOutcome : null
  if (!outcome || !(COACH_RECOMMENDATION_OUTCOMES as readonly string[]).includes(outcome)) {
    sendJson(res, 400, { error: 'Invalid Coach recommendation outcome' })
    return
  }
  sendJson(res, 200, await recordCoachRecommendationOutcome(route.id, outcome, date))
}

export default withOwnerAuth(handleCoachIntelligence)
