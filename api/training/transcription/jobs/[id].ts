import { z } from 'zod'
import { getTranscriptionJob } from '../../../../server/training/transcription.js'
import { HOME_AI_JOB_ID_RE } from '../../../../src/domain/training-transcription.js'
import { withOwnerAuth } from '../../../../server/auth/with-owner.js'
import {
  handleApiError,
  pathParamAfter,
  queryStringParam,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../../../server/http.js'

const JOB_PATH_PREFIX = '/api/training/transcription/jobs'

export function transcriptionJobIdFromRequest(req: ApiRequest): string | null {
  return queryStringParam(req, 'id') ?? pathParamAfter(req, JOB_PATH_PREFIX)
}

export default withOwnerAuth(async function transcriptionJobHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const parsed = z.string().regex(HOME_AI_JOB_ID_RE).safeParse(transcriptionJobIdFromRequest(req))
    if (!parsed.success) {
      sendJson(res, 400, { error: 'That analysis job id is invalid.' })
      return
    }
    sendJson(res, 200, await getTranscriptionJob(parsed.data))
  } catch (error) {
    handleApiError(res, error)
  }
})
