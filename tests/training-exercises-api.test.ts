import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { handleTrainingExercises, matchTrainingExerciseRoute } from '../server/handlers/training-exercises.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const { listExercises, createOwnerExercise, updateOwnerExercise, archiveOwnerExercise, getExerciseDefinition } = vi.hoisted(() => ({
  listExercises: vi.fn(),
  createOwnerExercise: vi.fn(),
  updateOwnerExercise: vi.fn(),
  archiveOwnerExercise: vi.fn(),
  getExerciseDefinition: vi.fn(),
}))

vi.mock('../server/training/service.ts', () => ({
  listExercises,
}))

vi.mock('../server/training/owner-exercises.ts', () => ({
  createOwnerExercise,
  updateOwnerExercise,
  archiveOwnerExercise,
  getExerciseDefinition,
}))

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const EXERCISE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

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
  headers?: Record<string, string>,
  body?: unknown,
) {
  const captured = captureResponse()
  return withOwnerAuth(handleTrainingExercises, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('owner exercise routes', () => {
  beforeEach(() => {
    listExercises.mockReset()
    createOwnerExercise.mockReset()
    updateOwnerExercise.mockReset()
    archiveOwnerExercise.mockReset()
    getExerciseDefinition.mockReset()
    listExercises.mockResolvedValue({ exercises: [] })
    createOwnerExercise.mockResolvedValue({ exercise: { id: EXERCISE } })
    updateOwnerExercise.mockResolvedValue({ exercise: { id: EXERCISE, name: 'Push-up' } })
    archiveOwnerExercise.mockResolvedValue({ exercise: { id: EXERCISE, isActive: false } })
  })

  it('keeps exercise writes on the owner and off machine ingest', () => {
    expect(matchHealthApiRoute('/api/training/exercises')).toBe('training-exercises')
    expect(matchHealthApiRoute(`/api/training/exercises/${EXERCISE}`)).toBe('training-exercises')
    expect(matchTrainingExerciseRoute(`/api/training/exercises/${EXERCISE}`)).toEqual({ kind: 'detail', id: EXERCISE })
    const handler = readFileSync('server/handlers/training-exercises.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('sync-auth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
  })

  it('rejects anonymous callers, non-owners, machine tokens, and the wrong method', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const body = { name: 'Push-up', measurementKind: 'reps', loadType: 'bodyweight', unilateral: false }
    expect((await call('POST', '/api/training/exercises', null, undefined, body)).status()).toBe(401)
    expect((await call('POST', '/api/training/exercises', null, { authorization: 'Bearer machine-token' }, body)).status()).toBe(401)
    expect(createOwnerExercise).not.toHaveBeenCalled()
    expect((await call('POST', '/api/training/exercises', { id: 'other', email: 'other@example.com' }, undefined, body)).status()).toBe(403)
    expect((await call('POST', '/api/training/exercises', owner, undefined, body)).status()).toBe(201)
    expect((await call('PUT', '/api/training/exercises', owner)).status()).toBe(405)
    expect((await call('PUT', '/api/training/exercises', owner)).allow()).toBe('GET, POST')
    expect((await call('GET', '/api/training/exercises', owner)).status()).toBe(200)
    expect((await call('PATCH', `/api/training/exercises/${EXERCISE}`, owner, undefined, body)).status()).toBe(200)
    expect((await call('DELETE', `/api/training/exercises/${EXERCISE}`, owner)).status()).toBe(200)
    expect((await call('POST', `/api/training/exercises/${EXERCISE}`, owner)).status()).toBe(405)
    expect((await call('POST', `/api/training/exercises/${EXERCISE}`, owner)).allow()).toBe('GET, PATCH, DELETE')
  })
})
