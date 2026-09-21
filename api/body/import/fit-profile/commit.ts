import { commitFitProfileImport } from '../../../../server/body/fit-profile-import.ts'
import { readFitProfileForm } from '../../../../server/body/upload.ts'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../../../../server/http.ts'

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
    const upload = await readFitProfileForm(req)
    const body = await commitFitProfileImport(upload)
    sendJson(res, 200, body)
  } catch (error) {
    handleApiError(res, error)
  }
}
