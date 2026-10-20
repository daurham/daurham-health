import { z } from 'zod'
import { dismissTranscriptionJob, getTranscriptionJob } from '../training/transcription.js'
import { getTranscriptionJobRecord } from '../training/job-store.js'
import { assertReviewNotFinalized } from '../reviews/finalized-review.js'
import { HOME_AI_JOB_ID_RE } from '../../src/domain/training-transcription.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  pathParamAfter,
  queryStringParam,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const JOB_PATH_PREFIX = '/api/training/transcription/jobs'

export function transcriptionJobIdFromRequest(req: ApiRequest): string | null {
  return queryStringParam(req, 'id') ?? pathParamAfter(req, JOB_PATH_PREFIX)
}

export default withOwnerAuth(async function transcriptionJobHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const parsed = z.string().regex(HOME_AI_JOB_ID_RE).safeParse(transcriptionJobIdFromRequest(req))
    if (!parsed.success) {
      sendJson(res, 400, { error: 'That analysis job id is invalid.' })
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await dismissTranscriptionJob(parsed.data))
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, DELETE')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    // A stale direct link must not revive a committed draft or use Home-AI
    // as the source of truth after a verified canonical save.
    assertReviewNotFinalized((await getTranscriptionJobRecord(parsed.data))?.status, 'workout')
    const result = await getTranscriptionJob(parsed.data)
    // Cover a commit racing an in-flight provider GET.
    assertReviewNotFinalized((await getTranscriptionJobRecord(parsed.data))?.status, 'workout')
    sendJson(res, 200, result)
  } catch (error) {
    handleApiError(res, error)
  }
})
