import {
  homeAiCreatedJobSchema,
  homeAiFailureMessage,
  homeAiJobSchema,
  isHomeAiJobId,
  type HomeAiCandidate,
  type HomeAiReview,
  sanitizeHomeAiCandidate,
  sanitizeHomeAiReview,
} from '../../../src/domain/training-transcription.js'
import {
  homeAiLabelCreatedJobSchema,
  homeAiLabelJobSchema,
  labelFailureMessage,
  sanitizeLabelCandidate,
  type NutritionLabelCandidate,
} from '../../../src/domain/nutrition/label.js'
import { HttpError } from '../../http.js'
import { getHomeAiConfig, type HomeAiConfig } from './config.js'

const REQUEST_TIMEOUT_MS = 30_000

export type HomeAiFetch = typeof fetch

export type CreatedHomeAiJob = {
  id: string
  status: 'queued'
}

export type HomeAiJobState = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  elapsedMs: number | null
  candidate: HomeAiCandidate | null
  review: HomeAiReview | null
  error: { code: string; message: string } | null
}

export type HomeAiLabelJobState = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'failed'
  elapsedMs: number | null
  imageAvailable: boolean
  candidate: NutritionLabelCandidate | null
  error: { code: string; message: string } | null
}

export type HomeAiClient = {
  createWorkoutTranscriptionJob: (input: {
    bytes: Uint8Array
    filename: string
    mimeType: string
  }) => Promise<CreatedHomeAiJob>
  getWorkoutTranscriptionJob: (jobId: string) => Promise<HomeAiJobState>
  createNutritionLabelJob: (input: {
    bytes: Uint8Array
    filename: string
    mimeType: string
  }) => Promise<CreatedHomeAiJob>
  getNutritionLabelJob: (jobId: string) => Promise<HomeAiLabelJobState>
  getNutritionLabelImage: (jobId: string) => Promise<{ bytes: Uint8Array; mimeType: string } | null>
}

function headersWithKey(apiKey: string, extra?: Record<string, string>): Record<string, string> {
  return {
    'x-api-key': apiKey,
    ...extra,
  }
}

function homeAiUrl(baseUrl: string, path: string): string {
  return `${baseUrl}${path}`
}

function throwMappedFailure(status: number, body: unknown): never {
  const code =
    body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error
      ? String((body.error as { code?: unknown }).code ?? '')
      : ''
  if (status === 404) {
    throw new HttpError(404, homeAiFailureMessage('JOB_NOT_FOUND'))
  }
  if (status === 400 && code === 'INVALID_JOB_ID') {
    throw new HttpError(400, homeAiFailureMessage('INVALID_JOB_ID'))
  }
  if (status === 413) {
    throw new HttpError(413, homeAiFailureMessage('UPLOAD_TOO_LARGE'))
  }
  if (status === 400 && (code === 'MISSING_IMAGE' || code === 'UNSUPPORTED_IMAGE' || code === 'INVALID_IMAGE')) {
    throw new HttpError(400, homeAiFailureMessage(code))
  }
  throw new HttpError(502, homeAiFailureMessage(code || 'PIPELINE_FAILED'))
}

function throwMappedLabelFailure(status: number, body: unknown): never {
  const code =
    body && typeof body === 'object' && 'error' in body && body.error && typeof body.error === 'object' && 'code' in body.error
      ? String((body.error as { code?: unknown }).code ?? '')
      : ''
  if (status === 404) {
    throw new HttpError(404, labelFailureMessage('JOB_NOT_FOUND'))
  }
  if (status === 400 && code === 'INVALID_JOB_ID') {
    throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
  }
  if (status === 413) {
    throw new HttpError(413, labelFailureMessage('UPLOAD_TOO_LARGE'))
  }
  if (status === 400 && (code === 'MISSING_IMAGE' || code === 'UNSUPPORTED_IMAGE' || code === 'INVALID_IMAGE')) {
    throw new HttpError(400, labelFailureMessage(code))
  }
  throw new HttpError(502, labelFailureMessage(code || 'PIPELINE_FAILED'))
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new HttpError(502, 'Home AI returned an invalid response')
  }
}

export function createHomeAiClient(options: {
  config: HomeAiConfig
  fetch?: HomeAiFetch
}): HomeAiClient {
  const fetchImpl = options.fetch ?? fetch
  const { baseUrl, apiKey } = options.config

  return {
    async createWorkoutTranscriptionJob(input) {
      const form = new FormData()
      form.set('image', new Blob([input.bytes], { type: input.mimeType }), input.filename)
      let response: Response
      try {
        response = await fetchImpl(homeAiUrl(baseUrl, '/api/workouts/v1.3/jobs'), {
          method: 'POST',
          headers: headersWithKey(apiKey),
          body: form,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new HttpError(502, 'Could not reach Home AI')
      }
      const body = await readJson(response)
      if (!response.ok) {
        throwMappedFailure(response.status, body)
      }
      const parsed = homeAiCreatedJobSchema.safeParse(body)
      if (!parsed.success) {
        throw new HttpError(502, 'Home AI returned an invalid response')
      }
      return { id: parsed.data.job.id, status: 'queued' }
    },

    async getWorkoutTranscriptionJob(jobId) {
      if (!isHomeAiJobId(jobId)) {
        throw new HttpError(400, homeAiFailureMessage('INVALID_JOB_ID'))
      }
      let response: Response
      try {
        response = await fetchImpl(homeAiUrl(baseUrl, `/api/workouts/v1.3/jobs/${jobId}`), {
          method: 'GET',
          headers: headersWithKey(apiKey),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new HttpError(502, 'Could not reach Home AI')
      }
      const body = await readJson(response)
      if (!response.ok) {
        throwMappedFailure(response.status, body)
      }
      const parsed = homeAiJobSchema.safeParse(body)
      if (!parsed.success) {
        throw new HttpError(502, 'Home AI returned an invalid response')
      }
      const job = parsed.data.job
      let candidate: HomeAiCandidate | null = null
      let review: HomeAiReview | null = null
      if (job.status === 'completed') {
        try {
          candidate = sanitizeHomeAiCandidate(job.candidate)
          review = job.review == null ? null : sanitizeHomeAiReview(job.review)
        } catch {
          throw new HttpError(502, 'Home AI returned an invalid response')
        }
      }
      return {
        id: job.id,
        status: job.status,
        elapsedMs: job.elapsed_ms ?? null,
        candidate,
        review,
        error:
          job.status === 'failed' && job.error
            ? { code: job.error.code, message: homeAiFailureMessage(job.error.code) }
            : null,
      }
    },

    async createNutritionLabelJob(input) {
      const form = new FormData()
      form.set('image', new Blob([input.bytes], { type: input.mimeType }), input.filename)
      let response: Response
      try {
        response = await fetchImpl(homeAiUrl(baseUrl, '/api/nutrition/label/jobs'), {
          method: 'POST',
          headers: headersWithKey(apiKey),
          body: form,
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new HttpError(502, labelFailureMessage('HOME_AI_UNAVAILABLE'))
      }
      const body = await readJson(response)
      if (!response.ok) {
        throwMappedLabelFailure(response.status, body)
      }
      const parsed = homeAiLabelCreatedJobSchema.safeParse(body)
      if (!parsed.success) {
        throw new HttpError(502, 'Home AI returned an invalid response')
      }
      return { id: parsed.data.job.id, status: 'queued' }
    },

    async getNutritionLabelJob(jobId) {
      if (!isHomeAiJobId(jobId)) {
        throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
      }
      let response: Response
      try {
        response = await fetchImpl(homeAiUrl(baseUrl, `/api/nutrition/label/jobs/${jobId}`), {
          method: 'GET',
          headers: headersWithKey(apiKey),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        throw new HttpError(502, labelFailureMessage('HOME_AI_UNAVAILABLE'))
      }
      const body = await readJson(response)
      if (!response.ok) {
        throwMappedLabelFailure(response.status, body)
      }
      const parsed = homeAiLabelJobSchema.safeParse(body)
      if (!parsed.success) {
        throw new HttpError(502, 'Home AI returned an invalid response')
      }
      const job = parsed.data.job
      let candidate: NutritionLabelCandidate | null = null
      if (job.status === 'completed') {
        try {
          candidate = sanitizeLabelCandidate(job.candidate)
        } catch {
          throw new HttpError(502, 'Home AI returned an invalid response')
        }
      }
      return {
        id: job.id,
        status: job.status,
        elapsedMs: job.elapsed_ms ?? null,
        imageAvailable: job.image_available === true,
        candidate,
        error:
          job.status === 'failed' && job.error
            ? { code: job.error.code, message: labelFailureMessage(job.error.code) }
            : null,
      }
    },

    async getNutritionLabelImage(jobId) {
      if (!isHomeAiJobId(jobId)) {
        throw new HttpError(400, labelFailureMessage('INVALID_JOB_ID'))
      }
      let response: Response
      try {
        response = await fetchImpl(homeAiUrl(baseUrl, `/api/nutrition/label/jobs/${jobId}/image`), {
          method: 'GET',
          headers: headersWithKey(apiKey),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        return null
      }
      if (!response.ok) {
        return null
      }
      const mimeType = response.headers.get('content-type') || 'image/jpeg'
      const bytes = new Uint8Array(await response.arrayBuffer())
      return { bytes, mimeType }
    },
  }
}

export async function getHomeAiClient(fetchImpl?: HomeAiFetch): Promise<HomeAiClient> {
  return createHomeAiClient({
    config: await getHomeAiConfig(),
    fetch: fetchImpl,
  })
}
