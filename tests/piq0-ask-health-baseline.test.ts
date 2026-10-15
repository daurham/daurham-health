import { describe, expect, it, vi } from 'vitest'
import { buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import { describeAskHealthResponsePath } from '../src/domain/ask-health/diagnostics.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

/**
 * PIQ-0 executable, synthetic-only baseline. No real owner records, no Gemini
 * requests and no production database access.
 *
 * Important: a "known gap" is an observed CURRENT failure, NOT a passing
 * product quality requirement. On fixing a gap, promote the scenario into a
 * desired-behavior regression test and update PIQ_PROGRESS.md.
 */
function packetInput(question: string, withGoal = false): AskHealthPacketInput {
  return {
    lens: 'general',
    range: '30d',
    asOf: '2026-10-14',
    generatedAt: '2026-10-14T18:00:00.000Z',
    period: { start: '2026-09-15', end: '2026-10-14' },
    question,
    overview: null,
    activity: null,
    sleep: null,
    goals: withGoal
      ? [{
          id: 'synthetic-goal-1',
          kind: 'body_metric',
          lifecycle: 'active',
          label: 'Weight',
          targetText: 'At most 80 kg',
          targetState: 'above_target',
          deadlineState: 'none',
          projectionState: 'insufficient_data',
          projectionReason: null,
        }]
      : [],
    experiments: [],
    benchmarks: [],
    supplements: [],
    context: null,
    patterns: [],
  }
}

function fakeProvider(answer: string) {
  return vi.fn(async () => ({
    text: JSON.stringify({
      blocks: [{ text: answer, evidence_refs: [] }],
      limitations: [],
      follow_ups: [],
    }),
    model: 'piq-stub',
    inputTokens: 14,
    outputTokens: 17,
  }))
}

describe('PIQ-0 Ask Health executable baseline — synthetic data only', () => {
  it('T01 KNOWN GAP: general physiology question with no owner evidence takes the wrong early-exit path', async () => {
    const question = 'What does creatine do?'
    const packet = buildAskHealthEvidencePacket(packetInput(question))
    const stub = fakeProvider('Creatine supports short-duration high-intensity performance.')
    const result = await explainAskHealth({
      packet, question, conversation: [], provider: stub, model: 'piq-stub',
      gate: createAskHealthGate(), now: 1_000,
    })

    // This is intentionally a failing PRODUCT scenario recorded as a green
    // BASELINE diagnosis. Future PIQ-3 must reverse this observed behavior.
    expect(stub).not.toHaveBeenCalled()
    expect(result.answer.blocks[0]?.text).toContain('Not enough Health evidence')
    expect(result.meta.diagnostic.path).toBe('packet_no_substantive_evidence')
    expect(result.meta.diagnostic.substantiveEvidenceCount).toBe(0)
  })

  it('personal-history request with no record is a separate question but currently shares the fallback', async () => {
    const question = 'What did I weigh yesterday?'
    const packet = buildAskHealthEvidencePacket(packetInput(question))
    const stub = fakeProvider('The exact measurement is not recorded.')
    const result = await explainAskHealth({
      packet, question, conversation: [], provider: stub, model: 'piq-stub',
      gate: createAskHealthGate(), now: 2_000,
    })
    expect(stub).not.toHaveBeenCalled()
    expect(result.meta.diagnostic.path).toBe('packet_no_substantive_evidence')
    // The diagnostic MUST NOT assert that the user's real database is empty.
    expect(result.meta.diagnostic).not.toHaveProperty('question')
  })

  it('a grounded synthetic goal invokes a fake model once, validates output and caches the next request', async () => {
    const question = 'What is my current weight goal?'
    const packet = buildAskHealthEvidencePacket(packetInput(question, true))
    expect(packet.evidence.some((item) => item.id === 'goals.synthetic-goal-1' && item.substantive)).toBe(true)
    const stub = vi.fn(async () => ({
      text: JSON.stringify({
        blocks: [{ text: 'Your saved goal is at most 80 kg.', evidence_refs: ['goals.synthetic-goal-1'] }],
        limitations: [],
        follow_ups: [],
      }),
      model: 'piq-stub',
      inputTokens: 15,
      outputTokens: 13,
    }))
    const gate = createAskHealthGate({ minIntervalMs: 0 })
    const args = {
      packet, question, conversation: [], provider: stub, model: 'piq-stub', gate,
    }
    const first = await explainAskHealth({ ...args, now: 5_000 })
    const second = await explainAskHealth({ ...args, now: 6_000 })

    expect(stub).toHaveBeenCalledTimes(1)
    expect(first.meta.diagnostic.path).toBe('model_answer')
    expect(second.meta.diagnostic.path).toBe('cache_hit')
    expect(first.answer.blocks[0]?.evidenceRefs).toEqual(['goals.synthetic-goal-1'])
    expect(first.evidence.map((item) => item.id)).toContain('goals.synthetic-goal-1')
    expect(first.meta.diagnostic.substantiveEvidenceCount).toBeGreaterThan(0)
    expect(first.meta.diagnostic).not.toHaveProperty('question')
    expect(first.meta.diagnostic).not.toHaveProperty('owner')
  })

  it('diagnostic is count-only and distinguishes clarification without exposing patient values', () => {
    const packet = buildAskHealthEvidencePacket(packetInput('How is my training?'))
    const clarified = { ...packet, clarification: 'Which of those exercises do you mean?' }
    expect(describeAskHealthResponsePath(clarified, { provider: 'health', cached: false }).path).toBe('clarification_required')
    const d = describeAskHealthResponsePath(packet, { provider: 'health', cached: false })
    expect(Object.keys(d).sort()).toEqual([
      'limitationCount', 'missingContextCount', 'packetDomainCount',
      'packetEvidenceCount', 'path', 'substantiveEvidenceCount',
    ].sort())
    expect(JSON.stringify(d)).not.toContain('What did I weigh yesterday?')
  })
})
