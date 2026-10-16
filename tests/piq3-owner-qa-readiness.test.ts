import { describe, expect, it, vi } from 'vitest'
import { answerAskHealth, explainAskHealth, type AskHealthProvider } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import { buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import type { AskContextMode } from '../src/domain/ask-health/config.js'

/** Offline PIQ-3 owner QA rehearsal. The artificial 'owner' is a fixture.
 * No production service, live provider, owner files or database connection.
 */
const load = vi.hoisted(() => vi.fn())
vi.mock('../server/ask-health/load.js', () => ({ loadAskHealthPacketInput: load }))

const date = '2026-10-15'
const privateMarker = 'SYNTHETIC_QA_PRIVATE_CONTEXT_NEVER_IN_GENERAL'
const question = 'What does creatine do?'
const request = {
  question, lens: 'nutrition' as const, range: '30d' as const,
  asOf: date, conversation: [{ role: 'user' as const, text: privateMarker }],
  generatedAt: date + 'T17:00:00.000Z', model: 'qa-stub',
}
function syntheticInput(lens: AskHealthPacketInput['lens'] = 'general'): AskHealthPacketInput {
  return {
    question, lens, contextMode: 'personalized', range: '30d', asOf: date,
    generatedAt: request.generatedAt, period: { start: '2026-09-16', end: date },
    overview: null, activity: null, sleep: null, context: null, patterns: [],
    goals: [{ id: 'qa-weight-target', kind: 'body_metric', lifecycle: 'active',
      label: 'Synthetic weight target', targetText: 'At most 78 kg',
      targetState: 'above_target', deadlineState: 'none',
      projectionState: 'insufficient_data', projectionReason: null }],
    stableProfile: null, supplements: [], experiments: [], benchmarks: [],
    profile: {
      sexForPhysiology: null, persistentHealthContext: privateMarker,
      trainingLimitations: null, dietaryContext: null,
      conditions: [], allergies: [], medications: [],
    },
  }
}
const defaultReply = (req: Parameters<AskHealthProvider>[0]) => ({
  text: JSON.stringify({ blocks: [{ text: 'Creatine supports rapid ATP regeneration during intense exercise.',
    evidence_refs: [] }], limitations: [], follow_ups: [] }),
  model: req.model, inputTokens: 25, outputTokens: 35,
})
const stub = () => vi.fn(async (req: Parameters<AskHealthProvider>[0]) => defaultReply(req))
const gate = () => createAskHealthGate({ minIntervalMs: 0, budgetUsd: 100 })

describe('PIQ-3 controlled owner QA readiness (synthetic only)', () => {
  it('shows exactly what the four modes load and what the AI actually receives', async () => {
    load.mockReset().mockImplementation(async (req: { lens: AskHealthPacketInput['lens'] }) =>
      syntheticInput(req.lens))
    const cases: Array<{ mode: AskContextMode; load: boolean; ownerPayload: boolean }> = [
      { mode: 'general_only', load: false, ownerPayload: false },
      { mode: 'smart', load: false, ownerPayload: false },
      { mode: 'personalized', load: true, ownerPayload: true },
      { mode: 'deep', load: true, ownerPayload: true },
    ]
    for (const c of cases) {
      const provider = stub()
      const before = load.mock.calls.length
      const res = await answerAskHealth({ ...request, contextMode: c.mode, provider, gate: gate(), now: 1000 })
      expect(load.mock.calls.length - before).toBe(c.load ? 1 : 0)
      expect(provider).toHaveBeenCalledOnce()
      const sent = provider.mock.calls[0]![0]
      expect(sent.user.includes('qa-weight-target')).toBe(c.ownerPayload)
      expect(sent.user.includes(privateMarker)).toBe(c.ownerPayload)
      expect(sent.user.includes('CONVERSATION CONTEXT')).toBe(c.ownerPayload)
      expect(sent.evidenceIds.some(id => id.includes('qa-weight-target'))).toBe(c.ownerPayload)
      expect(res.meta.answerScope).toBe(c.ownerPayload ? 'personal' : 'general')
      expect(res.meta.contextMode).toBe(c.mode)
      expect(res.meta.evidenceOverview.availableCount > 0).toBe(c.ownerPayload)
      expect(res.meta.evidenceOverview.domains.includes('goals')).toBe(c.ownerPayload)
      expect(res.meta.diagnostic.path).toBe(c.ownerPayload ? 'model_answer' : 'general_model_answer')
      if (!c.ownerPayload) {
        expect(res.evidence).toEqual([])
        expect(res.meta.evidenceOverview.items).toEqual([])
        expect(JSON.stringify(res)).not.toContain(privateMarker)
      }
    }
    // Deep deliberately widens a narrow UI lens only when explicitly selected.
    expect(load.mock.calls.map(c => c[0].lens)).toEqual(['general', 'general'])
  })

  it('does not leak private records or use the AI budget for general-only personal-history and urgent-safety requests', async () => {
    load.mockReset()
    const provider = stub()
    const noBudget = createAskHealthGate({ budgetUsd: 0 })
    const personal = await answerAskHealth({ ...request, question: 'What was my weight yesterday?',
      contextMode: 'general_only', provider, gate: noBudget, now: 1000 })
    expect(personal.answer.blocks[0]?.text).toContain('cannot check your personal')
    expect(personal.meta).toMatchObject({ answerScope: 'general', provider: 'health', cached: false })
    const emergency = await answerAskHealth({ ...request, question: 'I have chest pain right now',
      contextMode: 'personalized', provider, gate: noBudget, now: 2000 })
    expect(emergency.meta).toMatchObject({ answerScope: 'urgent_safety', provider: 'health' })
    expect(load).not.toHaveBeenCalled()
    expect(provider).not.toHaveBeenCalled()
    expect(emergency.evidence).toEqual([])
    expect(JSON.stringify(emergency)).not.toContain(privateMarker)
  })

  it('keeps separate mode cache keys, reuses each identical result, and never promotes a general answer to owner evidence', async () => {
    load.mockReset().mockImplementation(async (req: { lens: AskHealthPacketInput['lens'] }) =>
      syntheticInput(req.lens))
    const provider = stub()
    const sharedGate = gate()
    for (const mode of ['smart', 'general_only', 'personalized', 'deep'] as const) {
      const args = { ...request, contextMode: mode, provider, gate: sharedGate }
      const first = await answerAskHealth({ ...args, now: 1_000 + provider.mock.calls.length * 3_000 })
      const again = await answerAskHealth({ ...args, now: 2_000 + provider.mock.calls.length * 3_000 })
      expect(first.meta.cached).toBe(false)
      expect(again.meta.cached).toBe(true)
      expect(again.meta.contextMode).toBe(mode)
      expect(again.meta.answerScope).toBe(first.meta.answerScope)
      expect(again.answer).toEqual(first.answer)
      if (first.meta.answerScope === 'general') expect(again.meta.evidenceOverview.availableCount).toBe(0)
    }
    expect(provider).toHaveBeenCalledTimes(4)
    expect(load).toHaveBeenCalledTimes(4)
  })

  it('limits displayed provenance to supplied evidence and cited evidence to surviving claims', async () => {
    const base = buildAskHealthEvidencePacket(syntheticInput())
    const sourceId = 'hydration.synthetic.2026-09-20'
    const packet = { ...base, evidence: [...base.evidence, {
      id: sourceId, domain: 'hydration', label: 'Synthetic water event', value: 500,
      unit: 'ml', text: 'Recorded one water event, not proof of total daily intake.',
      period: { start: '2026-09-20', end: '2026-09-20' }, coverage: null,
      evidenceDates: ['2026-09-20'], detailPath: '/check-in',
      userEntered: false, substantive: true,
    }] }
    const provider = vi.fn(async (req: Parameters<AskHealthProvider>[0]) => ({
      ...defaultReply(req),
      text: JSON.stringify({ blocks: [
        { text: 'You logged 500 ml of water on 2026-09-20.',
          evidence_refs: [sourceId] },
        { text: 'You logged 10,000 steps on 2026-09-20.',
          evidence_refs: [sourceId] },
      ], limitations: [], follow_ups: [] }),
    }))
    // Both source IDs are valid; the second block cites the wrong metric.
    const res = await explainAskHealth({
      packet, question: 'How much water and how many steps did I log on 2026-09-20?',
      conversation: [], provider, gate: gate(), model: 'qa-stub', now: 1000,
      contextMode: 'personalized',
    })
    expect(res.answer.blocks.map(b => b.text)).toEqual(['You logged 500 ml of water on 2026-09-20.'])
    expect(res.answer.limitations.length).toBeGreaterThan(0)
    expect(res.meta.evidenceOverview.items.map(x => x.id)).toContain('goals.qa-weight-target')
    expect(res.meta.evidenceOverview.items.map(x => x.id)).toContain(sourceId)
    expect(res.meta.evidenceOverview.items.every(x => packet.evidence.some(e => e.id === x.id))).toBe(true)
    expect(res.evidence.map(e => e.id)).toEqual([sourceId])
    expect(provider).toHaveBeenCalledOnce()
  })

  it('rejects fresh budgeted provider calls at a zero cap and does not silently fall back to a fabricated answer', async () => {
    load.mockReset().mockImplementation(async () => syntheticInput())
    const provider = stub()
    await expect(answerAskHealth({
      ...request, contextMode: 'personalized', provider,
      gate: createAskHealthGate({ budgetUsd: 0 }), now: 1000,
    })).rejects.toMatchObject({ statusCode: 429, code: 'ASK_HEALTH_BUDGET_EXCEEDED' })
    expect(provider).not.toHaveBeenCalled()
  })
})
