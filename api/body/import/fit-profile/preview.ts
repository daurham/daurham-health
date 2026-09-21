import { previewFitProfileImport } from '../../../../server/body/fit-profile-import.js'
import { readFitProfileForm } from '../../../../server/body/upload.js'
import { withOwnerAuth } from '../../../../server/auth/with-owner.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../../../../server/http.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

export default withOwnerAuth(async function fitProfilePreviewHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const upload = await readFitProfileForm(req)
    const body = await previewFitProfileImport(upload)
    sendJson(res, 200, body)
  } catch (error) {
    handleApiError(res, error)
  }
})
