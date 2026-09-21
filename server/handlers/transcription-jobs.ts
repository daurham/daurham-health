import { createTranscriptionJob } from '../training/transcription.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

export default withOwnerAuth(async function transcriptionJobsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 202, await createTranscriptionJob(req))
  } catch (error) {
    handleApiError(res, error)
  }
})
