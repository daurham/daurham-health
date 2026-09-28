import { BodyInputError } from '../../src/domain/body-manual.js'
import { bodyCaptureAuthorized, bodyCaptureToken } from '../body/body-capture-auth.js'
import { stageBodyCapture } from '../body/body-capture-service.js'
import { handleApiError, HttpError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

function authorizationHeader(req: ApiRequest): string | string[] | undefined {
  return req.headers.authorization ?? req.headers.Authorization
}

export default async function bodyCaptureIngestHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const configured = await bodyCaptureToken()
    if (!configured) {
      throw new HttpError(503, 'Body capture is not configured')
    }
    const authorized = await bodyCaptureAuthorized(authorizationHeader(req))
    if (!authorized) {
      throw new HttpError(401, 'Unauthorized')
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const payload = await readJsonBody(req)
    const staged = await stageBodyCapture(payload)
    sendJson(res, 200, staged)
  } catch (error) {
    if (error instanceof BodyInputError) {
      handleApiError(res, new HttpError(400, error.message))
      return
    }
    handleApiError(res, error)
  }
}
