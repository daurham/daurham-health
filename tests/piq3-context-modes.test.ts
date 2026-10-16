import { describe, expect, it, vi } from 'vitest'
import { parseAskHealthRequest, buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import { answerAskHealth, explainAskHealth, type AskHealthProvider } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import { buildHealthIntelligenceSnapshot, routeHealthIntelligence } from '../src/domain/intelligence/shared.js'

const load = vi.hoisted(() => vi.fn())
vi.mock('../server/ask-health/load.js', () => ({ loadAskHealthPacketInput: load }))

const date = '2026-10-15'
const q = 'What does creatine do?'
const params = {
  question: q, lens: 'training' as const, range: '30d' as const,
  asOf: date, conversation: [], model: 'piq-stub',
  generatedAt: date + 'T17:00:00.000Z',
}
const makeProvider = () => vi.fn(async (req: Parameters<AskHealthProvider>[0]) => ({
  model: req.model, inputTokens: 10, outputTokens: 12,
  text: JSON.stringify({
    blocks: [{ text: 'Creatine supports short bouts of high-intensity work.', evidence_refs: [] }],
    limitations: [], follow_ups: [],
  }),
}))
function inputFor(question = q): AskHealthPacketInput {
  return {
    ...params, question, period: { start: '2026-09-16', end: date },
    overview: null, activity: null, sleep: null, context: null, patterns: [],
    goals: [{
      id: 'synthetic-owner-goal', kind: 'body_metric', lifecycle: 'active',
      label: 'Weight', targetText: 'At most 80 kg',
      targetState: 'above_target', deadlineState: 'none',
      projectionState: 'insufficient_data', projectionReason: null,
    }],
    supplements: [], experiments: [], benchmarks: [],
  }
}
const fakeGate = () => createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })

describe('PIQ-3 explicit Context Mode request contract', () => {
  it('defaults an omitted request mode to personalized; rejects unknown or malformed modes', () => {
    const parsed = parseAskHealthRequest({ question: q }, date)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.contextMode).toBe('personalized')
    for (const mode of ['all', 'system', '', 100, null, ['deep']]) {
      expect(parseAskHealthRequest({ question: q, contextMode: mode }, date).ok).toBe(false)
    }
    for (const mode of ['smart','personalized','deep','general_only']) {
      const value = parseAskHealthRequest({ question: q, contextMode: mode }, date)
      expect(value.ok).toBe(true)
      if (value.ok) expect(value.value.contextMode).toBe(mode)
    }
  })

  it('General Only never reads private owner records, regardless of question wording', async () => {
    load.mockReset()
    const stub = makeProvider()
    const result = await answerAskHealth({ ...params, question: 'What is my height?',
      contextMode: 'general_only', provider: stub, gate: fakeGate(),
    })
    expect(load).not.toHaveBeenCalled()
    expect(result.meta).toMatchObject({
      answerScope: 'general', contextMode: 'general_only', evidenceOverview: { availableCount: 0, domains: [] },
    })
    expect(result.evidence).toEqual([])
    expect(stub.mock.calls[0]![0].evidenceIds).toEqual([])
    expect(stub.mock.calls[0]![0].user).not.toContain('CONVERSATION CONTEXT')
  })

  it('General Only scrubs a mistakenly passed personal packet AND private conversation', async () => {
    const packet = buildAskHealthEvidencePacket({ ...inputFor(), lens: 'general' })
    expect(packet.evidence.some(x => x.substantive)).toBe(true)
    const stub = makeProvider()
    const result = await explainAskHealth({ packet, question: q, contextMode: 'general_only',
      conversation: [{ role: 'user', text: 'Sensitive previous conversation' }],
      provider: stub, gate: fakeGate(), model: 'piq-stub', now: 1000,
    })
    expect(result.meta.answerScope).toBe('general')
    expect(result.meta.evidenceOverview.availableCount).toBe(0)
    expect(stub.mock.calls[0]![0].user).not.toContain('Sensitive previous conversation')
    expect(stub.mock.calls[0]![0].user).not.toContain('synthetic-owner-goal')
  })

  it('Personalized forces private evidence loading even for a generally worded prompt', async () => {
    load.mockReset().mockImplementation(async (args: { lens: 'general' | 'training' }) => ({ ...inputFor(), lens: args.lens }))
    const stub = makeProvider()
    const result = await answerAskHealth({
      ...params, contextMode: 'personalized', provider: stub, gate: fakeGate(),
    })
    expect(load).toHaveBeenCalledOnce()
    expect(load.mock.calls[0]![0].lens).toBe('general')
    expect(result.meta.answerScope).toBe('personal')
    expect(result.meta.contextMode).toBe('personalized')
    expect(result.meta.evidenceOverview.availableCount).toBeGreaterThan(1)
    expect(stub.mock.calls[0]![0].user).toContain('synthetic-owner-goal')
    expect(stub.mock.calls[0]![0].system).toContain('You explain one person')
  })

  it('Deep Dive requests cross-domain signals rather than only question-token matches', () => {
    const snapshot = buildHealthIntelligenceSnapshot({
      range: '30d', asOf: date, start: '2026-10-14', end: date,
      today: null, timezone: 'America/Phoenix', observations: [],
    })
    const normal = routeHealthIntelligence(snapshot, { question: q, lens: 'general' })
    const deep = routeHealthIntelligence(snapshot, { question: q, lens: 'general', wide: true })
    expect(normal.selectedKeys).not.toContain('nutrition.fiber_g')
    expect(deep.selectedKeys).toEqual(expect.arrayContaining([
      'nutrition.fiber_g', 'hydration.ml', 'bowel.count',
      'training.sessions', 'sleep.total_minutes', 'wellness.stress',
    ]))
    expect(deep.selectedKeys.length).toBeGreaterThan(normal.selectedKeys.length)
  })

  it('Deep Dive overrides narrow tab lens to a broad general evidence lens', async () => {
    load.mockReset().mockImplementation(async (args: { lens: 'general' | 'training' }) => ({
      ...inputFor(), lens: args.lens,
    }))
    const stub = makeProvider()
    const result = await answerAskHealth({ ...params, contextMode: 'deep', provider: stub, gate: fakeGate() })
    expect(load.mock.calls[0]![0]).toMatchObject({ lens: 'general', range: '30d' })
    expect(result.meta).toMatchObject({ contextMode: 'deep', answerScope: 'personal', lens: 'general' })
    expect(stub.mock.calls[0]![0].user).toContain('synthetic-owner-goal')
  })

  it('Smart keeps legacy automatic education routing without retrieving owner rows', async () => {
    load.mockReset()
    const result = await answerAskHealth({ ...params, contextMode: 'smart',
      provider: makeProvider(), gate: fakeGate(),
    })
    expect(load).not.toHaveBeenCalled()
    expect(result.meta).toMatchObject({ contextMode: 'smart', answerScope: 'general' })
  })

  it('When records are missing, personalized can still explain general mechanisms', async () => {
    load.mockReset().mockImplementation(async () => ({
      ...inputFor(), goals: [],
    }))
    const stub = makeProvider()
    const result = await answerAskHealth({ ...params, contextMode: 'personalized',
      provider: stub, gate: fakeGate(),
    })
    expect(stub).toHaveBeenCalledOnce()
    expect(result.meta).toMatchObject({ answerScope: 'personal', contextMode: 'personalized' })
    expect(result.answer.blocks[0]?.text).toContain('Creatine')
  })

  it('When a personal metric is missing, personalized still refuses to invent measurements', async () => {
    const question = 'What is my current height?'
    load.mockReset().mockImplementation(async () => ({ ...inputFor(question), goals: [] }))
    const stub = makeProvider()
    const result = await answerAskHealth({ ...params, question,
      contextMode: 'personalized', provider: stub, gate: fakeGate(),
    })
    expect(stub).not.toHaveBeenCalled()
    expect(result.answer.blocks[0]?.text).toContain('Not enough Health evidence')
  })

  it('An identical question with different modes has isolated cache keys and no free model bypass', async () => {
    const packet = buildAskHealthEvidencePacket({ ...inputFor(), lens: 'general' })
    const stub = makeProvider()
    const gate = fakeGate()
    const send = (mode: 'smart' | 'personalized' | 'deep') => explainAskHealth({
      packet, question: 'How is the goal?', conversation: [], contextMode: mode,
      provider: stub, gate, model: 'piq-stub', now: 1000,
    })
    expect((await send('smart')).meta.cached).toBe(false)
    expect((await send('personalized')).meta.cached).toBe(false)
    expect((await send('deep')).meta.cached).toBe(false)
    expect((await send('deep')).meta.cached).toBe(true)
    expect(stub).toHaveBeenCalledTimes(3)
    await expect(answerAskHealth({
      ...params, contextMode: 'general_only', provider: stub,
      gate: createAskHealthGate({ budgetUsd: 0 }),
    })).rejects.toMatchObject({ statusCode: 429, code: 'ASK_HEALTH_BUDGET_EXCEEDED' })
    expect(stub).toHaveBeenCalledTimes(3)
  })
})
