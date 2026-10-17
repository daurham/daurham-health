import { afterEach, describe, expect, it, vi } from 'vitest'
import { piqPreviewOwnerApiLocked } from '../server/piq-preview-access.js'
import { dispatchHealthApi } from '../server/dispatch.js'
import type { ApiRequest, ApiResponse } from '../server/http.js'

afterEach(() => vi.unstubAllEnvs())

function response() {
  const output: { statusCode: number | null; body: unknown; headers: Record<string, string> } = {
    statusCode: null, body: null, headers: {},
  }
  const res = {
    status: vi.fn((status: number) => { output.statusCode = status; return res }),
    json: vi.fn((body: unknown) => { output.body = body }),
    setHeader: vi.fn((name: string, value: string) => {
      output.headers[name] = value
      return res
    }),
  } as unknown as ApiResponse
  return { res, output }
}

describe('PIQ-4 owner API runtime release stop', () => {
  it('blocks PIQ-branch owner and Auth routes before any handler runs', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'piq/00-baseline-20261014')
    for (const pathname of [
      '/api/profile', '/api/ask-health', '/api/auth/sign-in/email',
      '/api/nutrition/entries', '/api/backup/export', '/api/session',
      '/api/health', '/api?path=body/measurements',
    ]) {
      const { res, output } = response()
      const req = { url: pathname, method: 'GET', headers: {},
        ...(pathname.startsWith('/api?') ? { query: { path: 'body/measurements' } } : {}),
      } as ApiRequest
      await dispatchHealthApi(req, res)
      expect(output.statusCode, pathname).toBe(503)
      expect(output.body).toEqual({
        error: 'PIQ preview owner APIs are disabled pending isolation approval.',
        code: 'PIQ_PREVIEW_OWNER_API_LOCKED',
      })
      expect(output.headers['Cache-Control']).toBe('no-store')
    }
  })

  it('blocks unidentified Vercel previews and refuses PIQ refs even under other targets', () => {
    expect(piqPreviewOwnerApiLocked({ VERCEL_ENV: 'preview' })).toBe(true)
    expect(piqPreviewOwnerApiLocked({ VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: '' })).toBe(true)
    for (const target of ['production', 'preview', 'development', undefined]) {
      expect(piqPreviewOwnerApiLocked({
        VERCEL_ENV: target, VERCEL_GIT_COMMIT_REF: 'piq/another-phase',
      })).toBe(true)
    }
  })

  it('never unlocks a PIQ preview when the reported Vercel ref or target is wrong', () => {
    const markers = [
      'HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID',
      'HEALTH_PIQ_EXPECTED_PREVIEW_BRANCH_ID',
      'HEALTH_PIQ_PREVIEW_TEST_OWNER_USER_ID',
      'HEALTH_PIQ_EXPECTED_PREVIEW_SHA',
    ] as const
    for (const key of markers) {
      for (const target of ['preview', 'production', undefined]) {
        expect(piqPreviewOwnerApiLocked({
          VERCEL_ENV: target,
          VERCEL_GIT_COMMIT_REF: 'fix/unrelated-feature',
          [key]: '',
          HEALTH_PIQ_ALLOW_OWNER_QA: 'true',
        })).toBe(true)
      }
    }
    expect(piqPreviewOwnerApiLocked({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_REF: 'main',
      HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID: 'qa-project',
    })).toBe(true)
  })

  it('blocks known owner API paths with mismatched branch metadata and a QA marker', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'fix/unrelated-feature')
    vi.stubEnv('HEALTH_PIQ_EXPECTED_NEON_PROJECT_ID', 'qa-project')
    vi.stubEnv('HEALTH_PIQ_ALLOW_OWNER_QA', 'true')
    for (const path of ['/api/profile', '/api/auth/sign-in/email', '/api/ask-health']) {
      const { res, output } = response()
      await dispatchHealthApi({ url: path, method: 'GET', headers: {} } as ApiRequest, res)
      expect(output.statusCode).toBe(503)
      expect(output.body).toMatchObject({ code: 'PIQ_PREVIEW_OWNER_API_LOCKED' })
      expect(output.headers['Cache-Control']).toBe('no-store')
    }
  })

  it('leaves production main, known unrelated previews and local development alone', () => {
    for (const env of [
      { VERCEL_ENV: 'production', VERCEL_GIT_COMMIT_REF: 'main' },
      { VERCEL_ENV: 'preview', VERCEL_GIT_COMMIT_REF: 'fix/coach-layout' },
      { VERCEL_ENV: 'development' }, {},
    ]) expect(piqPreviewOwnerApiLocked(env)).toBe(false)
  })

  it('unknown routes remain 404 with no owner handler', async () => {
    vi.stubEnv('VERCEL_ENV', 'preview')
    vi.stubEnv('VERCEL_GIT_COMMIT_REF', 'piq/00-baseline-20261014')
    const { res, output } = response()
    await dispatchHealthApi({ url: '/api/unrecognized-path', method: 'GET', headers: {} } as ApiRequest, res)
    expect(output.statusCode).toBe(404)
  })
})
