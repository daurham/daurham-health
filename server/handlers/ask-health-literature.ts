import { parseLiteratureQuery } from '../../src/domain/literature/index.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, readJsonBody, sendJson, type ApiRequest, type ApiResponse } from '../http.js'
import { searchLiterature } from '../literature/service.js'

export async function handleLiteratureSearch(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const body = await readJsonBody(req)
    const parsed = parseLiteratureQuery(body)
    if (!parsed.ok) {
      sendJson(res, 400, { error: parsed.error })
      return
    }
    sendJson(res, 200, await searchLiterature({ query: parsed.query }))
  } catch (error) {
    handleApiError(res, error)
  }
}

const ownerLiterature = withOwnerAuth(handleLiteratureSearch)

export default async function literatureRoute(req: ApiRequest, res: ApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }
  return ownerLiterature(req, res)
}
