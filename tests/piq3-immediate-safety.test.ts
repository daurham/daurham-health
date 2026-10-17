import { describe, expect, it, vi } from 'vitest'
import { buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import { detectImmediateSafety } from '../src/domain/ask-health/immediate-safety.js'
import { answerAskHealth, explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const load = vi.hoisted(() => vi.fn())
vi.mock('../server/ask-health/load.js', () => ({ loadAskHealthPacketInput: load }))

const date = '2026-10-15'
function packet(question: string) {
  const input: AskHealthPacketInput = {
    question, lens: 'general', range: '30d', asOf: date,
    generatedAt: '2026-10-15T17:00:00.000Z',
    period: { start: '2026-09-16', end: date },
    overview: null, activity: null, sleep: null, goals: [], experiments: [],
    benchmarks: [], supplements: [], context: null, patterns: [],
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ-3.2 explicit immediate safety floor', () => {
  it('recognizes a narrow set of explicit first-person present-tense emergencies', () => {
    const cases: Array<[string, 'emergency' | 'self_harm']> = [
      ['I have chest pain right now', 'emergency'],
      ["I can't breathe", 'emergency'],
      ["I can’t breathe", 'emergency'],
      ['I am having trouble breathing', 'emergency'],
      ['My chest hurts', 'emergency'],
      ['I am bleeding heavily', 'emergency'],
      ['I am having a stroke', 'emergency'],
      ['I have black tarry stools', 'emergency'],
      ['I have black and tarry stool now', 'emergency'],
      ['My stool is black and tarry', 'emergency'],
      ['My stools are tarry', 'emergency'],
      ['My poop is black and tarry', 'emergency'],
      ['I want to kill myself', 'self_harm'],
      ["I'm suicidal", 'self_harm'],
    ]
    for (const [q, type] of cases) expect(detectImmediateSafety(q)).toBe(type)
  })

  it('does not treat educational, hypothetical, negated or historical sentences as a confirmed current emergency', () => {
    for (const q of [
      'What does chest pain mean?',
      'What causes trouble breathing?',
      'I do not have chest pain',
      'I am not having chest pain',
      'I have no chest pain',
      'I had chest pain last year',
      'Should I call a doctor if I get chest pain?',
      "I'm not suicidal",
      'I used to want to kill myself',
      'What if my stool is black and tarry?',
      'I do not have black tarry stools',
      'My stool is not black and tarry',
      'My stool was black and tarry last month',
      'Why is black tarry stool concerning?',
      'I had black tarry stools in 2020',
      'If I have black tarry stools what should I do?',
    ]) {
      expect(detectImmediateSafety(q)).toBeNull()
    }
  })

  it('[T41] excludes quoted third-party/historical/hypothetical speech from current-owner emergency detection', () => {
    const quoted = [
      'My wife said "I have chest pain right now".',
      "My wife said 'I have chest pain right now'.",
      "My wife said 'I can't breathe'.",
      'My wife said “I can’t breathe”.',
      "A friend told me 'I'm suicidal'.",
      "The person said 'I am bleeding heavily'.",
      'I said "I have severe abdominal pain" last year.',
      'What does "I have chest pain" mean?',
    ]
    for (const message of quoted) {
      expect(detectImmediateSafety(message), message).toBeNull()
    }
    // A real owner statement outside a quotation still wins.
    expect(detectImmediateSafety(
      "My wife said 'I'm having a stroke' but I am having chest pain.",
    )).toBe('emergency')
    expect(detectImmediateSafety("I'm having chest pain right now.")).toBe('emergency')
    expect(detectImmediateSafety("I can't breathe.")).toBe('emergency')
  })

  it('answers explicit emergencies without reading owner records or calling AI or charging its gate', async () => {
    load.mockClear()
    const provider = vi.fn()
    const gate = createAskHealthGate({ budgetUsd: 0 })
    const response = await answerAskHealth({
      question: 'I have chest pain right now', lens: 'general',
      range: '30d', asOf: date, conversation: [],
      provider, gate, model: 'piq-stub', now: 1_000,
    })
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(response.meta).toMatchObject({
      answerScope: 'urgent_safety', model: 'deterministic',
      provider: 'health', cached: false,
      promptVersion: 'ask-health-immediate-safety-v1',
      diagnostic: { path: 'immediate_safety', packetEvidenceCount: 0 },
    })
    expect(response.evidence).toEqual([])
    expect(response.answer.blocks[0]?.text).toContain('local emergency number')
    expect(response.answer.blocks[0]?.evidenceRefs).toEqual([])
  })

  it('sanitizes a direct call with preloaded Health evidence on emergency advice', async () => {
    const provider = vi.fn()
    const input = packet('How is my goal?')
    const response = await explainAskHealth({
      packet: input, question: "I can't breathe", conversation: [
        { role: 'user', text: 'My private medical details here' },
      ], provider, gate: createAskHealthGate({ budgetUsd: 0 }),
      model: 'piq-stub', now: 1_000,
    })
    expect(response.meta.answerScope).toBe('urgent_safety')
    expect(response.meta.context).toEqual({ knows: [], missing: [] })
    expect(response.evidence).toEqual([])
    expect(provider).not.toHaveBeenCalled()
    expect(JSON.stringify(response)).not.toContain('private medical')
  })

  it('provides crisis support for active self-harm statements without inventing patient history', async () => {
    const response = await explainAskHealth({
      packet: packet('I want to kill myself'), question: 'I want to kill myself',
      conversation: [], provider: vi.fn(), gate: createAskHealthGate({ budgetUsd: 0 }),
      model: 'piq-stub', now: 1_000,
    })
    expect(response.meta.diagnostic.path).toBe('immediate_safety')
    expect(response.answer.blocks[0]?.text).toContain('trusted person')
    expect(response.answer.limitations[0]?.text).toContain('not on a diagnosis')
  })
})
