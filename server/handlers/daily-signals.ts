import {
  addBowelEvent,
  addHydrationEvent,
  clearNoBowelMovement,
  deleteBowelEvent,
  deleteDailyWellness,
  deleteHydrationEvent,
  getDailySignalsDay,
  putDailyWellness,
  setNoBowelMovement,
} from '../daily-signals/service.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import {
  handleApiError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const DAY = '(\\d{4}-\\d{2}-\\d{2})'
const UUID = '([0-9a-fA-F-]{36})'

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

async function handle(req: ApiRequest, res: ApiResponse): Promise<void> {
  const pathname = requestApiPathname(req)
  const checkIn = new RegExp(`^/api/check-in/days/${DAY}$`).exec(pathname)
  if (checkIn?.[1]) {
    const date = checkIn[1]
    if (req.method === 'GET') return sendJson(res, 200, { day: await getDailySignalsDay(date) })
    if (req.method === 'PUT') return sendJson(res, 200, { wellness: await putDailyWellness(date, await readJsonBody(req)) })
    if (req.method === 'DELETE') return sendJson(res, 200, { deleted: await deleteDailyWellness(date) })
    return methodNotAllowed(res, 'GET, PUT, DELETE')
  }

  if (pathname === '/api/hydration/events') {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    return sendJson(res, 201, { event: await addHydrationEvent(await readJsonBody(req)) })
  }
  const hydrationEvent = new RegExp(`^/api/hydration/events/${UUID}$`).exec(pathname)
  if (hydrationEvent?.[1]) {
    if (req.method !== 'DELETE') return methodNotAllowed(res, 'DELETE')
    return sendJson(res, 200, { deleted: await deleteHydrationEvent(hydrationEvent[1]) })
  }

  if (pathname === '/api/bowel/events') {
    if (req.method !== 'POST') return methodNotAllowed(res, 'POST')
    return sendJson(res, 201, { event: await addBowelEvent(await readJsonBody(req)) })
  }
  const bowelEvent = new RegExp(`^/api/bowel/events/${UUID}$`).exec(pathname)
  if (bowelEvent?.[1]) {
    if (req.method !== 'DELETE') return methodNotAllowed(res, 'DELETE')
    return sendJson(res, 200, { deleted: await deleteBowelEvent(bowelEvent[1]) })
  }
  const noMovement = new RegExp(`^/api/bowel/days/${DAY}/no-movement$`).exec(pathname)
  if (noMovement?.[1]) {
    const date = noMovement[1]
    if (req.method === 'PUT') {
      await setNoBowelMovement(date)
      return sendJson(res, 200, { saved: true })
    }
    if (req.method === 'DELETE') return sendJson(res, 200, { deleted: await clearNoBowelMovement(date) })
    return methodNotAllowed(res, 'PUT, DELETE')
  }

  sendJson(res, 404, { error: 'Not found' })
}

export default withOwnerAuth(async function dailySignalsHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handle(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
})
