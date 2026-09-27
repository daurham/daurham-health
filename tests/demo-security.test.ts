import { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { Socket } from 'node:net'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import apiHandler from '../api/index.ts'
import { AuthContext, type AuthContextValue } from '../src/auth/context.ts'
import { Layout } from '../src/components/Layout.tsx'
import { AppSurfaceProvider } from '../src/lib/app-prefix.ts'
import { DemoTodayPage } from '../src/features/demo/DemoTodayPage.tsx'
import { requireHealthOwner } from '../server/auth/owner.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { HttpError, wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const anonymous: AuthContextValue = {
  status: 'anonymous',
  email: null,
  refresh: async () => undefined,
  signOut: async () => undefined,
}

function renderAnonymous(pathName: string) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [pathName] },
      React.createElement(AuthContext.Provider, { value: anonymous }, React.createElement(Layout)),
    ),
  )
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

function captureResponse(): { res: ApiResponse; status: () => number } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  res.status = (code: number) => {
    statusCode = code
    nodeRes.statusCode = code
    return res
  }
  res.json = () => undefined
  return { res, status: () => statusCode }
}

async function hit(method: string, publicUrl: string) {
  const pathname = publicUrl.split('?')[0] ?? ''
  const rest = pathname.replace(/^\/api\//, '')
  const captured = captureResponse()
  await apiHandler(request(method, `/api?path=${rest}`, { path: rest }), captured.res)
  return captured.status()
}

describe('public demo security boundary', () => {
  it('renders the demo anonymously and keeps owner navigation locked', () => {
    const locked = renderAnonymous('/')
    expect(locked).toContain('Owner Sign In')
    expect(locked).toContain('Explore demo')
    expect(locked).toContain('href="/demo"')
    const demo = renderAnonymous('/demo')
    expect(demo).toContain('Demo data.')
    expect(demo).toContain('No personal health information is shown.')
    expect(demo).toContain('Sign in to private app')
    expect(demo).toContain('href="/demo/nutrition"')
    expect(demo).toContain('href="/demo/training"')
    expect(demo).toContain('href="/demo/body"')
    expect(demo).toContain('href="/demo/progress"')
    expect(demo).not.toContain('Private Health data')
    expect(demo).not.toContain('href="/nutrition"')
    expect(demo).not.toContain('href="/progress"')
    const today = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        null,
        React.createElement(AppSurfaceProvider, {
          prefix: '/demo',
          readOnly: true,
          children: React.createElement(DemoTodayPage),
        }),
      ),
    )
    expect(today).toContain('href="/demo/nutrition')
    expect(today).toContain('href="/demo/training/')
    expect(today).toContain('href="/demo/progress/activity"')
    expect(today).not.toContain('Add food')
    expect(today).not.toContain('Log workout')
    expect(today).not.toContain('Ad-hoc workout')
    expect(today).not.toContain('Add measurement')
    expect(today).not.toContain('Add context')
    expect(today).not.toContain('/context')
    const lockedContext = renderAnonymous('/context')
    expect(lockedContext).toContain('Private Health data')
    expect(lockedContext).not.toContain('What was different about this day?')
  })

  it('has no public demo API and keeps private owner routes closed', async () => {
    expect(matchHealthApiRoute('/api/demo')).toBeNull()
    expect(matchHealthApiRoute('/api/demo/today')).toBeNull()
    expect(await hit('GET', '/api/demo/today')).toBe(404)
    await expect(
      requireHealthOwner(request('GET', '/api/today'), {
        config: {
          authBaseUrl: 'https://auth.example.test',
          cookieSecret: 'demo-boundary-cookie-secret-32',
          sameSite: 'lax',
          sessionDataTtl: 300,
          ownerUserId: null,
          ownerEmail: 'owner@example.test',
        },
        readSession: async () => null,
      }),
    ).rejects.toBeInstanceOf(HttpError)
    await expect(
      requireHealthOwner(request('GET', '/api/today'), {
        config: {
          authBaseUrl: 'https://auth.example.test',
          cookieSecret: 'demo-boundary-cookie-secret-32',
          sameSite: 'lax',
          sessionDataTtl: 300,
          ownerUserId: null,
          ownerEmail: 'owner@example.test',
        },
        readSession: async () => null,
      }),
    ).rejects.toMatchObject({ statusCode: 401 })
    const denied = [
      ['GET', '/api/today'],
      ['GET', '/api/supplements'],
      ['POST', '/api/supplements/adherence'],
      ['GET', '/api/nutrition/day'],
      ['GET', '/api/nutrition/entries'],
      ['GET', '/api/training/sessions'],
      ['GET', '/api/progress/overview'],
      ['GET', '/api/backup/export'],
      ['POST', '/api/ingest/apple-health'],
      ['POST', '/api/nutrition/meal/jobs'],
      ['POST', '/api/nutrition/label/jobs'],
      ['POST', '/api/nutrition/describe'],
      ['GET', '/api/nutrition/recipes'],
      ['POST', '/api/nutrition/recipes'],
      ['GET', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111'],
      ['POST', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111/archive'],
      ['POST', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111/restore'],
      ['POST', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111/versions/preview'],
      ['POST', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111/versions'],
      ['GET', '/api/nutrition/recipes/11111111-1111-4111-8111-111111111111/versions/1'],
      ['POST', '/api/nutrition/recipe-entries'],
      ['POST', '/api/nutrition/usda/search'],
      ['POST', '/api/nutrition/usda/foods'],
      ['POST', '/api/nutrition/recipe-foods'],
      ['POST', '/api/training/transcription/jobs'],
      ['POST', '/api/training/exercises'],
      ['POST', '/api/body/import/fit-profile/commit'],
      ['POST', '/api/body/measurements'],
      ['PUT', '/api/body/cadences/waist_circumference'],
      ['GET', '/api/context/days'],
      ['PUT', '/api/context/days/2026-09-26'],
      ['DELETE', '/api/context/days/2026-09-26'],
      ['GET', '/api/lab/experiments'],
      ['POST', '/api/lab/experiments'],
      ['GET', '/api/lab/benchmarks'],
      ['POST', '/api/lab/benchmarks'],
      ['POST', '/api/lab/benchmarks/11111111-1111-4111-8111-111111111111/results'],
      ['POST', '/api/lab/benchmark-results/11111111-1111-4111-8111-111111111111/invalidate'],
      ['POST', '/api/lab/experiments/11111111-1111-4111-8111-111111111111/result/preview'],
      ['POST', '/api/lab/experiments/11111111-1111-4111-8111-111111111111/result'],
      ['GET', '/api/lab/experiment-results/11111111-1111-4111-8111-111111111111'],
      ['POST', '/api/lab/experiment-results/11111111-1111-4111-8111-111111111111/invalidate'],
      ['GET', '/api/progress/sleep/2026-09-23'],
      ['GET', '/api/goals'],
      ['POST', '/api/goals'],
      ['GET', '/api/goals/11111111-1111-4111-8111-111111111111'],
      ['GET', '/api/goals/11111111-1111-4111-8111-111111111111/projection'],
      ['POST', '/api/goals/11111111-1111-4111-8111-111111111111/versions'],
      ['POST', '/api/goals/11111111-1111-4111-8111-111111111111/pause'],
      ['POST', '/api/goals/11111111-1111-4111-8111-111111111111/resume'],
      ['POST', '/api/goals/11111111-1111-4111-8111-111111111111/complete'],
      ['POST', '/api/goals/11111111-1111-4111-8111-111111111111/reopen'],
      ['GET', '/api/lab/retests'],
      ['GET', '/api/lab/benchmarks/11111111-1111-4111-8111-111111111111/retest'],
    ] as const
    for (const [method, url] of denied) {
      const status = await hit(method, url)
      expect(status, url).not.toBe(200)
      expect([401, 403, 503], url).toContain(status)
    }
    const repository = readFileSync(path.join(process.cwd(), 'src/demo/repository.ts'), 'utf8')
    expect(repository).not.toMatch(/getSql|server\/|healthFetch|fallback/i)
    expect(repository).toContain('Missing demo records stay missing')
  })
})
