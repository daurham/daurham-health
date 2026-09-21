import { createTranscriptionJob } from '../../../server/training/transcription.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../../../server/http.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
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
}
