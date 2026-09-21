import { describe, expect, it } from 'vitest'
import {
  ACCOUNT_NOT_AUTHORIZED,
  SIGN_IN_REQUIRED,
  identityFromSessionBody,
  isConfiguredOwner,
  requireHealthOwner,
} from '../server/auth/owner.ts'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import { authProxyPath } from '../server/auth/node-request.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'
import healthHandler from '../server/handlers/health.ts'
import transcriptionJobsHandler from '../server/handlers/transcription-jobs.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'

const OWNER_ID = 'dc42fa70-09a7-4038-a3bb-f61dda854910'
const OTHER_ID = '860dc360-609f-4b7d-9e70-ec93fe6414d3'

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example.invalid/neondb/auth',
  cookieSecret: 'x'.repeat(32),
  ownerUserId: OWNER_ID,
  ownerEmail: 'owner@example.com',
  sameSite: 'lax',
  sessionDataTtl: 300,
}

function request(headers: Record<string, string> = {}, method = 'GET'): ApiRequest {
  return {
    method,
    url: '/api/training/exercises',
    headers,
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

describe('owner identity mapping', () => {
  it('reads the Neon Auth user id and does not guess from display names', () => {
    expect(
      identityFromSessionBody({
        user: { id: OWNER_ID, email: 'Owner@Example.com' },
        session: { id: 'sess' },
      }),
    ).toEqual({ id: OWNER_ID, email: 'owner@example.com' })
    expect(identityFromSessionBody({ user: null, session: null })).toBeNull()
  })

  it('prefers the configured user id over email', () => {
    expect(isConfiguredOwner({ id: OWNER_ID, email: 'other@example.com' }, ownerConfig)).toBe(true)
    expect(isConfiguredOwner({ id: OTHER_ID, email: 'owner@example.com' }, ownerConfig)).toBe(false)
    expect(
      isConfiguredOwner(
        { id: OTHER_ID, email: 'owner@example.com' },
        { ...ownerConfig, ownerUserId: null },
      ),
    ).toBe(true)
  })
})

describe('requireHealthOwner', () => {
  it('rejects anonymous requests', async () => {
    await expect(
      requireHealthOwner(request(), { config: ownerConfig, readSession: async () => null }),
    ).rejects.toMatchObject({ statusCode: 401, message: SIGN_IN_REQUIRED })
  })

  it('rejects authenticated non-owners', async () => {
    await expect(
      requireHealthOwner(request(), {
        config: ownerConfig,
        readSession: async () => ({ id: OTHER_ID, email: 'intruder@example.com' }),
      }),
    ).rejects.toMatchObject({ statusCode: 403, message: ACCOUNT_NOT_AUTHORIZED })
  })

  it('allows the configured owner', async () => {
    await expect(
      requireHealthOwner(request(), {
        config: ownerConfig,
        readSession: async () => ({ id: OWNER_ID, email: 'owner@example.com' }),
      }),
    ).resolves.toEqual({ id: OWNER_ID, email: 'owner@example.com' })
  })
})

describe('withOwnerAuth boundary', () => {
  it('keeps GET /api/health public', () => {
    const captured = captureResponse()
    healthHandler({ method: 'GET' }, captured.res)
    expect(captured.status()).toBe(200)
    expect(captured.body()).toEqual({ status: 'ok' })
  })

  it('denies anonymous private GET and POST', async () => {
    const get = captureResponse()
    await withOwnerAuth(
      async (_req, res) => {
        res.status(200).json({ leaked: true })
      },
      { config: ownerConfig, readSession: async () => null },
    )(request({}, 'GET'), get.res)
    expect(get.status()).toBe(401)
    expect(get.body()).toEqual({ error: SIGN_IN_REQUIRED })
    expect(JSON.stringify(get.body())).not.toContain('leaked')

    const post = captureResponse()
    await withOwnerAuth(
      async (_req, res) => {
        res.status(201).json({ leaked: true })
      },
      { config: ownerConfig, readSession: async () => null },
    )(request({}, 'POST'), post.res)
    expect(post.status()).toBe(401)
  })

  it('denies anonymous transcription job creation', async () => {
    const captured = captureResponse()
    await withOwnerAuth(
      async (_req, res) => {
        res.status(202).json({ job: { id: 'should-not-leak' } })
      },
      { config: ownerConfig, readSession: async () => null },
    )(request({}, 'POST'), captured.res)
    expect(captured.status()).toBe(401)
    expect(JSON.stringify(captured.body())).not.toContain('should-not-leak')
    expect(JSON.stringify(captured.body())).not.toContain('HOME_AI')
  })

  it('denies a signed-in non-owner and allows the owner through to the handler', async () => {
    const denied = captureResponse()
    await withOwnerAuth(
      async (_req, res) => {
        res.status(200).json({ ok: true })
      },
      {
        config: ownerConfig,
        readSession: async () => ({ id: OTHER_ID, email: 'intruder@example.com' }),
      },
    )(request(), denied.res)
    expect(denied.status()).toBe(403)

    const allowed = captureResponse()
    await withOwnerAuth(
      async (_req, res) => {
        res.status(200).json({ ok: true })
      },
      {
        config: ownerConfig,
        readSession: async () => ({ id: OWNER_ID, email: 'owner@example.com' }),
      },
    )(request(), allowed.res)
    expect(allowed.status()).toBe(200)
    expect(allowed.body()).toEqual({ ok: true })
  })
})

describe('production handlers stay wrapped', () => {
  it('does not start a Home-AI job for an unauthenticated request', async () => {
    const captured = captureResponse()
    await transcriptionJobsHandler(request({}, 'POST'), captured.res)
    expect([401, 403, 503]).toContain(captured.status())
    expect(JSON.stringify(captured.body() ?? {})).not.toContain('HOME_AI_API_KEY')
  })
})

describe('auth proxy path', () => {
  it('uses /api/auth remainder, including a Vercel catch-all query.path rewrite', () => {
    expect(
      authProxyPath({
        url: '/api/auth/get-session',
        headers: {},
      } as ApiRequest),
    ).toBe('get-session')
    expect(
      authProxyPath({
        url: '/api/auth/sign-in/email',
        query: { path: ['auth', 'sign-in', 'email'] },
        headers: {},
      } as ApiRequest),
    ).toBe('sign-in/email')
    expect(
      authProxyPath({
        url: '/internal',
        query: { path: ['auth', 'get-session'] },
        headers: {},
      } as ApiRequest),
    ).toBe('get-session')
  })
})

describe('auth proxy blocks public registration', () => {
  it('does not forward sign-up through Health', async () => {
    const { proxyNeonAuth } = await import('../server/auth/proxy.ts')
    const captured = captureResponse()
    await proxyNeonAuth(
      {
        method: 'POST',
        url: '/api/auth/sign-up/email',
        headers: {},
      } as ApiRequest,
      captured.res,
    )
    expect(captured.status()).toBe(404)
  })
})

describe('client auth sources do not embed server secrets', () => {
  it('does not mention owner or home-ai secrets in browser auth files', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const files = [
      'src/auth/client.ts',
      'src/auth/AuthProvider.tsx',
      'src/auth/SignInPage.tsx',
      'src/lib/health-api.ts',
    ]
    for (const file of files) {
      const source = readFileSync(join(process.cwd(), file), 'utf8')
      expect(source).not.toContain('HEALTH_OWNER_USER_ID')
      expect(source).not.toContain('HOME_AI_API_KEY')
      expect(source).not.toContain('DATABASE_URL')
      expect(source).not.toContain('NEON_AUTH_COOKIE_SECRET')
    }
  })
})
