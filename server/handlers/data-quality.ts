import { getDataQuality, reviewDataQualityIssue } from '../intelligence/data-quality.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

async function handle(req: ApiRequest, res: ApiResponse) {
  const pathname = requestApiPathname(req)
  if (pathname === '/api/data-quality') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      return sendJson(res, 405, { error: 'Method not allowed' })
    }
    return sendJson(res, 200, { quality: await getDataQuality() })
  }
  if (pathname === '/api/data-quality/reviews') {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      return sendJson(res, 405, { error: 'Method not allowed' })
    }
    const body = await readJsonBody(req) as { fingerprint?: unknown; status?: unknown; note?: unknown }
    if (typeof body.fingerprint !== 'string' || body.fingerprint.trim() === '') {
      return sendJson(res, 400, { error: 'fingerprint is required' })
    }
    if (body.status !== 'confirmed_valid' && body.status !== 'excluded_from_analysis') {
      return sendJson(res, 400, { error: 'Invalid review status' })
    }
    const note = body.note == null ? null : typeof body.note === 'string' ? body.note : null
    return sendJson(res, 200, {
      quality: await reviewDataQualityIssue(body.fingerprint, body.status, note),
    })
  }
  return sendJson(res, 404, { error: 'Not found' })
}

export default withOwnerAuth(async function dataQualityHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handle(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
})
