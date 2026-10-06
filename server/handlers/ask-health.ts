import { parseAskHealthRequest } from '../../src/domain/ask-health/index.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { answerAskHealth } from '../ask-health/service.js'
import { currentHealthDate } from '../health-time.js'

export async function handleAskHealth(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const body = await readJsonBody(req)
    const parsed = parseAskHealthRequest(body, await currentHealthDate())
    if (!parsed.ok) {
      sendJson(res, 400, { error: parsed.error })
      return
    }
    sendJson(res, 200, await answerAskHealth(parsed.value))
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleAskHealth)
