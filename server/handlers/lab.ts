import {
  abandonExperiment,
  acceptExperiment,
  addBenchmarkProtocolVersion,
  addExperimentProtocolVersion,
  archiveBenchmark,
  createBenchmark,
  createOwnerExperiment,
  deleteUntouchedExperiment,
  getBenchmark,
  getExperiment,
  listBenchmarks,
  listExperiments,
  patchBenchmark,
  patchExperiment,
  scheduleExperiment,
  startExperiment,
  supersedeExperiment,
} from '../lab/service.js'
import {
  commitBenchmarkResult,
  getBenchmarkResult,
  getLabProtocolVersion,
  invalidateBenchmarkResult,
  listBenchmarkResults,
  previewBenchmarkResult,
} from '../lab/results.js'
import {
  commitExperimentResult,
  getExperimentResult,
  invalidateExperimentResult,
  previewExperimentResult,
} from '../lab/experiment-results.js'
import { getBenchmarkRetest, listBenchmarkRetests } from '../lab/retests.js'
import {
  acceptExperimentSuggestion,
  draftExperimentSuggestion,
  listExperimentSuggestions,
  readExperimentSuggestion,
} from '../lab/suggestions.js'
import { parseRetestAsOf } from '../../src/domain/lab-retests.js'
import { withOwnerAuth } from '../auth/with-owner.js'
import { currentHealthDate } from '../health-time.js'
import {
  handleApiError,
  HttpError,
  readJsonBody,
  requestApiPathname,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from '../http.js'

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}'
const EXPERIMENT = new RegExp(
  `^/api/lab/experiments(?:/(${UUID})(?:/(schedule|start|abandon|supersede|accept|protocol-version|result)(?:/(preview))?)?)?$`,
  'i',
)
const EXPERIMENT_RESULT = new RegExp(`^/api/lab/experiment-results/(${UUID})(?:/(invalidate))?$`, 'i')
const BENCHMARK = new RegExp(`^/api/lab/benchmarks(?:/(${UUID})(?:/(protocol-version|archive|results|retest)(?:/(preview))?)?)?$`, 'i')
const RETESTS = /^\/api\/lab\/retests$/i
const RESULT = new RegExp(`^/api/lab/benchmark-results/(${UUID})(?:/(invalidate))?$`, 'i')
const PROTOCOL_VERSION = new RegExp(`^/api/lab/protocol-versions/(${UUID})$`, 'i')
const SUGGESTIONS = /^\/api\/lab\/experiment-suggestions(?:\/([^/]+)(?:\/(draft|accept))?)?$/i

export function matchLabRoute(pathname: string):
  | { kind: 'experiments' }
  | { kind: 'experiment'; id: string; action: string | null; preview?: boolean }
  | { kind: 'experiment-result'; id: string; action: string | null }
  | { kind: 'benchmarks' }
  | { kind: 'retests' }
  | { kind: 'benchmark'; id: string; action: string | null; preview: boolean }
  | { kind: 'result'; id: string; action: string | null }
  | { kind: 'protocol-version'; id: string }
  | { kind: 'suggestions'; candidateId: string | null; action: 'draft' | 'accept' | null }
  | null {
  const experiment = EXPERIMENT.exec(pathname)
  if (experiment) {
    if (!experiment[1]) {
      return { kind: 'experiments' }
    }
    return {
      kind: 'experiment',
      id: experiment[1],
      action: experiment[2] ?? null,
      ...(experiment[3] ? { preview: true } : {}),
    }
  }
  const experimentResult = EXPERIMENT_RESULT.exec(pathname)
  if (experimentResult?.[1]) {
    return { kind: 'experiment-result', id: experimentResult[1], action: experimentResult[2] ?? null }
  }
  if (RETESTS.test(pathname)) {
    return { kind: 'retests' }
  }
  const benchmark = BENCHMARK.exec(pathname)
  if (benchmark) {
    if (!benchmark[1]) {
      return { kind: 'benchmarks' }
    }
    return {
      kind: 'benchmark',
      id: benchmark[1],
      action: benchmark[2] ?? null,
      preview: benchmark[2] === 'results' && benchmark[3] === 'preview',
    }
  }
  const result = RESULT.exec(pathname)
  if (result?.[1]) {
    return { kind: 'result', id: result[1], action: result[2] ?? null }
  }
  const suggestions = SUGGESTIONS.exec(pathname)
  if (suggestions) {
    const action = suggestions[2]
    return {
      kind: 'suggestions',
      candidateId: suggestions[1] ? decodeURIComponent(suggestions[1]) : null,
      action: action === 'draft' || action === 'accept' ? action : null,
    }
  }
  const protocolVersion = PROTOCOL_VERSION.exec(pathname)
  if (protocolVersion?.[1]) {
    return { kind: 'protocol-version', id: protocolVersion[1] }
  }
  return null
}

function methodNotAllowed(res: ApiResponse, allow: string): void {
  res.setHeader('Allow', allow)
  sendJson(res, 405, { error: 'Method not allowed' })
}

export async function handleLab(req: ApiRequest, res: ApiResponse) {
  const route = matchLabRoute(requestApiPathname(req))
  if (!route) {
    sendJson(res, 404, { error: 'Not found' })
    return
  }
  if (route.kind === 'suggestions') {
    if (!route.candidateId && route.action) {
      sendJson(res, 404, { error: 'Not found' })
      return
    }
    if (!route.candidateId) {
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      sendJson(res, 200, await listExperimentSuggestions())
      return
    }
    if (!route.action) {
      if (req.method !== 'GET') {
        methodNotAllowed(res, 'GET')
        return
      }
      sendJson(res, 200, await readExperimentSuggestion(route.candidateId))
      return
    }
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    if (route.action === 'draft') {
      sendJson(res, 200, await draftExperimentSuggestion(route.candidateId))
      return
    }
    sendJson(res, 201, await acceptExperimentSuggestion(route.candidateId, await readJsonBody(req)))
    return
  }
  if (route.kind === 'experiments') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listExperiments())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createOwnerExperiment(await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'GET, POST')
    return
  }
  if (route.kind === 'experiment') {
    if (!route.action && req.method === 'GET') {
      sendJson(res, 200, await getExperiment(route.id))
      return
    }
    if (!route.action && req.method === 'PATCH') {
      sendJson(res, 200, await patchExperiment(route.id, await readJsonBody(req)))
      return
    }
    if (!route.action && req.method === 'DELETE') {
      sendJson(res, 200, await deleteUntouchedExperiment(route.id))
      return
    }
    if (!route.action) {
      methodNotAllowed(res, 'GET, PATCH, DELETE')
      return
    }
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    if (route.action === 'schedule') {
      sendJson(res, 200, await scheduleExperiment(route.id, await readJsonBody(req)))
      return
    }
    if (route.action === 'start') {
      sendJson(res, 200, await startExperiment(route.id))
      return
    }
    if (route.action === 'abandon') {
      sendJson(res, 200, await abandonExperiment(route.id))
      return
    }
    if (route.action === 'supersede') {
      sendJson(res, 200, await supersedeExperiment(route.id))
      return
    }
    if (route.action === 'accept') {
      sendJson(res, 200, await acceptExperiment(route.id))
      return
    }
    if (route.action === 'result' && route.preview) {
      sendJson(res, 200, await previewExperimentResult(route.id, await readJsonBody(req)))
      return
    }
    if (route.action === 'result') {
      sendJson(res, 201, await commitExperimentResult(route.id, await readJsonBody(req)))
      return
    }
    sendJson(res, 200, await addExperimentProtocolVersion(route.id, await readJsonBody(req)))
    return
  }
  if (route.kind === 'experiment-result') {
    if (!route.action && req.method === 'GET') {
      sendJson(res, 200, await getExperimentResult(route.id))
      return
    }
    if (route.action === 'invalidate' && req.method === 'POST') {
      sendJson(res, 200, await invalidateExperimentResult(route.id, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, route.action ? 'POST' : 'GET')
    return
  }
  if (route.kind === 'retests') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, await listBenchmarkRetests(await retestAsOf(req)))
    return
  }
  if (route.kind === 'benchmarks') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listBenchmarks())
      return
    }
    if (req.method === 'POST') {
      sendJson(res, 201, await createBenchmark(await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, 'GET, POST')
    return
  }
  if (route.kind === 'protocol-version') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, await getLabProtocolVersion(route.id))
    return
  }
  if (route.kind === 'result') {
    if (!route.action && req.method === 'GET') {
      sendJson(res, 200, await getBenchmarkResult(route.id))
      return
    }
    if (route.action === 'invalidate' && req.method === 'POST') {
      sendJson(res, 200, await invalidateBenchmarkResult(route.id, await readJsonBody(req)))
      return
    }
    methodNotAllowed(res, route.action ? 'POST' : 'GET')
    return
  }
  if (!route.action && req.method === 'GET') {
    sendJson(res, 200, await getBenchmark(route.id))
    return
  }
  if (!route.action && req.method === 'PATCH') {
    sendJson(res, 200, await patchBenchmark(route.id, await readJsonBody(req)))
    return
  }
  if (!route.action) {
    methodNotAllowed(res, 'GET, PATCH')
    return
  }
  if (route.action === 'retest') {
    if (req.method !== 'GET') {
      methodNotAllowed(res, 'GET')
      return
    }
    sendJson(res, 200, await getBenchmarkRetest(route.id, await retestAsOf(req)))
    return
  }
  if (route.action === 'results' && route.preview) {
    if (req.method !== 'POST') {
      methodNotAllowed(res, 'POST')
      return
    }
    sendJson(res, 200, await previewBenchmarkResult(route.id, await readJsonBody(req)))
    return
  }
  if (route.action === 'results') {
    if (req.method === 'GET') {
      sendJson(res, 200, await listBenchmarkResults(route.id))
      return
    }
    if (req.method === 'POST') {
      const committed = await commitBenchmarkResult(route.id, await readJsonBody(req))
      if (committed.status === 'created') {
        sendJson(res, 201, committed.result)
        return
      }
      if (committed.status === 'duplicate') {
        sendJson(res, 409, {
          error: 'An existing benchmark result already used this evidence.',
          existingResultId: committed.existingResultId,
          result: committed.result,
        })
        return
      }
      sendJson(res, 409, { error: committed.error, preview: committed.preview })
      return
    }
    methodNotAllowed(res, 'GET, POST')
    return
  }
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST')
    return
  }
  if (route.action === 'archive') {
    sendJson(res, 200, await archiveBenchmark(route.id))
    return
  }
  sendJson(res, 200, await addBenchmarkProtocolVersion(route.id, await readJsonBody(req)))
}

async function retestAsOf(req: ApiRequest): Promise<string> {
  const url = new URL(req.url ?? '/', 'http://health.local')
  const parsed = parseRetestAsOf(url.searchParams.get('asOf'), await currentHealthDate())
  if ('error' in parsed) {
    throw new HttpError(400, parsed.error)
  }
  return parsed.asOf
}

async function labHandler(req: ApiRequest, res: ApiResponse) {
  try {
    await handleLab(req, res)
  } catch (error) {
    handleApiError(res, error)
  }
}

const ownerLab = withOwnerAuth(labHandler)

export default async function labRoute(req: ApiRequest, res: ApiResponse) {
  const route = matchLabRoute(requestApiPathname(req))
  if (route?.kind === 'suggestions') {
    const allowed = route.action ? 'POST' : 'GET'
    if (req.method !== allowed) {
      methodNotAllowed(res, allowed)
      return
    }
  }
  return ownerLab(req, res)
}
