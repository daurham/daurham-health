import { z } from 'zod'
import { createImportedSession } from '../../../server/training/service.js'
import { HOME_AI_JOB_ID_RE } from '../../../src/domain/training-transcription.js'
import { withOwnerAuth } from '../../../server/auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../../../server/http.js'

const commitEnvelopeSchema = z
  .object({
    jobId: z.string().regex(HOME_AI_JOB_ID_RE),
  })
  .passthrough()

export default withOwnerAuth(async function transcriptionCommitHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const body = await readJsonBody(req)
    const parsed = commitEnvelopeSchema.safeParse(body)
    if (!parsed.success) {
      sendJson(res, 400, { error: 'That analysis job id is invalid.' })
      return
    }
    const { jobId, ...workout } = parsed.data
    sendJson(res, 201, await createImportedSession(workout, jobId))
  } catch (error) {
    handleApiError(res, error)
  }
})
