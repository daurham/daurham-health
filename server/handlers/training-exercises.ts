import { listExercises } from '../training/service.js'
import {
  archiveOwnerExercise,
  createOwnerExercise,
  getExerciseDefinition,
  listExerciseLibrary,
  restoreExercise,
  updateOwnerExercise,
} from '../training/owner-exercises.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { handleApiError, queryStringParam, readJsonBody, requestApiPathname, sendJson, type ApiRequest, type ApiResponse } from '../http.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function matchTrainingExerciseRoute(
  pathname: string,
): { kind: 'collection' } | { kind: 'detail'; id: string } | { kind: 'restore'; id: string } | null {
  if (pathname === '/api/training/exercises') return { kind: 'collection' }
  const restore = /^\/api\/training\/exercises\/([^/]+)\/restore$/.exec(pathname)
  if (restore && UUID.test(restore[1] ?? '')) return { kind: 'restore', id: restore[1]! }
  const detail = /^\/api\/training\/exercises\/([^/]+)$/.exec(pathname)
  if (detail && UUID.test(detail[1] ?? '')) return { kind: 'detail', id: detail[1]! }
  return null
}

export async function handleTrainingExercises(req: ApiRequest, res: ApiResponse) {
  const route = matchTrainingExerciseRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }

  try {
    if (route.kind === 'collection') {
      if (req.method === 'GET') {
        sendJson(
          res,
          200,
          queryStringParam(req, 'management') === 'true'
            ? await listExerciseLibrary()
            : await listExercises(),
        )
        return
      }
      if (req.method === 'POST') {
        sendJson(res, 201, await createOwnerExercise(await readJsonBody(req)))
        return
      }
      res.setHeader('Allow', 'GET, POST')
      sendJson(res, 405, { error: 'Method not allowed' })
      return
    }

    if (route.kind === 'restore') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST')
        sendJson(res, 405, { error: 'Method not allowed' })
        return
      }
      sendJson(res, 200, await restoreExercise(route.id))
      return
    }

    if (req.method === 'GET') {
      sendJson(res, 200, { exercise: await getExerciseDefinition(route.id) })
      return
    }
    if (req.method === 'PATCH') {
      sendJson(res, 200, await updateOwnerExercise(route.id, await readJsonBody(req)))
      return
    }
    if (req.method === 'DELETE') {
      sendJson(res, 200, await archiveOwnerExercise(route.id))
      return
    }
    res.setHeader('Allow', 'GET, PATCH, DELETE')
    sendJson(res, 405, { error: 'Method not allowed' })
  } catch (error) {
    handleApiError(res, error)
  }
}

export default withOwnerAuth(handleTrainingExercises)
