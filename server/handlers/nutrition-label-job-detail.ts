import { z } from 'zod'
import { normalizeUserContext, parseNutritionProvider } from '../../src/domain/nutrition/interpret.js'
import { dismissNutritionLabelJob, getNutritionLabelImage, getNutritionLabelJob, reanalyzeNutritionLabel } from '../nutrition/label.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  HttpError,
  pathParamAfter,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'
import { HOME_AI_JOB_ID_RE } from '../../src/domain/nutrition/label.js'

const reanalyzeSchema = z.object({
  userContext: z.string().max(2000).nullable().optional(),
  provider: z.enum(['gemini', 'home_ai']).optional(),
})

const JOB_PATH_PREFIX = '/api/nutrition/label/jobs'

export function nutritionLabelJobIdFromRequest(req: ApiRequest): string | null {
  const pathname = requestApiPathname(req)
  if (pathname.endsWith('/image') || pathname.endsWith('/reanalyze')) {
    const suffix = pathname.endsWith('/image') ? '/image' : '/reanalyze'
    const withoutImage = pathname.slice(0, -suffix.length)
    const rest = withoutImage.startsWith(`${JOB_PATH_PREFIX}/`)
      ? withoutImage.slice(`${JOB_PATH_PREFIX}/`.length)
      : null
    return rest && !rest.includes('/') ? rest : null
  }
  return pathParamAfter(req, JOB_PATH_PREFIX)
}

export default withOwnerAuth(async function nutritionLabelJobHandler(req: ApiRequest, res: ApiResponse) {
  try {
    const jobId = nutritionLabelJobIdFromRequest(req)
    const parsed = HOME_AI_JOB_ID_RE.test(jobId ?? '') ? jobId : null
    if (!parsed) {
      throw new HttpError(400, 'That label capture id is invalid.')
    }
    const pathname = requestApiPathname(req)
    if (pathname.endsWith('/reanalyze')) {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const body = reanalyzeSchema.safeParse(await readJsonBody(req))
      if (!body.success) {
        throw new HttpError(400, 'Keep the note under 2000 characters.', undefined, 'CONTEXT_TOO_LONG')
      }
      sendJson(
        res,
        202,
        await reanalyzeNutritionLabel(parsed, {
          userContext: normalizeUserContext(body.data.userContext ?? null),
          provider: parseNutritionProvider(body.data.provider),
        }),
      )
      return
    }
    if (pathname.endsWith('/image')) {
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      const image = await getNutritionLabelImage(parsed)
      if (!image) {
        throw new HttpError(404, 'Label image is no longer available.')
      }
      res.status(200)
      res.setHeader('Content-Type', image.mimeType)
      res.setHeader('Cache-Control', 'private, max-age=60')
      res.end(Buffer.from(image.bytes))
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await dismissNutritionLabelJob(parsed))
      return
    }
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET, DELETE')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    sendJson(res, 200, await getNutritionLabelJob(parsed))
  } catch (error) {
    handleApiError(res, error)
  }
})
