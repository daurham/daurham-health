import {
  archiveOwnerRoutine,
  createOwnerRoutine,
  listTemplates,
  reviseOwnerRoutine,
} from '../training/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function templatesHandler(req: ApiRequest, res: ApiResponse) {
  const pathname = requestApiPathname(req)
  if (pathname === '/api/training/templates') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listTemplates())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, { template: await createOwnerRoutine(await readJsonBody(req)) })
      return
    }
    res.setHeader('Allow', 'GET, POST')
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  const match = /^\/api\/training\/templates\/([^/]+)$/.exec(pathname)
  if (!match || !UUID.test(match[1] ?? '')) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  const id = match[1]!
  if (req.method === 'PATCH') {
    sendJson(res, 200, { template: await reviseOwnerRoutine(id, await readJsonBody(req)) })
    return
  }
  if (req.method === 'DELETE') {
    sendJson(res, 200, await archiveOwnerRoutine(id))
    return
  }
  res.setHeader('Allow', 'PATCH, DELETE')
  sendJson(res, 405, { error: 'Method not allowed' })
}

export default withOwnerAuth(templatesHandler)
