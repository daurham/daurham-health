import { describe, expect, it, vi } from 'vitest'
import {
  detectImmediateSafety,
  detectThirdPartyImmediateSafety,
  detectThirdPartyHypotheticalSafety,
} from '../src/domain/ask-health/immediate-safety.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { answerAskHealth, explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const load = vi.hoisted(() => vi.fn())
vi.mock('../server/ask-health/load.js', () => ({ loadAskHealthPacketInput: load }))

const date = '2026-10-15'
const model = () => vi.fn(async () => ({
  text: '{}', model: 'piq-stub', inputTokens: 1, outputTokens: 1,
}))
const args = (question: string, contextMode: 'smart' | 'personalized' | 'deep' | 'general_only') => ({
  question,
  contextMode,
  lens: 'general' as const, range: '30d' as const, asOf: date,
  generatedAt: date + 'T17:00:00.000Z',
  conversation: [{ role: 'user' as const, text: 'PRIVATE_PREVIOUS_CONVERSATION' }],
})
const packet = (question: string) => buildAskHealthEvidencePacket({
  lens: 'general', question, range: '30d', asOf: date, healthToday: date,
  generatedAt: date + 'T17:00:00.000Z',
  period: { start: '2026-09-16', end: date }, contextMode: 'deep',
  overview: null, activity: null, sleep: null,
  goals: [{
    id: 'PRIVATE_GOAL_ID', label: 'PRIVATE_GOAL_LABEL',
    kind: 'body_metric', lifecycle: 'active', targetText: 'At most 82 kg',
    targetState: 'above_target', deadlineState: 'none',
    projectionState: 'insufficient_data', projectionReason: null,
  }],
  experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
} satisfies AskHealthPacketInput)

describe('T48 third-party current-emergency safety without borrowing owner records', () => {
  it('detects narrowly described current third-party emergencies but not owner emergencies', () => {
    const emergencies = [
      'My wife is having chest pain right now',
      'My dad has sudden chest pain',
      "My son can't breathe",
      'My mother is having trouble breathing',
      'My daughter is bleeding heavily',
      'My husband is having a stroke',
      'My brother is vomiting blood',
      'Her chest hurts',
      'She is having chest pain',
    ]
    for (const question of emergencies) {
      expect(detectThirdPartyImmediateSafety(question), question).toBe('emergency')
      expect(detectImmediateSafety(question), question).toBeNull()
    }
    const harms = [
      'My friend is suicidal right now',
      'My sister wants to kill herself',
      'He is suicidal',
    ]
    for (const question of harms) {
      expect(detectThirdPartyImmediateSafety(question), question).toBe('self_harm')
      expect(detectImmediateSafety(question), question).toBeNull()
    }
  })

  it('excludes historical, hypothetical, negative, educational and quoted examples', () => {
    const cases = [
      'What does chest pain mean?',
      'My wife had chest pain last week',
      "My child couldn't breathe yesterday",
      'My wife is not having chest pain',
      'My mother has no chest pain',
      'If my son has chest pain, what should I do?',
      'If my wife is having chest pain, should I call someone?',
      "If my daughter can't breathe, what happens?",
      'When my dad has sudden chest pain, what should he do?',
      'Imagine my wife is having chest pain',
      'In this fictional scenario, my son cannot breathe',
      'My husband said "I have chest pain right now"',
      "My wife said 'I can't breathe'.",
      'What does “my wife is having chest pain” mean?',
      'My sister had a stroke last year',
      'My friend was suicidal last year',
      'My mom is taking medication for hypertension',
      'My wife is going to the gym later',
    ]
    for (const question of cases) {
      expect(detectThirdPartyImmediateSafety(question), question).toBeNull()
    }
  })

  it('produces deterministic third-party guidance before data fetch, Gemini and budget, in every context mode', async () => {
    for (const contextMode of ['smart', 'personalized', 'deep', 'general_only'] as const) {
      load.mockReset()
      const provider = model()
      const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 0 })
      const take = vi.spyOn(gate, 'take')
      const result = await answerAskHealth({
        ...args('My wife is having chest pain right now', contextMode),
        provider, gate, model: 'piq-stub',
      })
      expect(load).not.toHaveBeenCalled()
      expect(provider).not.toHaveBeenCalled()
      expect(take).not.toHaveBeenCalled()
      expect(result.meta.answerScope).toBe('urgent_safety')
      expect(result.meta.diagnostic.path).toBe('third_party_immediate_safety')
      expect(result.meta.contextMode).toBe(contextMode)
      expect(result.answer.blocks[0]?.text).toContain('call your local emergency number')
      expect(result.answer.blocks[0]?.text).toContain('other person')
      expect(result.answer.limitations[0]?.text).toContain('No saved Health records')
      expect(result.evidence).toEqual([])
      expect(result.meta.evidenceOverview.availableCount).toBe(0)
      expect(JSON.stringify(result)).not.toContain('PRIVATE_PREVIOUS_CONVERSATION')
    }
  })

  it('gives third-party self-harm guidance without diagnosing or accessing owner records', async () => {
    load.mockReset()
    const provider = model()
    const result = await answerAskHealth({
      ...args('My friend is suicidal right now', 'personalized'),
      provider, gate: createAskHealthGate({ budgetUsd: 0 }), model: 'piq-stub',
    })
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(result.meta.diagnostic.path).toBe('third_party_immediate_safety')
    expect(result.answer.blocks[0]?.text).toContain('emergency services')
    expect(result.answer.blocks[0]?.text).toContain('Stay with them if it is safe')
  })

  it('redacts preloaded owner evidence in a direct service call before responding to someone else\'s emergency', async () => {
    const prior = packet('What are my goals?')
    expect(prior.evidence.map(x => x.id)).toContain('goals.PRIVATE_GOAL_ID')
    const provider = model()
    const gate = createAskHealthGate({ budgetUsd: 0 })
    const take = vi.spyOn(gate, 'take')
    const result = await explainAskHealth({
      packet: prior, question: 'My mom is having a stroke', conversation: [
        { role: 'user', text: 'PRIVATE_PREVIOUS_CONVERSATION' },
      ], provider, gate, model: 'piq-stub', contextMode: 'deep',
    })
    expect(result.meta.diagnostic.path).toBe('third_party_immediate_safety')
    expect(result.evidence).toEqual([])
    expect(result.meta.context).toEqual({ knows: [], missing: [] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_GOAL_ID')
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PREVIOUS_CONVERSATION')
    expect(provider).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
  })

  it('current first-person emergencies still take precedence over family references', async () => {
    load.mockReset()
    const question = 'My wife is nearby and I have chest pain right now'
    expect(detectImmediateSafety(question)).toBe('emergency')
    const response = await answerAskHealth({
      ...args(question, 'personalized'),
      provider: model(), gate: createAskHealthGate({ budgetUsd: 0 }),
    })
    expect(response.meta.diagnostic.path).toBe('immediate_safety')
    expect(response.meta.answerScope).toBe('urgent_safety')
    expect(load).not.toHaveBeenCalled()
    expect(response.evidence).toEqual([])
  })
})


describe('T41 conditional third-party emergency education (does not assert live danger)', () => {
  it('detects direct first-clause hypothetical questions and excludes ungrounded cases', () => {
    const scenarios: Array<[string, 'emergency' | 'self_harm']> = [
      ['If my son has chest pain, what should I do?', 'emergency'],
      ["If my child can't breathe, what happens?", 'emergency'],
      ['When my wife is having trouble breathing should I call for help?', 'emergency'],
      ['What should I do if my dad has chest pain?', 'emergency'],
      ['How can I help if my sister is bleeding heavily?', 'emergency'],
      ['If my friend is suicidal, what should I do?', 'self_harm'],
      ['What should I do if my brother wants to hurt himself?', 'self_harm'],
    ]
    for (const [question, kind] of scenarios) {
      expect(detectThirdPartyHypotheticalSafety(question), question).toBe(kind)
      expect(detectThirdPartyImmediateSafety(question), question).toBeNull()
    }
    for (const question of [
      'What causes chest pain?',
      'If my son does not have chest pain, what then?',
      'My mom had chest pain yesterday',
      'My wife said "If my son has chest pain, what should I do?"',
      'Imagine if my wife is having chest pain',
      'If my wife is taking vitamin D, should I?',
      "If my wife can't make it to the gym, should I go?",
      'My wife is having chest pain now',
      'If my wife is exercising and my son has chest pain, what now?',
      'When my daughter had chest pain last year, we went to urgent care',
      "If my friend isn't suicidal, what should I do?",
    ]) {
      expect(detectThirdPartyHypotheticalSafety(question), question).toBeNull()
    }
  })

  it('answers a hypothetical emergency usefully with no owner data, cost or urgent alarm across all modes', async () => {
    for (const contextMode of ['smart', 'personalized', 'deep', 'general_only'] as const) {
      load.mockReset()
      const provider = model()
      const gate = createAskHealthGate({ budgetUsd: 0 })
      const take = vi.spyOn(gate, 'take')
      const response = await answerAskHealth({
        ...args('If my son has chest pain, what should I do?', contextMode),
        provider, gate, model: 'piq-stub',
      })
      expect(load).not.toHaveBeenCalled()
      expect(provider).not.toHaveBeenCalled()
      expect(take).not.toHaveBeenCalled()
      expect(response.meta).toMatchObject({
        answerScope: 'general', contextMode, provider: 'health',
        model: 'deterministic', cached: false,
        promptVersion: 'ask-health-conditional-safety-v1',
        diagnostic: { path: 'third_party_hypothetical_safety', substantiveEvidenceCount: 0 },
      })
      expect(response.evidence).toEqual([])
      expect(response.meta.evidenceOverview.items).toEqual([])
      expect(response.answer.blocks[0]?.text).toContain('If someone develops')
      expect(response.answer.blocks[0]?.text).toContain('not a claim that it is happening now')
      expect(JSON.stringify(response)).not.toContain('PRIVATE_PREVIOUS_CONVERSATION')
    }
  })

  it('provides hypothetical suicide crisis education without guessing a personal diagnosis', async () => {
    load.mockReset()
    const provider = model()
    const response = await answerAskHealth({
      ...args('If my friend is suicidal, what should I do?', 'deep'),
      provider, gate: createAskHealthGate({ budgetUsd: 0 }), model: 'piq-stub',
    })
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(response.meta.answerScope).toBe('general')
    expect(response.meta.diagnostic.path).toBe('third_party_hypothetical_safety')
    expect(response.answer.blocks[0]?.text).toContain('a crisis service')
    expect(response.answer.limitations[0]?.text).toContain('not a diagnosis')
  })

  it('scrubs an accidentally preloaded private packet from direct conditional guidance', async () => {
    const prior = packet('What are my goals?')
    expect(prior.evidence.map(x => x.id)).toContain('goals.PRIVATE_GOAL_ID')
    const provider = model()
    const gate = createAskHealthGate({ budgetUsd: 0 })
    const take = vi.spyOn(gate, 'take')
    const result = await explainAskHealth({
      packet: prior, question: "If my daughter can't breathe, what should I do?",
      contextMode: 'personalized',
      conversation: [{ role: 'user', text: 'PRIVATE_PREVIOUS_CONVERSATION' }],
      provider, gate, model: 'piq-stub',
    })
    expect(result.meta.diagnostic.path).toBe('third_party_hypothetical_safety')
    expect(result.evidence).toEqual([])
    expect(result.meta.context).toEqual({ knows: [], missing: [] })
    expect(JSON.stringify(result)).not.toContain('PRIVATE_GOAL_ID')
    expect(JSON.stringify(result)).not.toContain('PRIVATE_PREVIOUS_CONVERSATION')
    expect(provider).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
  })

  it('does not let conditional questions suppress actual first-person emergencies', async () => {
    load.mockReset()
    const question = 'If my wife has chest pain later, what should I do? I have chest pain right now'
    const response = await answerAskHealth({
      ...args(question, 'personalized'),
      provider: model(), gate: createAskHealthGate({ budgetUsd: 0 }),
    })
    expect(response.meta.answerScope).toBe('urgent_safety')
    expect(response.meta.diagnostic.path).toBe('immediate_safety')
    expect(load).not.toHaveBeenCalled()
  })
})
