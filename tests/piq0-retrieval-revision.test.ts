import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  askHealthUserPrompt,
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
    healthToday: '2026-10-14',
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

function rawPartialAnswer(): string {
  return JSON.stringify({
    blocks: [{ text: 'Some saved medications are listed; this is not a full interaction assessment.', evidence_refs: ['ask.range'] }],
    limitations: [], follow_ups: [],
  })
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

  it('T48: a corrected, size-omitted current profile fact invalidates the personal cache via its verified revision', () => {
    const question = 'Which of my active medications could be relevant?'
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
      currentHealthProfileSourceRecheck: 'verified',
      currentProfileRevision: '2026-10-14T10:00:00.000Z',
    })
    const after = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(changed), maxChars: 1700,
      currentHealthProfileSourceRecheck: 'verified',
      currentProfileRevision: '2026-10-14T10:00:01.000Z',
    })
    const unlimited = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(changed),
    })
    expect(unlimited.evidence.map((item) => item.id)).toContain('clinical.medication.15')
    expect(before.evidence.map((item) => item.id)).not.toContain('clinical.medication.15')
    expect(after.evidence.map((item) => item.id)).not.toContain('clinical.medication.15')
    expect(before.evidenceSelectionAudit?.removedSubstantiveCount).toBeGreaterThan(0)
    expect(before.evidence).toEqual(after.evidence)
    expect(packetFingerprintMaterial(before)).not.toBe(packetFingerprintMaterial(after))
    expect(packetFingerprintMaterial(before)).not.toContain('Synthetic Example A')
    expect(packetFingerprintMaterial(after)).not.toContain('Synthetic Example B')
    // An omitted correction is intentionally NOT sent to the model: only the
    // private cache key changes when the saved owner profile version changes.
    const withoutAttestation = buildAskHealthEvidencePacket({
      ...input(question), profile: profile(changed), maxChars: 1700,
      currentHealthProfileSourceRecheck: 'changed_or_unavailable',
      currentProfileRevision: '2026-10-14T10:00:01.000Z',
    })
    expect(withoutAttestation.currentProfileRevision).toBeNull()
    const historical = buildAskHealthEvidencePacket({
      ...input(question), asOf: '2026-10-01', profile: profile(changed), maxChars: 1700,
      currentHealthProfileSourceRecheck: 'verified',
      currentProfileRevision: '2026-10-14T10:00:01.000Z',
    })
    expect(historical.currentProfileRevision).toBeNull()
  })


  it('T48: discloses capped partial medication evidence without sending omitted names', async () => {
    const question = 'Which of my active medications could be relevant?'
    const medications = Array.from({ length: 16 }, (_, index) => ({
      name: 'Synthetic Med ' + index, dose: null, frequency: null, status: 'active' as const,
    }))
    const packet = buildAskHealthEvidencePacket({
      ...input(question), contextMode: 'personalized',
      profile: {
        persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
        conditions: [], allergies: [], medications,
      },
      maxChars: 1700,
    })
    expect(packet.evidence.map(item => item.id)).not.toContain('clinical.medication.15')
    const limitation = packet.limitations.find(item => item.code === 'clinical_evidence_limited')
    expect(limitation?.evidenceId).toBe('ask.range')
    expect(limitation?.text).toContain('medications')
    expect(limitation?.text).toContain('not a complete review')
    expect(limitation?.text).not.toContain('Synthetic Med')
    const modelPrompt = askHealthUserPrompt({ packet, question, conversation: [] })
    expect(modelPrompt).toContain('clinical_evidence_limited')
    expect(modelPrompt).not.toContain('Synthetic Med 15')
    expect(modelPrompt).not.toContain('currentProfileRevision')
    const model = vi.fn(async () => ({
      text: rawPartialAnswer(), model: 'piq-stub', inputTokens: 10, outputTokens: 12,
    }))
    const result = await explainAskHealth({
      packet, question, conversation: [], contextMode: 'personalized',
      provider: model, gate: createAskHealthGate({ minIntervalMs: 0 }),
      model: 'piq-stub', now: at + 75_000,
    })
    expect(model).toHaveBeenCalledOnce()
    expect(result.meta.answerScope).toBe('personal')
    expect(result.meta.evidenceOverview.clinicalScopeWarning).toBe(limitation?.text)
    expect(result.meta.evidenceOverview.clinicalScopeWarning).not.toContain('Synthetic Med')
  })

  it('T48: no false clinical omission warning for unrelated or fully included records, nor source disagreement', () => {
    const medications = Array.from({ length: 16 }, (_, index) => ({
      name: 'Synthetic Med ' + index, dose: null, frequency: null, status: 'active' as const,
    }))
    const profile = {
      persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
      conditions: [], allergies: [], medications,
    }
    const question = 'Which of my active medications could be relevant?'
    const full = buildAskHealthEvidencePacket({ ...input(question), profile, maxChars: 20000 })
    expect(full.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
    const unrelated = buildAskHealthEvidencePacket({
      ...input('How do muscles grow?'), profile, maxChars: 1700,
    })
    expect(unrelated.evidence.some(item => item.id.startsWith('clinical.medication.'))).toBe(false)
    expect(unrelated.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
    const withheld = buildAskHealthEvidencePacket({
      ...input(question), profile, healthToday: '2026-10-14',
      currentHealthProfileSourceRecheck: 'changed_or_unavailable', maxChars: 1700,
    })
    expect(withheld.evidence.some(item => item.id.startsWith('clinical.medication.'))).toBe(false)
    expect(withheld.limitations.some(item => item.code === 'clinical_evidence_limited')).toBe(false)
    expect(withheld.evidence.some(item => item.id === 'profile.source_consistency')).toBe(true)
  })

  it('T48: an allergy/condition selection capped by size warns without revealing missing details', () => {
    const question = 'Which conditions and allergies do I have saved?'
    const packet = buildAskHealthEvidencePacket({
      ...input(question),
      profile: {
        persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
        conditions: Array.from({ length: 12 }, (_, i) => ({
          name: 'Synthetic Condition ' + i, status: 'active' as const,
        })),
        allergies: Array.from({ length: 12 }, (_, i) => ({
          substance: 'Synthetic Allergen ' + i, reaction: null, severity: 'unknown' as const,
        })),
        medications: [],
      },
      maxChars: 1300,
    })
    const warning = packet.limitations.find(item => item.code === 'clinical_evidence_limited')?.text
    expect(warning).toContain('allergies')
    expect(warning).toContain('conditions')
    expect(warning).not.toContain('Synthetic Allergen')
    expect(warning).not.toContain('Synthetic Condition')
    const prompt = askHealthUserPrompt({ packet, question, conversation: [] })
    expect(prompt).not.toContain('Synthetic Allergen 11')
    expect(prompt).not.toContain('Synthetic Condition 11')
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
