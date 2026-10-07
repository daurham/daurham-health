import { getChangeLedger, resolveChangeCandidate } from '../intelligence/change-ledger.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const CANDIDATE = /^\/api\/intelligence\/changes\/([0-9a-fA-F-]{36})$/

async function handle(req: ApiRequest, res: ApiResponse) {
  const pathname = requestApiPathname(req)
  if (pathname === '/api/intelligence/changes') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return sendJson(res, 405, { error: 'Method not allowed' })
    }
    return sendJson(res, 200, { ledger: await getChangeLedger() })
  }

  const match = CANDIDATE.exec(pathname)
  if (!match?.[1]) return sendJson(res, 404, { error: 'Not found' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return sendJson(res, 405, { error: 'Method not allowed' })
  }
  const body = await readJsonBody(req) as { status?: unknown }
  if (body.status !== 'confirmed' && body.status !== 'dismissed') {
    return sendJson(res, 400, { error: 'status must be confirmed or dismissed' })
  }
  return sendJson(res, 200, { ledger: await resolveChangeCandidate(match[1], body.status) })
}

export default withOwnerAuth(async function changeLedgerHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handle(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
})
