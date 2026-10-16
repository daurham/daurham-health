import { describe, expect, it, vi } from 'vitest'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/index.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import { HttpError } from '../server/http.js'

/** No owner records, database writes, or live provider calls. */
function packet() {
  return buildAskHealthEvidencePacket({
    lens: 'general', range: '30d',
    asOf: '2026-10-14', healthToday: '2026-10-14', period: { start: '2026-09-15', end: '2026-10-14' },
    generatedAt: '2026-10-14T18:00:00.000Z', question: 'How is my goal?',
    overview: null, activity: null, sleep: null,
    goals: [{
      id: 'fixture-goal', kind: 'body_metric', lifecycle: 'active', label: 'Weight',
      targetText: 'At most 80 kg', targetState: 'above_target',
      deadlineState: 'none', projectionState: 'insufficient_data', projectionReason: null,
    }],
    experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
  })
}
function provider() {
  return vi.fn(async () => ({
    text: JSON.stringify({ blocks: [
      { text: 'The stored goal is at most 80 kg.', evidence_refs: ['goals.fixture-goal'] },
    ], limitations: [], follow_ups: [] }),
    model: 'piq-stub', inputTokens: 12, outputTokens: 13,
  }))
}
const moment = Date.parse('2026-10-14T18:00:00.000Z')

describe('PIQ-0 Ask Health error-path contract', () => {
  it('T20: no provider call after budget limit, with identifiable failure code', async () => {
    const model = provider()
    await expect(explainAskHealth({
      packet: packet(), question: 'How is my goal?', conversation: [], provider: model,
      gate: createAskHealthGate({ budgetUsd: 0 }), model: 'piq-stub', now: moment,
    })).rejects.toMatchObject({ statusCode: 429, code: 'ASK_HEALTH_BUDGET_EXCEEDED' })
    expect(model).not.toHaveBeenCalled()
  })

  it('T20: rate limit is distinct from budget cap and cache hit', async () => {
    const model = provider()
    const gate = createAskHealthGate({ minIntervalMs: 10_000 })
    const args = { packet: packet(), conversation: [], provider: model, gate, model: 'piq-stub' }
    await explainAskHealth({ ...args, question: 'How is my goal?', now: moment })
    const cached = await explainAskHealth({ ...args, question: 'How is my goal?', now: moment + 200 })
    expect(cached.meta.diagnostic.path).toBe('cache_hit')
    await expect(explainAskHealth({
      ...args, question: 'Explain my stored goal', now: moment + 1_000,
    })).rejects.toMatchObject({ statusCode: 429, code: 'ASK_HEALTH_RATE_LIMIT' })
    expect(model).toHaveBeenCalledTimes(1)
  })

  it('T28: invalid provider JSON is repaired at most once and then classified', async () => {
    const model = vi.fn(async () => ({
      text: 'not valid json', model: 'piq-stub', inputTokens: 2, outputTokens: 1,
    }))
    const logger = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(explainAskHealth({
        packet: packet(), question: 'How is my goal?', conversation: [], provider: model,
        gate: createAskHealthGate(), model: 'piq-stub', now: moment,
      })).rejects.toMatchObject({ statusCode: 502, code: 'ASK_HEALTH_INVALID_RESPONSE' })
      expect(model).toHaveBeenCalledTimes(2)
    } finally {
      logger.mockRestore()
      errors.mockRestore()
    }
  })

  it('provider failure returns sanitized error rather than exposing provider exception content', async () => {
    const model = vi.fn(async (): Promise<never> => { throw new Error('sensitive provider exception content') })
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let failure: unknown
      try {
        await explainAskHealth({
          packet: packet(), question: 'How is my goal?', conversation: [], provider: model,
          gate: createAskHealthGate(), model: 'piq-stub', now: moment,
        })
      } catch (error) {
        failure = error
      }
      expect(failure).toBeInstanceOf(HttpError)
      const safe = failure as HttpError
      expect(safe.statusCode).toBe(502)
      expect(safe.code).toMatch(/^ASK_HEALTH_/)
      expect(safe.message).not.toContain('sensitive provider exception content')
      expect(JSON.stringify(logger.mock.calls)).not.toContain('sensitive provider exception content')
      expect(model).toHaveBeenCalledTimes(1)
    } finally {
      logger.mockRestore()
    }
  })
})
