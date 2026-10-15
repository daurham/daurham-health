import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  buildAskHealthEvidencePacket,
  packetFingerprintMaterial,
  type AskHealthPacketInput,
} from '../src/domain/ask-health/index.js'
import { answerAskHealth, explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'
import { HttpError } from '../server/http.js'

/**
 * This is a synthetic service-boundary evaluation: the owner DB is NEVER
 * opened. A failing fake loader is not an empty health database.
 */
const loader = vi.hoisted(() => ({ load: vi.fn() }))
vi.mock('../server/ask-health/load.js', () => ({
  loadAskHealthPacketInput: loader.load,
}))

const at = Date.parse('2026-10-14T18:00:00.000Z')

function input(question: string, goal: string | null = null): AskHealthPacketInput {
  return {
    lens: 'general', range: '30d', asOf: '2026-10-14',
    period: { start: '2026-09-15', end: '2026-10-14' },
    generatedAt: '2026-10-14T18:00:00.000Z',
    question, overview: null, activity: null, sleep: null,
    goals: goal == null ? [] : [{
      id: 'fixture-goal', kind: 'body_metric', lifecycle: 'active',
      label: 'Body metric', targetText: goal,
      targetState: 'above_target', deadlineState: 'none',
      projectionState: 'insufficient_data', projectionReason: null,
    }],
    experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
  }
}

function provider() {
  return vi.fn(async () => ({
    text: JSON.stringify({
      blocks: [{
        text: 'The stored goal is a synthetic body-metric goal.',
        evidence_refs: ['goals.fixture-goal'],
      }],
      limitations: [], follow_ups: [],
    }),
    model: 'piq-stub', inputTokens: 14, outputTokens: 17,
  }))
}

function callAnswer(question: string, model = provider()) {
  return answerAskHealth({
    question, lens: 'general', range: '30d', asOf: '2026-10-14',
    generatedAt: '2026-10-14T18:00:00.000Z', conversation: [],
    provider: model, gate: createAskHealthGate({ minIntervalMs: 0 }),
    model: 'piq-stub', now: at,
  })
}

describe('PIQ-0 evidence load boundary and corrected-source cache', () => {
  beforeEach(() => { loader.load.mockReset() })

  it('distinguishes a successful empty snapshot from a database read failure', async () => {
    const question = 'What did my health records show today?'
    loader.load.mockResolvedValueOnce(input(question))
    const model = provider()
    const result = await callAnswer(question, model)
    expect(loader.load).toHaveBeenCalledOnce()
    expect(model).not.toHaveBeenCalled()
    expect(result.meta.diagnostic.path).toBe('packet_no_substantive_evidence')
    expect(result.meta.diagnostic.substantiveEvidenceCount).toBe(0)
    expect(result.meta.diagnostic.sourceCoverageAudit).toBeNull()
    // This says only that the *loaded packet* lacks substantive evidence.
    expect(result.meta.diagnostic).not.toHaveProperty('ownerDatabaseEmpty')
  })

  it('a loader/database exception produces sanitized 503 and never reaches Gemini', async () => {
    const privateDetail = 'PRIVATE_FICTIONAL_HEALTH_RECORD_NOT_FOR_LOGS'
    loader.load.mockRejectedValueOnce(new Error(privateDetail))
    const model = provider()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await expect(callAnswer('What did my records show?', model))
        .rejects.toMatchObject({
          statusCode: 503,
          code: 'ASK_HEALTH_EVIDENCE_LOAD',
        })
      expect(model).not.toHaveBeenCalled()
      expect(spy).toHaveBeenCalledWith('ask-health failure stage=evidence_load')
      expect(JSON.stringify(spy.mock.calls)).not.toContain(privateDetail)
    } finally {
      spy.mockRestore()
    }
  })

  it('an internal HttpError from the data loader is sanitized without exposing medical or SQL details', async () => {
    const privateDetail = 'PRIVATE_SYNTHETIC_SQL_PATIENT_ROW'
    loader.load.mockRejectedValueOnce(new HttpError(500, privateDetail, undefined, 'DB_ROW_PRIVATE'))
    const model = provider()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let actual: unknown
      try {
        await callAnswer('What did my records show?', model)
      } catch (error) {
        actual = error
      }
      expect(actual).toBeInstanceOf(HttpError)
      const safe = actual as HttpError
      expect(safe).toMatchObject({
        statusCode: 503,
        code: 'ASK_HEALTH_EVIDENCE_LOAD',
      })
      expect(safe.message).not.toContain(privateDetail)
      expect(JSON.stringify(spy.mock.calls)).not.toContain(privateDetail)
      expect(model).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })

  it('owner authorization HttpError remains distinct from a missing record', async () => {
    loader.load.mockRejectedValueOnce(new HttpError(403, 'Forbidden', undefined, 'OWNER_FORBIDDEN'))
    const model = provider()
    await expect(callAnswer('What did my records show?', model))
      .rejects.toMatchObject({ statusCode: 403, code: 'OWNER_FORBIDDEN' })
    expect(model).not.toHaveBeenCalled()
  })

  it('T27: correcting a selected canonical goal invalidates an existing answer cache', async () => {
    const question = 'What is my saved body metric goal?'
    const first = buildAskHealthEvidencePacket(input(question, 'At most 80 kg'))
    const corrected = buildAskHealthEvidencePacket(input(question, 'At most 78 kg'))
    expect(packetFingerprintMaterial(first)).not.toBe(packetFingerprintMaterial(corrected))
    const model = provider()
    const gate = createAskHealthGate({ minIntervalMs: 0 })
    const args = { question, conversation: [], provider: model, gate, model: 'piq-stub' }
    const initial = await explainAskHealth({ ...args, packet: first, now: at })
    const cached = await explainAskHealth({ ...args, packet: first, now: at + 1_000 })
    const recomputed = await explainAskHealth({ ...args, packet: corrected, now: at + 2_000 })
    expect(initial.meta.diagnostic.path).toBe('model_answer')
    expect(cached.meta.diagnostic.path).toBe('cache_hit')
    expect(recomputed.meta.diagnostic.path).toBe('model_answer')
    expect(model).toHaveBeenCalledTimes(2)
  })

  it('T48 KNOWN LIMITATION: a corrected fact omitted by a tight packet cap does not alter its cache fingerprint', () => {
    const question = 'Which active medication could be relevant?'
    const original = Array.from({ length: 16 }, (_, index) => ({
      name: index === 15 ? 'Synthetic Example A' : 'Synthetic Other ' + index,
      dose: null, frequency: null, status: 'active' as const,
    }))
    const changed = original.map((medication, index) =>
      index === 15 ? { ...medication, name: 'Synthetic Example B' } : medication
    )
    const profile = (medications: typeof original) => ({
      persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
      conditions: [], allergies: [], medications,
    })
    const before = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(original), maxChars: 1700,
    })
    const after = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(changed), maxChars: 1700,
    })
    const unlimited = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(changed),
    })
    expect(unlimited.evidence.map((item) => item.id)).toContain('clinical.medication.15')
    expect(before.evidence.map((item) => item.id)).not.toContain('clinical.medication.15')
    expect(after.evidence.map((item) => item.id)).not.toContain('clinical.medication.15')
    expect(before.evidenceSelectionAudit?.removedSubstantiveCount).toBeGreaterThan(0)
    expect(packetFingerprintMaterial(before)).toBe(packetFingerprintMaterial(after))
    // The app cannot promise a cache refresh for facts it did not select.
    // T48/PIQ-3 needs source revision or relevant fact preservation.
  })

  it('a different historical as-of scope has a distinct evidence fingerprint', () => {
    const question = 'What is my goal?'
    const current = buildAskHealthEvidencePacket(input(question, 'At most 80 kg'))
    const historic = buildAskHealthEvidencePacket({
      ...input(question, 'At most 80 kg'),
      asOf: '2026-10-01',
      period: { start: '2026-09-02', end: '2026-10-01' },
    })
    expect(packetFingerprintMaterial(current)).not.toBe(packetFingerprintMaterial(historic))
  })
})
