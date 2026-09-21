import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it } from 'vitest'
import { dispatchHealthApi, matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

function request(method: string, url: string, query?: ApiRequest['query']): ApiRequest {
  return {
    method,
    url,
    query,
    headers: {},
    async *[Symbol.asyncIterator]() {},
  } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; body: () => unknown } {
  const socket = new Socket()
  const nodeRes = new ServerResponse(new IncomingMessage(socket))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown
  res.status = (code: number) => {
    statusCode = code
    nodeRes.statusCode = code
    return res
  }
  res.json = (body: unknown) => {
    payload = body
  }
  return {
    res,
    status: () => statusCode,
    body: () => payload,
  }
}

async function dispatch(method: string, url: string, query?: ApiRequest['query']) {
  const captured = captureResponse()
  await dispatchHealthApi(request(method, url, query), captured.res)
  return captured
}

function isDeniedPrivate(status: number): boolean {
  return status === 401 || status === 403 || status === 503
}

describe('Health API route matching', () => {
  it('maps the public and private contract onto named routes', () => {
    expect(matchHealthApiRoute('/api/health')).toBe('health')
    expect(matchHealthApiRoute('/api/session')).toBe('session')
    expect(matchHealthApiRoute('/api/auth/sign-in/email')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/get-session')).toBe('auth')
    expect(matchHealthApiRoute('/api/body/measurements')).toBe('body-measurements')
    expect(matchHealthApiRoute('/api/training/sessions')).toBe('training-sessions')
    expect(matchHealthApiRoute(`/api/training/sessions/${SESSION_ID}`)).toBe('training-session-detail')
    expect(matchHealthApiRoute('/api/training/transcription/jobs')).toBe('transcription-jobs')
    expect(matchHealthApiRoute(`/api/training/transcription/jobs/${JOB_ID}`)).toBe(
      'transcription-job-detail',
    )
    expect(matchHealthApiRoute('/api/training/transcription/commit')).toBe('transcription-commit')
    expect(matchHealthApiRoute('/api/missing')).toBeNull()
    expect(matchHealthApiRoute('/api/training/sessions/extra/segment')).toBeNull()
  })
})

describe('Health API dispatcher', () => {
  it('serves GET /api/health without auth', async () => {
    const captured = await dispatch('GET', '/api/health')
    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ status: 'ok' })
  })

  it('protects GET /api/session', async () => {
    const captured = await dispatch('GET', '/api/session')
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('routes Neon Auth proxy subpaths', async () => {
    const signIn = await dispatch('POST', '/api/auth/sign-in/email')
    expect(matchHealthApiRoute('/api/auth/sign-in/email')).toBe('auth')
    expect(signIn.status()).not.toBe(404)

    const session = await dispatch('GET', '/api/auth/get-session')
    expect(session.status()).not.toBe(404)
  })

  it('protects Body measurements', async () => {
    const captured = await dispatch('GET', '/api/body/measurements')
    expect(isDeniedPrivate(captured.status())).toBe(true)
    expect(JSON.stringify(captured.body() ?? {})).not.toMatch(/measurement|weight|kg/i)
  })

  it('protects GET /api/training/sessions', async () => {
    const captured = await dispatch('GET', '/api/training/sessions')
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('protects dynamic Training session detail', async () => {
    const captured = await dispatch('GET', `/api/training/sessions/${SESSION_ID}`)
    expect(captured.status()).not.toBe(404)
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('protects transcription job POST and GET and commit', async () => {
    const create = await dispatch('POST', '/api/training/transcription/jobs')
    expect(isDeniedPrivate(create.status())).toBe(true)
    expect(JSON.stringify(create.body() ?? {})).not.toContain('HOME_AI')

    const poll = await dispatch('GET', `/api/training/transcription/jobs/${JOB_ID}`)
    expect(poll.status()).not.toBe(404)
    expect(isDeniedPrivate(poll.status())).toBe(true)

    const commit = await dispatch('POST', '/api/training/transcription/commit')
    expect(isDeniedPrivate(commit.status())).toBe(true)
  })

  it('returns 404 for unknown API routes', async () => {
    const captured = await dispatch('GET', '/api/does-not-exist')
    expect(captured.status()).toBe(404)
    expect(captured.body()).toEqual({ error: 'Not found' })
  })

  it('keeps existing 405 responses for unsupported methods on known routes', async () => {
    const captured = await dispatch('POST', '/api/health')
    expect(captured.status()).toBe(405)
    expect(captured.body()).toEqual({ error: 'Method not allowed' })
  })

  it('resolves Vercel catch-all query.path when the url is rewritten', async () => {
    const captured = await dispatch('GET', '/internal', { path: ['health'] })
    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ status: 'ok' })
  })
})
