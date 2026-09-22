import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  HttpError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'
import {
  appleHealthCommitRequestSchema,
  appleHealthPreviewRequestSchema,
  withFingerprint,
} from '../../src/domain/apple-health/types.js'
import {
  appleHealthImportStatus,
  ingestNormalizedAppleHealthRecords,
  lookupAppleHealthFingerprints,
} from '../apple-health/service.js'

export default withOwnerAuth(async function appleHealthImportHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const pathname = requestApiPathname(req)
    if (pathname === '/api/apple-health/import/status') {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      sendJson(res, 200, await appleHealthImportStatus())
      return
    }
    if (pathname === '/api/apple-health/import/preview') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const parsed = appleHealthPreviewRequestSchema.safeParse(await readJsonBody(req))
      if (!parsed.success) {
        throw new HttpError(400, 'Invalid Apple Health preview request')
      }
      sendJson(res, 200, await lookupAppleHealthFingerprints(parsed.data.fingerprints ?? []))
      return
    }
    if (pathname === '/api/apple-health/import/commit') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const parsed = appleHealthCommitRequestSchema.safeParse(await readJsonBody(req))
      if (!parsed.success) {
        throw new HttpError(400, 'Invalid Apple Health commit request')
      }
      const records = parsed.data.records.map(withFingerprint)
      sendJson(
        res,
        200,
        await ingestNormalizedAppleHealthRecords({
          records,
          jobId: parsed.data.jobId,
          complete: parsed.data.complete,
          summary: parsed.data.summary,
        }),
      )
      return
    }
    sendJson(res, 404, { error: 'Not found' })
  } catch (error) {
    handleApiError(res, error)
  }
})
