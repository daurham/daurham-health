import { z } from 'zod'
import { NutritionInterpretError } from '../../src/domain/nutrition/interpret.js'
import { previewFoodDescription, commitFoodDescription } from '../nutrition/describe.js'
import { geminiFoodDescriptionInterpreter, homeAiFoodDescriptionInterpreter } from '../nutrition/description-interpreter.js'
import { interpretErrorToHttp } from '../nutrition/gemini-jobs.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const previewSchema = z.object({
  text: z.string().trim().min(1).max(500),
  provider: z.enum(['gemini', 'home_ai']).optional(),
})

const commitSchema = z.object({
  text: z.string().trim().min(1).max(500),
  logDate: z.string(),
  timezone: z.string().optional(),
  meal: z.enum(['breakfast', 'lunch', 'dinner', 'snack', 'other']).nullable().optional(),
  components: z.array(
    z.object({
      id: z.string().min(1),
      included: z.boolean(),
      proposedName: z.string(),
      foodId: z.uuid().nullable(),
      fdcId: z.number().int().positive().nullable().optional(),
      quantity: z.number().nullable(),
      unit: z.string(),
      grams: z.number().nullable(),
    }),
  ),
})

export default withOwnerAuth(async function nutritionDescribeHandler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }
    const pathname = requestApiPathname(req)
    const body = await readJsonBody(req)
    if (pathname?.endsWith('/commit')) {
      const parsed = commitSchema.safeParse(body)
      if (!parsed.success) {
        sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? 'Invalid food description' })
        return
      }
      sendJson(res, 200, await commitFoodDescription(parsed.data))
      return
    }
    const parsed = previewSchema.safeParse(body)
    if (!parsed.success) {
      sendJson(res, 400, { error: parsed.error.issues[0]?.message ?? 'Invalid food description' })
      return
    }
    const provider = parsed.data.provider === 'home_ai' ? 'home_ai' : 'gemini'
    const interpret =
      provider === 'home_ai' ? await homeAiFoodDescriptionInterpreter() : await geminiFoodDescriptionInterpreter()
    sendJson(res, 200, await previewFoodDescription(parsed.data.text, { interpret }))
  } catch (error) {
    handleApiError(res, error instanceof NutritionInterpretError ? interpretErrorToHttp(error, 'description') : error)
  }
})
