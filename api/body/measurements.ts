import { listBodyMeasurements } from '../../server/body/fit-profile-import.js'
import { handleApiError, sendJson, type ApiRequest, type ApiResponse } from '../../server/http.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const body = await listBodyMeasurements()
    sendJson(res, 200, body)
  } catch (error) {
    handleApiError(res, error)
  }
}
