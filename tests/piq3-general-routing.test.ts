import { describe, expect, it, vi } from 'vitest'
import {
  routeAskHealthIntent,
  buildAskHealthEvidencePacket, type AskHealthPacketInput,
} from '../src/domain/ask-health/index.js'
import { blankGeneralAskPacket, generalAnswerInventsPersonalRecord, sanitizeCachedGeneralAnswer } from '../src/domain/ask-health/general.js'
import { answerAskHealth, explainAskHealth, type AskHealthProvider } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

const loader = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../server/ask-health/load.js', () => ({
  loadAskHealthPacketInput: loader.load,
}))
const today = '2026-10-15'
const general = (question: string, conversation: Array<{role:'user'|'assistant';text:string}> = []) =>
  routeAskHealthIntent(question, conversation)
const answer = (text: string, evidence_refs: string[] = []) => JSON.stringify({
  blocks: [{ text, evidence_refs }], limitations: [], follow_ups: [],
})
const provider = (text: string) => vi.fn(async (input: Parameters<AskHealthProvider>[0]) => ({
  text: answer(text),
  model: input.model, inputTokens: 20, outputTokens: 20,
}))
const request = (question: string) => ({
  question, lens: 'general' as const, range: '30d' as const,
  asOf: today, conversation: [], model: 'piq-stub',
  generatedAt: '2026-10-15T19:00:00.000Z',
})

function personalPacket(question: string) {
  const input: AskHealthPacketInput = {
    ...request(question),
    healthToday:today,
    period: { start: '2026-09-16', end: today },
    overview: null, activity: null, sleep: null, context: null, patterns: [],
    goals: [{
      id: 'synthetic-goal',
      kind: 'body_metric', lifecycle: 'active', label: 'Weight',
      targetText: 'At most 80 kg', targetState: 'above_target',
      deadlineState: 'none', projectionState: 'insufficient_data',
      projectionReason: null,
    }],
    experiments: [], benchmarks: [], supplements: [],
  }
  return buildAskHealthEvidencePacket(input)
}

describe('PIQ-3.1 conservative intent classification', () => {
  it('routes only standalone educational questions into nonpersonal education', () => {
    for (const q of [
      'What does creatine do?',
      'How does creatine work?',
      'What is progressive overload?',
      'Why does muscle soreness occur?',
      'Does creatine cause water retention?',
      'What causes muscle cramps?',
      'What are the risks of dehydration?',
    ]) {
      expect(general(q)).toMatchObject({ route: 'general', intent: 'general_explanation' })
    }
  })
  it('keeps owner records, symptoms, history, training decisions and comparisons out of general lane', () => {
    for (const q of [
      'Has creatine improved my bench press?',
      'What did I weigh yesterday?',
      'Why do I get headaches?',
      'Is creatine safe for me?',
      'Should I change my calories?',
      'I have chest pain right now',
      'How do I squat without pain?',
      'How has my protein intake changed in three months?',
      'Compare my sleep and workout days',
      'What happened in the last three months?',
      'What do studies say about creatine?',
      'What about that?',
    ]) {
      expect(general(q).route).toBe('owner')
    }
    expect(general('I have chest pain right now').intent).toBe('urgent_safety')
    expect(general('How is the goal?').route).toBe('owner')
    expect(general('What is the training plan?').route).toBe('owner')
    expect(general('Why do I get headaches?').intent).toBe('symptom_context')
    expect(general('Has creatine improved my bench press?').intent).toBe('personal_trend')
  })
  it('does not promote an ambiguous conversation follow-up to general or import prior context', () => {
    expect(general('And the dosage?', [{ role: 'user', text: 'What about my medications?' }]).route).toBe('owner')
    expect(general('What is a muscle?', [{ role: 'user', text: 'My health is great' }]).route).toBe('general')
  })
})

describe('PIQ-3.2 educational routing and safety', () => {
  it('does not query owner data before answering an authenticated general question', async () => {
    loader.load.mockReset()
    const stub = provider('Creatine supports high-intensity repeat efforts by helping replenish ATP.')
    const response = await answerAskHealth({
      ...request('What does creatine do?'),
      provider: stub, gate: createAskHealthGate({ minIntervalMs: 0 }),
    })
    expect(loader.load).not.toHaveBeenCalled()
    expect(response.answer.blocks[0]?.text).toContain('Creatine')
    expect(response.answer.blocks[0]?.evidenceRefs).toEqual([])
    expect(response.meta).toMatchObject({
      answerScope: 'general', cached: false,
      promptVersion: 'ask-health-general-v2',
      diagnostic: { path: 'general_model_answer', substantiveEvidenceCount: 0 },
      context: { knows: [], missing: [] },
    })
    expect(response.evidence).toEqual([])
    const payload = stub.mock.calls[0]
    expect(payload).toBeDefined()
    expect(payload![0]).toMatchObject({ evidenceIds: [], model: 'piq-stub' })
    expect(payload![0].user).not.toMatch(/health_profile|clinical_conditions|owner records|CONVERSATION CONTEXT/)
    expect(payload![0].system).toContain('No owner health records have been retrieved')
  })
  it('scrubs even an accidentally supplied owner packet and prior conversation', async () => {
    const stub = provider('Creatine is involved in rapid ATP regeneration.')
    const personal = personalPacket('How is my weight?')
    expect(personal.evidence.some((e) => e.substantive)).toBe(true)
    const result = await explainAskHealth({
      packet: personal, question: 'How does creatine work?',
      conversation: [{ role: 'user', text: 'I have a private profile note' }],
      provider: stub, gate: createAskHealthGate({ minIntervalMs: 0 }),
      model: 'piq-stub', now: 1_000,
    })
    expect(result.evidence).toEqual([])
    expect(result.meta.diagnostic.packetEvidenceCount).toBe(0)
    expect(stub.mock.calls[0]![0].user).not.toContain('private profile')
    expect(stub.mock.calls[0]![0].user).not.toContain('synthetic-goal')
  })
  it('does not bypass budget or spend again on identical cached general questions', async () => {
    const stub = provider('Creatine supports short bouts of intense activity.')
    const gate = createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })
    const args = { ...request('What does creatine do?'), provider: stub, gate }
    const first = await answerAskHealth({ ...args, now: 1_000 })
    const cached = await answerAskHealth({ ...args, now: 2_000 })
    expect(first.meta.cached).toBe(false)
    expect(cached.meta).toMatchObject({
      cached: true, answerScope: 'general',
      diagnostic: { path: 'general_cache_hit' },
    })
    expect(stub).toHaveBeenCalledTimes(1)
    await expect(answerAskHealth({
      ...request('How does creatine work?'), provider: stub,
      gate: createAskHealthGate({ budgetUsd: 0 }),
    })).rejects.toMatchObject({ statusCode: 429, code: 'ASK_HEALTH_BUDGET_EXCEEDED' })
    expect(stub).toHaveBeenCalledTimes(1)
  })
  it('rejects hallucinated owner-log claims, retries once and avoids caching them', async () => {
    const stub = vi.fn()
      .mockResolvedValueOnce({
        text: answer('Based on your logs, you take creatine daily.'),
        model: 'piq-stub', inputTokens: 15, outputTokens: 15,
      })
      .mockResolvedValueOnce({
        text: answer('Creatine is used to regenerate ATP during high-intensity exercise.'),
        model: 'piq-stub', inputTokens: 15, outputTokens: 15,
      })
    const result = await answerAskHealth({
      ...request('What does creatine do?'),
      provider: stub, gate: createAskHealthGate({ minIntervalMs: 0 }),
    })
    expect(stub).toHaveBeenCalledTimes(2)
    expect(result.answer.blocks[0]?.text).not.toContain('your logs')
    expect(result.meta.answerScope).toBe('general')
    expect(generalAnswerInventsPersonalRecord({
      blocks: [{ text: 'Your recorded weight improved', evidenceRefs: [] }],
      limitations: [], followUps: [],
    })).toBe(true)
  })
  it('rejects a second invented personal-record claim instead of presenting it', async () => {
    const stub = vi.fn(async () => ({
      text: answer('According to your records, you take this supplement.'),
      model: 'piq-stub', inputTokens: 15, outputTokens: 15,
    }))
    await expect(answerAskHealth({
      ...request('What does creatine do?'),
      provider: stub, gate: createAskHealthGate({ minIntervalMs: 0 }),
    })).rejects.toMatchObject({ statusCode: 502, code: 'ASK_HEALTH_INVALID_RESPONSE' })
    expect(stub).toHaveBeenCalledTimes(2)
  })

  it('withholds invented uncited owner numbers from general-only educational answers', async () => {
    const personalStatements = [
      'Your weight is 90 kg.',
      'Your steps averaged 6,000 steps.',
      'You logged 1800 kcal.',
    ]
    for (const text of personalStatements) {
      expect(generalAnswerInventsPersonalRecord({
        blocks: [{ text, evidenceRefs: [] }], limitations: [], followUps: [],
      })).toBe(true)
    }
    const stub = vi.fn(async () => ({
      text: answer('Your weight is 90 kg.'),
      model: 'piq-stub', inputTokens: 8, outputTokens: 6,
    }))
    await expect(answerAskHealth({
      ...request('What does creatine do?'),
      contextMode: 'general_only', provider: stub,
      gate: createAskHealthGate({ minIntervalMs: 0 }),
    })).rejects.toMatchObject({ statusCode: 502, code: 'ASK_HEALTH_INVALID_RESPONSE' })
    expect(stub).toHaveBeenCalledTimes(2)
  })

  it('strips legacy personal evidence refs from cached education without spending or losing follow-ups', async () => {
    const legacy = {
      blocks: [{ text: 'Creatine helps regenerate ATP.', evidenceRefs: ['profile.sensitive', 'body.weight'] }],
      limitations: [{ text: 'Effects vary between individuals.', evidenceRefs: ['supplements.schedule'] }],
      followUps: ['What is progressive overload?'],
    }
    // No textual owner claim: the prior sanitizer returned this cache unmodified.
    expect(generalAnswerInventsPersonalRecord(legacy)).toBe(false)
    const sanitized = sanitizeCachedGeneralAnswer(legacy)
    expect(sanitized.blocks).toEqual([
      { text: 'Creatine helps regenerate ATP.', evidenceRefs: [] },
    ])
    expect(sanitized.limitations).toEqual([
      { text: 'Effects vary between individuals.', evidenceRefs: [] },
    ])
    expect(sanitized.followUps).toEqual(['What is progressive overload?'])
    expect(legacy.blocks[0]?.evidenceRefs).toEqual(['profile.sensitive', 'body.weight'])

    const gate = createAskHealthGate({ minIntervalMs: 0 })
    gate.take = async () => ({
      ok: true, usageId: null, cached: { answer: legacy, evidence: [] },
    })
    const noProvider = vi.fn()
    const result = await answerAskHealth({
      ...request('What does creatine do?'), contextMode: 'general_only',
      provider: noProvider, gate,
    })
    expect(result.meta).toMatchObject({ cached: true, answerScope: 'general' })
    expect(result.evidence).toEqual([])
    expect(result.answer).toEqual(sanitized)
    expect(JSON.stringify(result.answer)).not.toContain('profile.sensitive')
    expect(noProvider).not.toHaveBeenCalled()
  })

  it('redacts poisoned cached General Only claims but keeps general education at zero provider cost', async () => {
    const poisoned = {
      blocks: [
        { text: 'Your weight is 90 kg.', evidenceRefs: [] },
        { text: 'Creatine helps regenerate ATP during intense effort.', evidenceRefs: [] },
      ],
      limitations: [{ text: 'Based on your logs, your strength increased.', evidenceRefs: [] }],
      followUps: [],
    }
    const safe = sanitizeCachedGeneralAnswer(poisoned)
    expect(safe.blocks.map(x => x.text)).toEqual([
      'Creatine helps regenerate ATP during intense effort.',
    ])
    expect(safe.limitations.some(x => x.text.includes('withheld'))).toBe(true)
    expect(JSON.stringify(safe)).not.toContain('90 kg')
    expect(JSON.stringify(safe)).not.toContain('your strength increased')
    const gate = createAskHealthGate({ minIntervalMs: 0 })
    const realTake = gate.take
    gate.take = async (key, now, model) => {
      void key; void now; void model
      return { ok: true, usageId: null, cached: { answer: poisoned, evidence: [] } }
    }
    const noProvider = vi.fn(async () => ({ text: answer('Safe educational response.'), model: 'piq-stub', inputTokens: 0, outputTokens: 0 }))
    const result = await answerAskHealth({
      ...request('What does creatine do?'), contextMode: 'general_only',
      provider: noProvider, gate,
    })
    expect(result.meta).toMatchObject({ cached: true, answerScope: 'general' })
    expect(result.evidence).toEqual([])
    expect(result.answer.blocks.map(x => x.text)).toEqual(safe.blocks.map(x => x.text))
    expect(noProvider).not.toHaveBeenCalled()
    gate.take = realTake
    const allBad = sanitizeCachedGeneralAnswer({
      blocks: [{ text: 'You logged 8000 steps.', evidenceRefs: [] }],
      limitations: [], followUps: [],
    })
    expect(allBad.blocks[0]?.text).toContain('cannot verify')
  })

  it('rejects direct qualitative owner claims but retains conditional general education', () => {
    const personal = [
      'Your fiber intake is low.',
      'Your sleep has worsened.',
      'Your weight is stable.',
      'Your training performance improved.',
      'You are dehydrated.',
    ]
    for (const text of personal) {
      expect(generalAnswerInventsPersonalRecord({
        blocks: [{ text, evidenceRefs: [] }], limitations: [], followUps: [],
      }), text).toBe(true)
    }
    for (const text of [
      'If your fiber intake is low, add foods gradually.',
      'Your muscles use ATP during exercise.',
      'Your training performance can improve with progressive overload.',
      'If you are dehydrated, seek suitable rehydration advice.',
    ]) {
      expect(generalAnswerInventsPersonalRecord({
        blocks: [{ text, evidenceRefs: [] }], limitations: [], followUps: [],
      }), text).toBe(false)
    }
  })

  it('screens personal-record hallucinations in follow-up suggestions on fresh and cached General Only', async () => {
    const generalBlock = { text: 'Creatine supports short bursts of intense effort.', evidenceRefs: [] }
    const poisoned = {
      blocks: [generalBlock],
      limitations: [],
      followUps: ['Your weight is 90 kg. Should you take more creatine?'],
    }
    expect(generalAnswerInventsPersonalRecord(poisoned)).toBe(true)
    const filtered = sanitizeCachedGeneralAnswer(poisoned)
    expect(filtered.blocks).toEqual([generalBlock])
    expect(filtered.followUps).toEqual([])
    expect(JSON.stringify(filtered)).not.toContain('90 kg')

    const gate = createAskHealthGate({ minIntervalMs: 0 })
    gate.take = async () => ({
      ok: true, usageId: null, cached: { answer: poisoned, evidence: [] },
    })
    const noProvider = vi.fn()
    const fromCache = await answerAskHealth({
      ...request('What does creatine do?'), contextMode: 'general_only',
      gate, provider: noProvider,
    })
    expect(fromCache.meta.cached).toBe(true)
    expect(fromCache.answer.followUps).toEqual([])
    expect(fromCache.answer.blocks).toEqual([generalBlock])
    expect(noProvider).not.toHaveBeenCalled()

    const stub = vi.fn()
      .mockResolvedValueOnce({
        text: JSON.stringify({
          blocks: [{ text: generalBlock.text, evidence_refs: [] }],
          limitations: [], follow_ups: ['Your fiber intake is low. Should you supplement?'],
        }),
        model: 'piq-stub', inputTokens: 12, outputTokens: 12,
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          blocks: [{ text: generalBlock.text, evidence_refs: [] }],
          limitations: [], follow_ups: ['What are common creatine side effects?'],
        }),
        model: 'piq-stub', inputTokens: 12, outputTokens: 12,
      })
    const live = await answerAskHealth({
      ...request('What does creatine do?'), contextMode: 'general_only',
      gate: createAskHealthGate({ minIntervalMs: 0 }), provider: stub,
    })
    expect(stub).toHaveBeenCalledTimes(2)
    expect(live.answer.followUps).toEqual(['What are common creatine side effects?'])
    expect(live.answer.blocks).toEqual([generalBlock])
  })

  it('preserves owner missing-evidence fallback; never makes up height or weights', async () => {
    const stub = provider('Your height is 180 cm.')
    const empty = blankGeneralAskPacket({
      lens: 'general', range: '30d', asOf: today,
      generatedAt: '2026-10-15T19:00:00.000Z',
    })
    const result = await explainAskHealth({
      packet: empty, question: 'What is my current height?',
      conversation: [], provider: stub,
      gate: createAskHealthGate(), model: 'piq-stub', now: 1_000,
    })
    expect(stub).not.toHaveBeenCalled()
    expect(result.meta.answerScope).toBe('personal')
    expect(result.answer.blocks[0]?.text).toContain('Not enough Health evidence')
  })
})
