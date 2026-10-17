import { describe, expect, it, vi } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  packetHasSubstantiveEvidence,
  packetFingerprintMaterial,
} from '../src/domain/ask-health/packet.js'
import { askHealthUserPrompt } from '../src/domain/ask-health/prompt.js'
import { askHealthNonOwnerSubject } from '../src/domain/ask-health/person-scope.js'
import { answerAskHealth, explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import type { AskHealthPacketInput } from '../src/domain/ask-health/types.js'

const load = vi.hoisted(() => vi.fn())
vi.mock('../server/ask-health/load.js', () => ({ loadAskHealthPacketInput: load }))

const DAY = '2026-10-15'
const ownerData = (question: string): AskHealthPacketInput => ({
  question, lens: 'general', range: '30d', asOf: DAY, healthToday: DAY,
  generatedAt: DAY + 'T17:00:00.000Z',
  period: { start: '2026-09-16', end: DAY },
  contextMode: 'personalized',
  overview: null, activity: null, sleep: null,
  goals: [{
    id: 'SECRET_OWNER_GOAL_ID', kind: 'body_metric', lifecycle: 'active',
    label: 'SECRET_OWNER_GOAL', targetText: 'At most 72 kg',
    targetState: 'above_target', deadlineState: 'none',
    projectionState: 'insufficient_data', projectionReason: null,
  }],
  experiments: [], benchmarks: [], supplements: [],
  context: {
    tagCounts: { 'owner-private-tag': 1 }, notedDays: 1,
    notes: [{ date: DAY, text: 'SECRET_OWNER_CONTEXT' }],
  },
  patterns: [{ id: 'SECRET_OWNER_PATTERN', text: 'Secret private pattern' }],
  profile: {
    sexForPhysiology: 'female',
    persistentHealthContext: 'SECRET_OWNER_CLINICAL_NOTE',
    trainingLimitations: null, dietaryContext: null,
    conditions: [{ name: 'SECRET_OWNER_CONDITION', status: 'active' }],
    allergies: [], medications: [],
  },
  stableProfile: {
    dateOfBirth: '1990-01-01', ageYears: 36, heightCm: 164,
    historical: false,
  },
  currentHealthProfileSourceRecheck: 'verified',
  currentProfileRevision: 'SECRET_OWNER_REVISION',
  sourceCoverageAudit: {
    observedSignalCount: 57,
    selectedObservedSignalCount: 31,
    unselectedObservedSignalCount: 26,
  },
  maxChars: 99_000,
})
const provider = () => vi.fn(async () => ({
  text: JSON.stringify({
    blocks: [{ text: 'An arbitrary response.', evidence_refs: [] }],
    limitations: [], follow_ups: [],
  }),
  model: 'test-stub', inputTokens: 4, outputTokens: 6,
}))
const runArgs = (question: string, model = provider()) => ({
  question, lens: 'general' as const, range: '30d' as const,
  asOf: DAY, generatedAt: DAY + 'T17:00:00Z',
  contextMode: 'personalized' as const, conversation: [{
    role: 'user' as const, text: 'SECRET_OWNER_CONVERSATION',
  }],
  provider: model, model: 'test-stub', gate: createAskHealthGate({ minIntervalMs: 0 }),
})

describe('T48 whole-packet cross-domain non-owner privacy (synthetic only)', () => {
  it('prevents database fetches and model/budget use for third-party questions regardless of context mode', async () => {
    const questions = [
      "What did my wife's weight and food logs show last week?",
      "List my son's workouts and goals",
      "How did her sleep and nutrition improve?",
      'Explain the sentence “What are my fitness goals?”',
    ]
    for (const question of questions) {
      for (const contextMode of ['smart', 'personalized', 'deep', 'general_only'] as const) {
        load.mockReset()
        const model = provider()
        const gate = createAskHealthGate({ minIntervalMs: 0 })
        const take = vi.spyOn(gate, 'take')
        const result = await answerAskHealth({
          ...runArgs(question, model), contextMode, gate,
        })
        expect(load, question + ':' + contextMode).not.toHaveBeenCalled()
        expect(model, question + ':' + contextMode).not.toHaveBeenCalled()
        expect(take).not.toHaveBeenCalled()
        expect(result.meta.diagnostic.path).toBe('non_owner_subject')
        expect(result.meta.answerScope).toBe('general')
        expect(result.meta.contextMode).toBe(contextMode)
        expect(result.meta.evidenceOverview).toMatchObject({
          availableCount: 0, limited: false, items: [], unlistedCount: 0,
        })
        expect(result.evidence).toEqual([])
        expect(JSON.stringify(result)).not.toContain('SECRET_OWNER_')
        expect(result.answer.blocks[0]?.text).toContain('No saved Health records were used')
      }
    }
  })

  it('direct packet construction never includes any owner domain or private coverage audit', () => {
    const questions = ["Review my daughter's food logs and training", "Show my friend's saved health profile"]
    for (const question of questions) {
      const packet = buildAskHealthEvidencePacket(ownerData(question))
      expect(packet.evidence.map(item => item.id)).toEqual(['ask.range'])
      expect(packetHasSubstantiveEvidence(packet)).toBe(false)
      expect(packet.contextSummary).toEqual({ knows: [], missing: [] })
      expect(packet.clarification).toBeNull()
      expect(packet.currentProfileRevision).toBeNull()
      expect(packet.sourceCoverageAudit).toBeNull()
      expect(packet.evidenceSelectionAudit?.candidateCount).toBe(1)
      expect(packet.limitations).toMatchObject([{
        code: 'non_owner_person_scope', evidenceId: 'ask.range',
      }])
      expect(JSON.stringify(packet)).not.toContain('SECRET_OWNER_')
      expect(askHealthUserPrompt({ packet, question, conversation: [] })).not.toContain('SECRET_OWNER_')
    }
  })

  it('direct service calls with a previously built personal packet cannot send or cite it', async () => {
    const ownerPacket = buildAskHealthEvidencePacket(ownerData('What are my fitness goals?'))
    expect(ownerPacket.evidence.some(x => x.id === 'goals.SECRET_OWNER_GOAL_ID')).toBe(true)
    const model = provider()
    const gate = createAskHealthGate({ minIntervalMs: 0 })
    const take = vi.spyOn(gate, 'take')
    const question = "What are my brother's fitness goals?"
    const result = await explainAskHealth({
      packet: ownerPacket, question, contextMode: 'deep',
      conversation: [{ role: 'user', text: 'SECRET_OWNER_CONVERSATION' }],
      provider: model, gate, model: 'test-stub',
    })
    expect(model).not.toHaveBeenCalled()
    expect(take).not.toHaveBeenCalled()
    expect(result.meta.diagnostic.path).toBe('non_owner_subject')
    expect(result.meta.evidenceOverview.availableCount).toBe(0)
    expect(JSON.stringify(result)).not.toContain('SECRET_OWNER_')
    expect(result.evidence).toEqual([])
  })

  it('does not block definite owner-specific questions just because a relative asked', async () => {
    const question = 'My wife asked me about my workouts this month'
    expect(askHealthNonOwnerSubject(question)).toBe(false)
    const ownerQuestion = "Which saved medications do I have?"
    expect(askHealthNonOwnerSubject(ownerQuestion)).toBe(false)
    expect(askHealthNonOwnerSubject('My doctor needs my saved medication records')).toBe(false)
    load.mockReset().mockResolvedValue(ownerData(question))
    const model = provider()
    const result = await answerAskHealth({ ...runArgs(question, model) })
    expect(load).toHaveBeenCalledOnce()
    expect(model).toHaveBeenCalledOnce()
    expect(result.meta.diagnostic.path).toBe('model_answer')
  })

  it('owner immediate emergencies still receive deterministic safety handling when relatives are mentioned', async () => {
    const question = 'I have chest pain and my wife is here'
    load.mockReset()
    const model = provider()
    const result = await answerAskHealth({ ...runArgs(question, model) })
    expect(load).not.toHaveBeenCalled()
    expect(model).not.toHaveBeenCalled()
    expect(result.meta.diagnostic.path).toBe('immediate_safety')
    expect(result.meta.answerScope).toBe('urgent_safety')
    expect(result.evidence).toEqual([])
  })

  it('cross-domain foreign question cannot key a private cache revision', () => {
    const question = 'What does my husband\'s food and exercise history show?'
    const packet = buildAskHealthEvidencePacket(ownerData(question))
    expect(packetFingerprintMaterial(packet)).not.toContain('SECRET_OWNER_')
  })
})
