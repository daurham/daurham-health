import { describe, expect, it, vi } from 'vitest'
import {
  askStableProfileForDate, buildAskHealthEvidencePacket, packetFingerprintMaterial,
  type AskHealthPacketInput,
} from '../src/domain/ask-health/index.js'
import { healthProfileSchema } from '../src/domain/health-profile.js'
import { explainAskHealth } from '../server/ask-health/service.js'
import { createAskHealthGate } from '../server/ask-health/gate.js'

/** Synthetic source edit → packet → real Ask cache path, with no owner database,
 * Gemini request, health detail upload or production mutation.
 */
const date = '2026-10-15'
const question = 'What is my current height?'
const original = healthProfileSchema.parse({
  dateOfBirth: null, heightCm: 178, sexForPhysiology: null,
  persistentHealthContext: null, trainingLimitations: null,
  dietaryContext: null, bodyMeasurementProtocol: null,
  clinicalConditions: [], clinicalAllergies: [], clinicalMedications: [],
  updatedAt: '2026-10-15T18:00:00.000Z',
})

function packet(profile = original) {
  const input: AskHealthPacketInput = {
    lens: 'general', range: '30d', asOf: date,
    generatedAt: '2026-10-15T18:15:00.000Z',
    period: { start: '2026-09-16', end: date },
    question,
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [],
    stableProfile: askStableProfileForDate(profile, date, date),
  }
  return buildAskHealthEvidencePacket(input)
}

function fakeProvider(messages: string[]) {
  let index = 0
  return vi.fn(async () => ({
    text: JSON.stringify({
      blocks: [{
        text: messages[Math.min(index++, messages.length - 1)],
        evidence_refs: ['profile.height_cm'],
      }],
      limitations: [], follow_ups: [],
    }),
    model: 'gemini-test', inputTokens: 12, outputTokens: 9,
  }))
}
const gate = () => createAskHealthGate({ minIntervalMs: 0, maxPerMinute: 100, budgetUsd: 100 })

describe('PIQ-2.5 source correction re-ask freshness', () => {
  it('changed height forces fresh answer; identical packet hits cache; fresh evidence is cited', async () => {
    const before = packet()
    const after = packet({ ...original, heightCm: 180, updatedAt: '2026-10-15T19:00:00.000Z' })
    expect(before.evidence.find((x) => x.id === 'profile.height_cm')?.value).toBe(178)
    expect(after.evidence.find((x) => x.id === 'profile.height_cm')?.value).toBe(180)
    expect(packetFingerprintMaterial(before)).not.toBe(packetFingerprintMaterial(after))
    const provider = fakeProvider(['Saved height: 178 cm.', 'Saved height: 180 cm.'])
    const sharedGate = gate()
    const ask = (data: ReturnType<typeof packet>, now: number) =>
      explainAskHealth({ packet: data, question, conversation: [], provider, gate: sharedGate,
        model: 'gemini-test', now })
    expect((await ask(before, 1000)).meta.cached).toBe(false)
    expect((await ask(before, 2000)).meta.cached).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
    const corrected = await ask(after, 3000)
    expect(corrected.meta.cached).toBe(false)
    expect(corrected.answer.blocks[0]?.text).toContain('180')
    expect(corrected.evidence.find((x) => x.id === 'profile.height_cm'))
      .toMatchObject({ value: 180, detailPath: '/settings#health-profile' })
    expect(provider).toHaveBeenCalledTimes(2)
    expect((await ask(after, 4000)).meta.cached).toBe(true)
    expect(provider).toHaveBeenCalledTimes(2)
  })

  it('editing unrelated profile text does not consume another AI request', async () => {
    const before = packet()
    const unrelated = packet({
      ...original, trainingLimitations: 'Fictional unrelated restriction',
      updatedAt: '2026-10-15T19:00:00.000Z',
    })
    expect(packetFingerprintMaterial(unrelated)).toBe(packetFingerprintMaterial(before))
    const provider = fakeProvider(['Saved height: 178 cm.'])
    const args = { question, conversation: [], provider, gate: gate(), model: 'gemini-test' }
    await explainAskHealth({ ...args, packet: before, now: 1000 })
    const again = await explainAskHealth({ ...args, packet: unrelated, now: 2000 })
    expect(again.meta.cached).toBe(true)
    expect(provider).toHaveBeenCalledTimes(1)
  })

  it('clearing the only personal fact removes its evidence rather than replaying cached height', async () => {
    const before = packet()
    const empty = packet({ ...original, heightCm: null, updatedAt: '2026-10-15T19:00:00.000Z' })
    expect(empty.evidence.some((x) => x.id === 'profile.height_cm')).toBe(false)
    const provider = fakeProvider(['Saved height: 178 cm.'])
    const args = { question, conversation: [], provider, gate: gate(), model: 'gemini-test' }
    await explainAskHealth({ ...args, packet: before, now: 1000 })
    const cleared = await explainAskHealth({ ...args, packet: empty, now: 2000 })
    expect(cleared.answer.blocks[0]?.text).not.toContain('178')
    expect(cleared.meta.provider).toBe('health')
    expect(cleared.evidence.some((x) => x.id === 'profile.height_cm')).toBe(false)
    expect(provider).toHaveBeenCalledTimes(1)
  })
})
