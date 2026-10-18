import { readFileSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withOwnerAuth } from '../server/auth/with-owner.ts'
import type { HealthOwnerConfig } from '../server/auth/config.ts'
import labRoute, { handleLab, matchLabRoute } from '../server/handlers/lab.ts'
import { matchHealthApiRoute } from '../server/dispatch.ts'
import { wrapNodeResponse, type ApiRequest, type ApiResponse } from '../server/http.ts'

const service = vi.hoisted(() => ({
  listExperiments: vi.fn(),
  createOwnerExperiment: vi.fn(),
  getExperiment: vi.fn(),
  patchExperiment: vi.fn(),
  deleteUntouchedExperiment: vi.fn(),
  scheduleExperiment: vi.fn(),
  startExperiment: vi.fn(),
  abandonExperiment: vi.fn(),
  supersedeExperiment: vi.fn(),
  acceptExperiment: vi.fn(),
  addExperimentProtocolVersion: vi.fn(),
  listBenchmarks: vi.fn(),
  createBenchmark: vi.fn(),
  getBenchmark: vi.fn(),
  patchBenchmark: vi.fn(),
  addBenchmarkProtocolVersion: vi.fn(),
  archiveBenchmark: vi.fn(),
}))

const results = vi.hoisted(() => ({
  previewBenchmarkResult: vi.fn(),
  commitBenchmarkResult: vi.fn(),
  listBenchmarkResults: vi.fn(),
  getBenchmarkResult: vi.fn(),
  invalidateBenchmarkResult: vi.fn(),
  getLabProtocolVersion: vi.fn(),
}))

const retests = vi.hoisted(() => ({
  listBenchmarkRetests: vi.fn(),
  getBenchmarkRetest: vi.fn(),
}))

const suggestions = vi.hoisted(() => ({
  listExperimentSuggestions: vi.fn(),
  readExperimentSuggestion: vi.fn(),
  draftExperimentSuggestion: vi.fn(),
  acceptExperimentSuggestion: vi.fn(),
}))

const experimentResults = vi.hoisted(() => ({
  previewExperimentResult: vi.fn(),
  commitExperimentResult: vi.fn(),
  getExperimentResult: vi.fn(),
  invalidateExperimentResult: vi.fn(),
  listTimelineExperimentResults: vi.fn(),
}))

const feedback = vi.hoisted(() => ({ submitOwnerOutcomeFeedback: vi.fn() }))

const implementation = vi.hoisted(() => ({
  confirmOwnerExperimentImplementation: vi.fn(),
  correctOwnerExperimentImplementation: vi.fn(),
  retractOwnerExperimentImplementation: vi.fn(),
}))

vi.mock('../server/lab/service.ts', () => service)
vi.mock('../server/lab/implementation.ts', () => implementation)
vi.mock('../server/lab/outcome-feedback.ts', () => feedback)
vi.mock('../server/lab/results.ts', () => results)
vi.mock('../server/lab/retests.ts', () => retests)
vi.mock('../server/lab/experiment-results.ts', () => experimentResults)
vi.mock('../server/lab/suggestions.ts', () => suggestions)

const ownerConfig: HealthOwnerConfig = {
  authBaseUrl: 'https://auth.example',
  cookieSecret: 'x'.repeat(32),
  sameSite: 'lax',
  sessionDataTtl: 300,
  ownerUserId: 'owner-1',
  ownerEmail: 'owner@example.com',
}

const EXPERIMENT = '11111111-1111-4111-8111-111111111111'

function request(method: string, url: string, headers: Record<string, string> = {}, body?: unknown): ApiRequest {
  return { method, url, headers, body, async *[Symbol.asyncIterator]() {} } as ApiRequest
}

function captureResponse(): { res: ApiResponse; status: () => number; allow: () => string | undefined; body: () => unknown } {
  const nodeRes = new ServerResponse(new IncomingMessage(new Socket()))
  const res = wrapNodeResponse(nodeRes)
  let statusCode = 200
  let payload: unknown
  const headers = new Map<string, string>()
  res.setHeader = ((name: string, value: string) => {
    headers.set(name.toLowerCase(), value)
    return res
  }) as ApiResponse['setHeader']
  res.status = (code: number) => {
    statusCode = code
    return res
  }
  res.json = (value: unknown) => {
    payload = value
    return res
  }
  return { res, status: () => statusCode, allow: () => headers.get('allow'), body: () => payload }
}

function call(method: string, url: string, identity: { id: string; email: string } | null, headers?: Record<string, string>, body?: unknown) {
  const captured = captureResponse()
  return withOwnerAuth(handleLab, {
    config: ownerConfig,
    readSession: async () => identity,
  })(request(method, url, headers, body), captured.res).then(() => captured)
}

describe('personal lab API auth', () => {
  beforeEach(() => {
    for (const fn of Object.values(service)) {
      fn.mockReset()
    }
    for (const fn of Object.values(results)) {
      fn.mockReset()
    }
    for (const fn of Object.values(retests)) {
      fn.mockReset()
    }
    for (const fn of Object.values(experimentResults)) {
      fn.mockReset()
    }
    for (const fn of Object.values(suggestions)) {
      fn.mockReset()
    }
    retests.listBenchmarkRetests.mockResolvedValue({ asOf: '2026-09-26', retests: [] })
    retests.getBenchmarkRetest.mockResolvedValue({ isActive: true, asOf: '2026-09-26', current: { status: 'no_baseline' }, history: [] })
    service.listExperiments.mockResolvedValue({ experiments: [] })
    service.createOwnerExperiment.mockResolvedValue({ id: EXPERIMENT, status: 'accepted', origin: 'owner_created' })
    service.startExperiment.mockResolvedValue({ id: EXPERIMENT, status: 'active' })
    for (const fn of Object.values(implementation)) fn.mockReset()
    feedback.submitOwnerOutcomeFeedback.mockReset()
    feedback.submitOwnerOutcomeFeedback.mockResolvedValue({ recorded: true, version: 1, action: 'recorded' })
    service.getExperiment.mockResolvedValue({ id: EXPERIMENT, status: 'active' })
  })

  it('keeps lab on owner auth and away from machine ingest', () => {
    expect(matchHealthApiRoute('/api/lab/experiments')).toBe('lab')
    expect(matchLabRoute('/api/lab/experiments')).toEqual({ kind: 'experiments' })
    expect(matchLabRoute(`/api/lab/experiments/${EXPERIMENT}/start`)).toEqual({
      kind: 'experiment',
      id: EXPERIMENT,
      action: 'start',
    })
    expect(matchHealthApiRoute('/api/ingest/apple-health')).toBe('apple-health-sync')
    const handler = readFileSync('server/handlers/lab.ts', 'utf8')
    expect(handler).toContain('withOwnerAuth')
    expect(handler).not.toContain('APPLE_HEALTH_SYNC_TOKEN')
    expect(handler).not.toContain("status = 'completed'")
  })

  it('rejects anonymous callers, non-owners, machine tokens, and the wrong method', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect((await call('GET', '/api/lab/experiments', null)).status()).toBe(401)
    expect((await call('POST', '/api/lab/experiments', null, { authorization: 'Bearer machine-token' }, { title: 'Idea' })).status()).toBe(401)
    expect(service.createOwnerExperiment).not.toHaveBeenCalled()
    expect((await call('GET', '/api/lab/experiments', { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', '/api/lab/experiments', owner)).status()).toBe(200)
    const created = await call('POST', '/api/lab/experiments', owner, undefined, { title: 'Idea' })
    expect(created.status()).toBe(201)
    expect(service.createOwnerExperiment).toHaveBeenCalled()
    const wrong = await call('PUT', '/api/lab/experiments', owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET, POST')
    const started = await call('POST', `/api/lab/experiments/${EXPERIMENT}/start`, owner)
    expect(started.status()).toBe(200)
    expect(service.startExperiment).toHaveBeenCalledWith(EXPERIMENT)
  })

  it('makes actual experiment implementation a separate owner-authenticated POST', async () => {
    const path = `/api/lab/experiments/${EXPERIMENT}/implementation`
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const input = { confirmImplemented: true, effectiveDate: '2026-10-17', behaviorChange: 'Walk after lunch' }
    expect(matchLabRoute(path)).toEqual({ kind: 'experiment', id: EXPERIMENT, action: 'implementation' })
    expect((await call('POST', path, null, {}, input)).status()).toBe(401)
    expect((await call('POST', path, { id: 'other', email: 'other@example.com' }, {}, input)).status()).toBe(403)
    expect(implementation.confirmOwnerExperimentImplementation).not.toHaveBeenCalled()
    const invalid = await call('GET', path, owner)
    expect(invalid.status()).toBe(405)
    const saved = await call('POST', path, owner, {}, input)
    expect(saved.status()).toBe(200)
    expect(implementation.confirmOwnerExperimentImplementation).toHaveBeenCalledWith(EXPERIMENT, input)
    expect(service.startExperiment).not.toHaveBeenCalled()
  })

  it('allows only the owner to correct or retract with distinct authenticated routes', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const body = { expectedRevision: 0, reason: 'Incorrect description', confirmCorrection: true,
      effectiveDate: '2026-10-14', behaviorChange: 'Corrected walk' }
    for (const [suffix, action, mock] of [
      ['implementation-correct', 'implementation-correct', implementation.correctOwnerExperimentImplementation],
      ['implementation-retract', 'implementation-retract', implementation.retractOwnerExperimentImplementation],
    ] as const) {
      const url = `/api/lab/experiments/${EXPERIMENT}/${suffix}`
      expect(matchLabRoute(url)).toEqual({ kind: 'experiment', id: EXPERIMENT, action })
      expect((await call('POST', url, null, {}, body)).status()).toBe(401)
      expect((await call('POST', url, { id: 'other', email: 'other@example.com' }, {}, body)).status()).toBe(403)
      expect(mock).not.toHaveBeenCalled()
      expect((await call('GET', url, owner)).status()).toBe(405)
      expect((await call('POST', url, owner, {}, body)).status()).toBe(200)
      expect(mock).toHaveBeenCalledWith(EXPERIMENT, body)
    }
  })

  it('keeps optional outcome feedback owner-only and POST-only', async () => {
    const path = `/api/lab/experiment-results/${EXPERIMENT}/outcome-feedback`
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    const body = { confirmFeedback: true, action: 'record', expectedVersion: 0, unloggedFactors: 'unsure' }
    expect(matchLabRoute(path)).toEqual({kind:'experiment-result',id:EXPERIMENT,action:'outcome-feedback'})
    expect((await call('POST',path,null,{},body)).status()).toBe(401)
    expect((await call('POST',path,{id:'other',email:'other@example.com'}, {},body)).status()).toBe(403)
    expect(feedback.submitOwnerOutcomeFeedback).not.toHaveBeenCalled()
    expect((await call('GET',path,owner)).status()).toBe(405)
    expect((await call('POST',path,owner,{},body)).status()).toBe(200)
    expect(feedback.submitOwnerOutcomeFeedback).toHaveBeenCalledWith(EXPERIMENT,body)
  })

  it('keeps benchmark results owner-only and immutable', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    results.getBenchmarkResult.mockResolvedValue({ id: EXPERIMENT, status: 'valid' })
    results.commitBenchmarkResult.mockResolvedValue({ status: 'created', result: { id: EXPERIMENT } })
    expect((await call('POST', `/api/lab/benchmarks/${EXPERIMENT}/results`, null, { authorization: 'Bearer machine-token' }, { protocolVersionId: EXPERIMENT })).status()).toBe(401)
    expect(results.commitBenchmarkResult).not.toHaveBeenCalled()
    expect((await call('GET', `/api/lab/benchmark-results/${EXPERIMENT}`, { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', `/api/lab/benchmark-results/${EXPERIMENT}`, owner)).status()).toBe(200)
    const patched = await call('PATCH', `/api/lab/benchmark-results/${EXPERIMENT}`, owner, undefined, { value: 81 })
    expect(patched.status()).toBe(405)
    expect(patched.allow()).toBe('GET')
    const committed = await call('POST', `/api/lab/benchmarks/${EXPERIMENT}/results`, owner, undefined, { protocolVersionId: EXPERIMENT })
    expect(committed.status()).toBe(201)
  })

  it('keeps experiment results owner-only and rejects client classification', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    experimentResults.previewExperimentResult.mockResolvedValue({ state: 'ready', classification: 'completed_interpretable' })
    experimentResults.commitExperimentResult.mockResolvedValue({ id: EXPERIMENT, classification: 'completed_interpretable' })
    experimentResults.getExperimentResult.mockResolvedValue({ id: EXPERIMENT, status: 'valid' })
    expect(matchLabRoute(`/api/lab/experiments/${EXPERIMENT}/result/preview`)).toEqual({
      kind: 'experiment',
      id: EXPERIMENT,
      action: 'result',
      preview: true,
    })
    expect((await call('POST', `/api/lab/experiments/${EXPERIMENT}/result`, null, { authorization: 'Bearer machine-token' }, { protocolFollowed: 'followed' })).status()).toBe(401)
    expect(experimentResults.commitExperimentResult).not.toHaveBeenCalled()
    expect((await call('GET', `/api/lab/experiment-results/${EXPERIMENT}`, { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', `/api/lab/experiment-results/${EXPERIMENT}`, owner)).status()).toBe(200)
    const patched = await call('PATCH', `/api/lab/experiment-results/${EXPERIMENT}`, owner)
    expect(patched.status()).toBe(405)
    expect(patched.allow()).toBe('GET')
    const preview = await call('POST', `/api/lab/experiments/${EXPERIMENT}/result/preview`, owner, undefined, { protocolFollowed: 'followed', stoppedForSafety: false })
    expect(preview.status()).toBe(200)
    const committed = await call('POST', `/api/lab/experiments/${EXPERIMENT}/result`, owner, undefined, { protocolFollowed: 'followed', stoppedForSafety: false })
    expect(committed.status()).toBe(201)
    expect(experimentResults.commitExperimentResult).toHaveBeenCalled()
  })

  it('keeps retest reads owner-only', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    expect(matchLabRoute('/api/lab/retests')).toEqual({ kind: 'retests' })
    expect(matchLabRoute(`/api/lab/benchmarks/${EXPERIMENT}/retest`)).toEqual({
      kind: 'benchmark',
      id: EXPERIMENT,
      action: 'retest',
      preview: false,
    })
    expect((await call('GET', '/api/lab/retests', null)).status()).toBe(401)
    expect((await call('GET', '/api/lab/retests', null, { authorization: 'Bearer machine-token' })).status()).toBe(401)
    expect(retests.listBenchmarkRetests).not.toHaveBeenCalled()
    expect((await call('GET', '/api/lab/retests', { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', '/api/lab/retests', owner)).status()).toBe(200)
    const wrong = await call('POST', '/api/lab/retests', owner)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET')
    const detail = await call('GET', `/api/lab/benchmarks/${EXPERIMENT}/retest?asOf=2026-09-01`, owner)
    expect(detail.status()).toBe(200)
    expect(retests.getBenchmarkRetest).toHaveBeenCalledWith(EXPERIMENT, '2026-09-01')
    const badDate = await call('GET', '/api/lab/retests?asOf=tomorrow', owner)
    expect(badDate.status()).toBe(400)
  })

  it('keeps experiment suggestions on owner auth', async () => {
    const owner = { id: 'owner-1', email: 'owner@example.com' }
    suggestions.listExperimentSuggestions.mockResolvedValue({ suggestions: [], empty: 'No evidence-grounded experiment suggestions right now.' })
    expect(matchLabRoute('/api/lab/experiment-suggestions')).toEqual({
      kind: 'suggestions',
      candidateId: null,
      action: null,
    })
    expect((await call('GET', '/api/lab/experiment-suggestions', null)).status()).toBe(401)
    expect((await call('GET', '/api/lab/experiment-suggestions', null, { authorization: 'Bearer machine-token' })).status()).toBe(401)
    expect(suggestions.listExperimentSuggestions).not.toHaveBeenCalled()
    expect((await call('GET', '/api/lab/experiment-suggestions', { id: 'other', email: 'other@example.com' })).status()).toBe(403)
    expect((await call('GET', '/api/lab/experiment-suggestions', owner)).status()).toBe(200)
    expect(suggestions.listExperimentSuggestions).toHaveBeenCalled()
    const wrong = captureResponse()
    await labRoute(request('DELETE', '/api/lab/experiment-suggestions'), wrong.res)
    expect(wrong.status()).toBe(405)
    expect(wrong.allow()).toBe('GET')
  })
})
