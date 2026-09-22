import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import apiHandler from '../api/index.ts'
import { HEALTH_API_ENTRY } from '../server/dev-api-plugin.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const ROOT = process.cwd()
const SESSION_ID = '11111111-1111-4111-8111-111111111111'
const JOB_ID = '22222222-2222-4222-8222-222222222222'

type VercelRewrite = { source: string; destination: string }

function vercelRewrites(): VercelRewrite[] {
  const parsed = JSON.parse(readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
    rewrites: VercelRewrite[]
  }
  return parsed.rewrites
}

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

/** How nested /api/* arrives after vercel.json rewrites it onto api/index.ts. */
function productionRewrite(publicUrl: string): { url: string; query: { path: string } } {
  const [apiRewrite] = vercelRewrites()
  expect(apiRewrite).toEqual({
    source: '/api/:path*',
    destination: '/api?path=:path*',
  })
  const pathname = publicUrl.split('?')[0] ?? ''
  const rest = pathname.replace(/^\/api\//, '')
  return { url: `/api?path=${rest}`, query: { path: rest } }
}

async function hit(method: string, publicUrl: string) {
  const rewritten = productionRewrite(publicUrl)
  const captured = captureResponse()
  await apiHandler(request(method, rewritten.url, rewritten.query), captured.res)
  return captured
}

function isDeniedPrivate(status: number): boolean {
  return status === 401 || status === 403 || status === 503
}

describe('Vercel nested API routing', () => {
  it('rewrites every /api/:path* onto the single /api function before the SPA fallback', () => {
    const rewrites = vercelRewrites()
    expect(rewrites[0]).toEqual({
      source: '/api/:path*',
      destination: '/api?path=:path*',
    })
    expect(rewrites[1]?.destination).toBe('/index.html')
    expect(HEALTH_API_ENTRY).toBe('api/index.ts')
  })

  it('maps nested public URLs onto the existing Health routes', () => {
    expect(matchHealthApiRoute('/api/auth/sign-in/email')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/get-session')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/sign-out')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/request-password-reset')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/reset-password')).toBe('auth')
    expect(matchHealthApiRoute('/api/auth/reset-password/reset-token')).toBe('auth')
    expect(matchHealthApiRoute('/api/body/import/fit-profile/preview')).toBe('fit-profile-preview')
    expect(matchHealthApiRoute(`/api/training/sessions/${SESSION_ID}`)).toBe('training-session-detail')
    expect(matchHealthApiRoute('/api/training/transcription/jobs')).toBe('transcription-jobs')
    expect(matchHealthApiRoute('/api/progress/overview')).toBe('progress-overview')
    expect(matchHealthApiRoute('/api/progress/timeline')).toBe('progress-timeline')
    expect(matchHealthApiRoute('/api/progress/compare')).toBe('progress-compare')
    expect(matchHealthApiRoute('/api/progress/checkpoints')).toBe('progress-checkpoints')
    expect(matchHealthApiRoute('/api/progress/checkpoints/11111111-1111-4111-8111-111111111111')).toBe(
      'progress-checkpoint-detail',
    )
    expect(matchHealthApiRoute('/api/nutrition/day')).toBe('nutrition-day')
    expect(matchHealthApiRoute('/api/nutrition/entries')).toBe('nutrition-entries')
    expect(matchHealthApiRoute(`/api/nutrition/entries/${SESSION_ID}`)).toBe('nutrition-entry-detail')
    expect(matchHealthApiRoute('/api/nutrition/foods')).toBe('nutrition-foods')
    expect(matchHealthApiRoute('/api/nutrition/import/legacy/preview')).toBe('nutrition-legacy-import')
    expect(matchHealthApiRoute('/api/nutrition/label/jobs')).toBe('nutrition-label-jobs')
    expect(matchHealthApiRoute(`/api/nutrition/label/jobs/${JOB_ID}`)).toBe('nutrition-label-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/label/jobs/${JOB_ID}/image`)).toBe('nutrition-label-job-detail')
    expect(matchHealthApiRoute('/api/nutrition/label/commit')).toBe('nutrition-label-commit')
    expect(matchHealthApiRoute('/api/nutrition/meal/jobs')).toBe('nutrition-meal-jobs')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute(`/api/nutrition/meal/jobs/${JOB_ID}/image`)).toBe('nutrition-meal-job-detail')
    expect(matchHealthApiRoute('/api/nutrition/meal/commit')).toBe('nutrition-meal-commit')
    expect(matchHealthApiRoute('/api/apple-health/import/status')).toBe('apple-health-import')
    expect(matchHealthApiRoute('/api/apple-health/import/preview')).toBe('apple-health-import')
    expect(matchHealthApiRoute('/api/apple-health/import/commit')).toBe('apple-health-import')
    expect(matchHealthApiRoute(`/api/training/transcription/jobs/${JOB_ID}`)).toBe(
      'transcription-job-detail',
    )
  })
})

describe('api/index after Vercel nested rewrite', () => {
  it('serves GET /api/health', async () => {
    const captured = await hit('GET', '/api/health')
    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ status: 'ok' })
  })

  it('protects GET /api/session', async () => {
    const captured = await hit('GET', '/api/session')
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('reaches the Neon Auth proxy for nested Better Auth paths', async () => {
    const signIn = await hit('POST', '/api/auth/sign-in/email')
    expect(signIn.status()).not.toBe(404)

    const session = await hit('GET', '/api/auth/get-session')
    expect(session.status()).not.toBe(404)

    const signOut = await hit('POST', '/api/auth/sign-out')
    expect(signOut.status()).not.toBe(404)

    const verify = await hit('POST', '/api/auth/send-verification-email')
    expect(verify.status()).not.toBe(404)

    const requestReset = await hit('POST', '/api/auth/request-password-reset')
    expect(requestReset.status()).not.toBe(404)

    const reset = await hit('POST', '/api/auth/reset-password')
    expect(reset.status()).not.toBe(404)

    const callback = await hit('GET', '/api/auth/reset-password/reset-token')
    expect(callback.status()).not.toBe(404)
  })

  it('protects nested Body import routes', async () => {
    const captured = await hit('POST', '/api/body/import/fit-profile/preview')
    expect(captured.status()).not.toBe(404)
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('protects Training list and dynamic session detail', async () => {
    const list = await hit('GET', '/api/training/sessions')
    expect(isDeniedPrivate(list.status())).toBe(true)

    const detail = await hit('GET', `/api/training/sessions/${SESSION_ID}`)
    expect(detail.status()).not.toBe(404)
    expect(isDeniedPrivate(detail.status())).toBe(true)
  })

  it('protects transcription job POST, list GET, dynamic GET, and commit', async () => {
    const create = await hit('POST', '/api/training/transcription/jobs')
    expect(isDeniedPrivate(create.status())).toBe(true)
    expect(JSON.stringify(create.body() ?? {})).not.toContain('HOME_AI')

    const list = await hit('GET', '/api/training/transcription/jobs')
    expect(list.status()).not.toBe(404)
    expect(list.status()).not.toBe(405)
    expect(isDeniedPrivate(list.status())).toBe(true)

    const poll = await hit('GET', `/api/training/transcription/jobs/${JOB_ID}`)
    expect(poll.status()).not.toBe(404)
    expect(isDeniedPrivate(poll.status())).toBe(true)

    const commit = await hit('POST', '/api/training/transcription/commit')
    expect(isDeniedPrivate(commit.status())).toBe(true)
  })

  it('protects GET /api/progress/overview', async () => {
    const captured = await hit('GET', '/api/progress/overview?range=30d')
    expect(captured.status()).not.toBe(404)
    expect(captured.status()).not.toBe(405)
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('protects GET /api/progress/timeline', async () => {
    const captured = await hit('GET', '/api/progress/timeline?range=30d')
    expect(captured.status()).not.toBe(404)
    expect(captured.status()).not.toBe(405)
    expect(isDeniedPrivate(captured.status())).toBe(true)
  })

  it('protects Compare and checkpoint routes', async () => {
    const compare = await hit('GET', '/api/progress/compare?startA=2026-06-01&endA=2026-06-30&startB=2026-09-01&endB=2026-09-30')
    expect(compare.status()).not.toBe(404)
    expect(isDeniedPrivate(compare.status())).toBe(true)

    const list = await hit('GET', '/api/progress/checkpoints')
    expect(isDeniedPrivate(list.status())).toBe(true)

    const create = await hit('POST', '/api/progress/checkpoints')
    expect(create.status()).not.toBe(404)
    expect(isDeniedPrivate(create.status())).toBe(true)

    const detail = await hit('DELETE', `/api/progress/checkpoints/${SESSION_ID}`)
    expect(detail.status()).not.toBe(404)
    expect(isDeniedPrivate(detail.status())).toBe(true)
  })

  it('protects Nutrition day, entries, foods, and legacy import routes', async () => {
    const day = await hit('GET', '/api/nutrition/day?date=2026-09-20')
    expect(day.status()).not.toBe(404)
    expect(isDeniedPrivate(day.status())).toBe(true)

    const create = await hit('POST', '/api/nutrition/entries')
    expect(create.status()).not.toBe(404)
    expect(isDeniedPrivate(create.status())).toBe(true)

    const foods = await hit('GET', '/api/nutrition/foods?query=chicken')
    expect(isDeniedPrivate(foods.status())).toBe(true)

    const targets = await hit('GET', '/api/nutrition/targets?date=2026-09-21')
    expect(targets.status()).not.toBe(404)
    expect(isDeniedPrivate(targets.status())).toBe(true)

    const saveTarget = await hit('POST', '/api/nutrition/targets')
    expect(saveTarget.status()).not.toBe(404)
    expect(isDeniedPrivate(saveTarget.status())).toBe(true)

    const barcode = await hit('GET', '/api/nutrition/barcode/034000470693')
    expect(barcode.status()).not.toBe(404)
    expect(isDeniedPrivate(barcode.status())).toBe(true)

    const saveBarcode = await hit('POST', '/api/nutrition/barcode/save')
    expect(saveBarcode.status()).not.toBe(404)
    expect(isDeniedPrivate(saveBarcode.status())).toBe(true)

    const labelJobs = await hit('POST', '/api/nutrition/label/jobs')
    expect(labelJobs.status()).not.toBe(404)
    expect(isDeniedPrivate(labelJobs.status())).toBe(true)
    expect(JSON.stringify(labelJobs.body() ?? {})).not.toContain('HOME_AI')

    const labelList = await hit('GET', '/api/nutrition/label/jobs')
    expect(labelList.status()).not.toBe(404)
    expect(isDeniedPrivate(labelList.status())).toBe(true)

    const labelDetail = await hit('GET', `/api/nutrition/label/jobs/${JOB_ID}`)
    expect(labelDetail.status()).not.toBe(404)
    expect(isDeniedPrivate(labelDetail.status())).toBe(true)

    const labelCommit = await hit('POST', '/api/nutrition/label/commit')
    expect(labelCommit.status()).not.toBe(404)
    expect(isDeniedPrivate(labelCommit.status())).toBe(true)

    const mealJobs = await hit('POST', '/api/nutrition/meal/jobs')
    expect(mealJobs.status()).not.toBe(404)
    expect(isDeniedPrivate(mealJobs.status())).toBe(true)
    expect(JSON.stringify(mealJobs.body() ?? {})).not.toContain('HOME_AI')

    const mealList = await hit('GET', '/api/nutrition/meal/jobs')
    expect(mealList.status()).not.toBe(404)
    expect(isDeniedPrivate(mealList.status())).toBe(true)

    const mealDetail = await hit('GET', `/api/nutrition/meal/jobs/${JOB_ID}`)
    expect(mealDetail.status()).not.toBe(404)
    expect(isDeniedPrivate(mealDetail.status())).toBe(true)

    const mealCommit = await hit('POST', '/api/nutrition/meal/commit')
    expect(mealCommit.status()).not.toBe(404)
    expect(isDeniedPrivate(mealCommit.status())).toBe(true)

    const preview = await hit('POST', '/api/nutrition/import/legacy/preview')
    expect(preview.status()).not.toBe(404)
    expect(isDeniedPrivate(preview.status())).toBe(true)
  })

  it('protects Apple Health import status, preview, and commit', async () => {
    const status = await hit('GET', '/api/apple-health/import/status')
    expect(status.status()).not.toBe(404)
    expect(isDeniedPrivate(status.status())).toBe(true)

    const preview = await hit('POST', '/api/apple-health/import/preview')
    expect(preview.status()).not.toBe(404)
    expect(isDeniedPrivate(preview.status())).toBe(true)

    const commit = await hit('POST', '/api/apple-health/import/commit')
    expect(commit.status()).not.toBe(404)
    expect(isDeniedPrivate(commit.status())).toBe(true)
  })

  it('returns 404 for unknown API routes and 405 for unsupported methods', async () => {
    const missing = await hit('GET', '/api/does-not-exist')
    expect(missing.status()).toBe(404)
    expect(missing.body()).toEqual({ error: 'Not found' })

    const method = await hit('POST', '/api/health')
    expect(method.status()).toBe(405)
    expect(method.body()).toEqual({ error: 'Method not allowed' })
  })
})
