import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleNutritionRecipes, matchRecipeRoute } from '../server/handlers/nutrition-recipes.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  listRecipes: vi.fn(),
  getRecipe: vi.fn(),
  createRecipe: vi.fn(),
  archiveRecipe: vi.fn(),
  restoreRecipe: vi.fn(),
  previewRecipeEdit: vi.fn(),
  commitRecipeVersion: vi.fn(),
  getRecipeVersion: vi.fn(),
}))

vi.mock('../server/nutrition/recipes.ts', () => service)

const consumption = vi.hoisted(() => ({
  logRecipeConsumption: vi.fn(),
}))

vi.mock('../server/nutrition/recipe-consumption.ts', () => consumption)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const RECIPE = '11111111-1111-4111-8111-111111111111'

function request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): ApiRequest {
  return { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; allow: () => string | undefined } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = () => res
  return { res, status: () => statusCode, allow: () => headers.get('allow') }
}

function call(
  method: string,
  url: string,
  identity: { id: string; email: string } | null,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  const captured = captureResponse()
  return withOwnerAuth(handleNutritionRecipes, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('recipe API auth', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) fn.mockReset()
    service.listRecipes.mockResolvedValue({ recipes: [] })
    service.createRecipe.mockResolvedValue({ id: RECIPE, version: { version: 1, isCurrent: true } })
    service.getRecipe.mockResolvedValue({ id: RECIPE, isActive: true })
    service.archiveRecipe.mockResolvedValue({ id: RECIPE, isActive: false })
    service.restoreRecipe.mockResolvedValue({ id: RECIPE, isActive: true })
    service.previewRecipeEdit.mockResolvedValue({ canCommit: true, candidateVersionNumber: 2 })
    service.commitRecipeVersion.mockResolvedValue({ id: RECIPE, version: { version: 2, isCurrent: true } })
    service.getRecipeVersion.mockResolvedValue({ id: RECIPE, version: { version: 1, isCurrent: false } })
    consumption.logRecipeConsumption.mockResolvedValue({ id: 'entry-1', recipeVersionId: 'version-1' })
  })

  it('keeps recipes on owner auth and away from machine ingest', () => {
    expect(matchHealthApiRoute('/api/nutrition/recipes')).toBe('nutrition-recipes')
    expect(matchRecipeRoute(`/api/nutrition/recipes/${RECIPE}/archive`)).toEqual({ kind: 'item', id: RECIPE, action: 'archive' })
    expect(matchRecipeRoute(`/api/nutrition/recipes/${RECIPE}/versions/preview`)).toEqual({ kind: 'versions', id: RECIPE, action: 'preview' })
    expect(matchRecipeRoute(`/api/nutrition/recipes/${RECIPE}/versions`)).toEqual({ kind: 'versions', id: RECIPE, action: 'commit' })
    expect(matchRecipeRoute(`/api/nutrition/recipes/${RECIPE}/versions/1`)).toEqual({ kind: 'versions', id: RECIPE, action: 1 })
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    const handler = readFileSync('server/handlers/nutrition-recipes.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(handler).not.toContain('PATCH')
  })

  it('rejects anonymous callers, non-owners, machine tokens, and the wrong method', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/nutrition/recipes', null)).status()).toBe(401)
    expect((await call('POST', '/api/nutrition/recipes', null, { name: 'Stew' }, { authorization: 'Bearer machine-token' })).status()).toBe(401)
    expect(service.createRecipe).not.toHaveBeenCalled()
    expect((await call('GET', '/api/nutrition/recipes', { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', '/api/nutrition/recipes', owner)).status()).toBe(200)
    expect((await call('POST', '/api/nutrition/recipes', owner, { name: 'Stew' })).status()).toBe(201)
    const wrong = await call('PUT', '/api/nutrition/recipes', owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, POST')
    const patched = await call('PATCH', `/api/nutrition/recipes/${RECIPE}`, owner, { name: 'Changed' })
    expect(patched.status()).toBe(405)
    expect(patched.allow()).toBe('GET')
    expect(service.getRecipe).not.toHaveBeenCalled()
    expect((await call('POST', `/api/nutrition/recipes/${RECIPE}/archive`, owner)).status()).toBe(200)
    expect((await call('POST', `/api/nutrition/recipes/${RECIPE}/restore`, owner)).status()).toBe(200)
    expect((await call('POST', `/api/nutrition/recipes/${RECIPE}/versions/preview`, null, { name: 'Stew' })).status()).toBe(401)
    expect((await call('POST', `/api/nutrition/recipes/${RECIPE}/versions`, owner, { name: 'Stew' })).status()).toBe(201)
    const versionGet = await call('POST', `/api/nutrition/recipes/${RECIPE}/versions/1`, owner)
    expect(versionGet.status()).toBe(405)
    expect(versionGet.allow()).toBe('GET')
    expect((await call('GET', `/api/nutrition/recipes/${RECIPE}/versions/1`, owner)).status()).toBe(200)
    expect((await call('POST', '/api/nutrition/recipe-entries', null, { amount: 1 })).status()).toBe(401)
    expect((await call('POST', '/api/nutrition/recipe-entries', owner, { amount: 1 })).status()).toBe(201)
    const recipeLog = await call('GET', '/api/nutrition/recipe-entries', owner)
    expect(recipeLog.status()).toBe(405)
    expect(recipeLog.allow()).toBe('POST')
  })
})
