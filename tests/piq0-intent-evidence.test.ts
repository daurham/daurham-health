import { describe, expect, it } from 'vitest'
import { buildAskHealthEvidencePacket, type AskHealthPacketInput } from '../src/domain/ask-health/index.js'
import { askClinicalProfileForDate } from '../src/domain/ask-health/clinical-profile.js'
import { healthProfileSchema } from '../src/domain/health-profile.js'
import {
  buildHealthIntelligenceSnapshot, routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { assessEvidenceRelevance, type RelevanceRequirement } from './fixtures/piq/evidence-relevance.js'

const period = { start: '2026-09-15', end: '2026-10-14' }

function base(question: string, overrides: Partial<AskHealthPacketInput> = {}): AskHealthPacketInput {
  return {
    lens: 'general', range: '30d', asOf: '2026-10-14',
    period, generatedAt: '2026-10-14T18:00:00.000Z',
    question, overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [],
    ...overrides,
  }
}

function recorded(key: IntelligenceObservation['key'], value: number, unit: string): IntelligenceObservation {
  return { key, value, unit, date: '2026-10-11', sourceIds: ['fixture'], provenance: 'owner' }
}

function snapshot(observations: IntelligenceObservation[]) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: '2026-10-14', start: period.start, end: period.end,
    today: '2026-10-14', timezone: 'America/Phoenix', observations,
  })
}

function req(
  label: string, evidenceId: string,
  flags: Partial<Omit<RelevanceRequirement, 'label' | 'evidenceId'>> = {},
): RelevanceRequirement {
  return {
    label, evidenceId, sourceRecorded: true, modelled: true,
    historicallyEligible: true, routed: true, mandatory: true, ...flags,
  }
}

describe('PIQ-0 intent-to-evidence evaluation cohort (synthetic only)', () => {
  it('T01: a general creatine question with no recorded personal evidence needs no personal citation', () => {
    const question = 'What does creatine monohydrate do?'
    const data = base(question)
    const packet = buildAskHealthEvidencePacket(data)
    const results = assessEvidenceRelevance([], packet, packet)
    expect(results).toMatchObject({ mandatorySelected: 0, mandatoryTotal: 0, mandatoryFailures: 0 })
    expect(packet.evidence.every((item) => !item.substantive)).toBe(true)
    // The known T01 product failure is in piq0-ask-health-baseline.test.ts:
    // the service currently refuses despite needing no personal history.
  })

  it('T12: bowel count, recorded water and fiber are routed; stool TYPE is not modelled', () => {
    const question = 'My stools are hard. Is water or fiber related?'
    const observations = [
      recorded('bowel.count', 1, 'count'),
      recorded('hydration.ml', 1100, 'ml'),
      recorded('nutrition.fiber_g', 9, 'g'),
    ]
    const full = snapshot(observations)
    const routed = routeHealthIntelligence(full, { question, lens: 'general' })
    for (const key of ['bowel.count', 'hydration.ml', 'nutrition.fiber_g'] as const) {
      expect(routed.selectedKeys).toContain(key)
      expect(full.coverage.find((item) => item.key === key)?.observedDays).toBe(1)
    }
    const packet = buildAskHealthEvidencePacket(base(question, { intelligence: routed }))
    const requirements = [
      req('Bowel count', 'intelligence.coverage.bowel.count'),
      req('Recorded water', 'intelligence.coverage.hydration.ml'),
      req('Recorded fiber', 'intelligence.coverage.nutrition.fiber_g'),
      // Synthetic canonical bowel event has Bristol type 1, but no Bristol
      // shared-signal key or packet evidence representation exists today.
      req('Stool consistency (Bristol 1)', 'bowel.bristol_type', { modelled: false }),
    ]
    const result = assessEvidenceRelevance(requirements, packet, packet)
    expect(result.results.map((r) => r.stage)).toEqual([
      'selected', 'selected', 'selected', 'not_modelled',
    ])
    expect(result).toMatchObject({ mandatorySelected: 3, mandatoryTotal: 4, mandatoryFailures: 1 })
    expect(JSON.stringify(packet.evidence)).not.toMatch(/bristol.type/i)
    // This test identifies a source-to-model gap, not a diagnosis.
  })

  it('T18: historical query must not silently reuse present-day medication state', () => {
    const today = '2026-10-14'
    const profile = healthProfileSchema.parse({
      dateOfBirth: null, heightCm: null,
      persistentHealthContext: null, trainingLimitations: null,
      dietaryContext: null, bodyMeasurementProtocol: null,
      clinicalConditions: [], clinicalAllergies: [],
      clinicalMedications: [
        { name: 'Synthetic Medication', dose: null, frequency: null, status: 'active' },
      ],
      updatedAt: '2026-10-14T18:00:00.000Z',
    })
    const question = 'Was I taking this medication last week?'
    const past = askClinicalProfileForDate(profile, '2026-10-07', today)
    const current = askClinicalProfileForDate(profile, today, today)
    expect(past).toBeNull()
    expect(current?.medications).toHaveLength(1)
    const historic = buildAskHealthEvidencePacket(base(question, {
      asOf: '2026-10-07', period: { start: '2026-09-08', end: '2026-10-07' },
      profile: past,
    }))
    const now = buildAskHealthEvidencePacket(base(question, { profile: current }))
    expect(now.evidence.map((item) => item.id)).toContain('clinical.medication.0')
    const result = assessEvidenceRelevance([
      req('Medication as of last week', 'clinical.medication.0', { historicallyEligible: false }),
    ], historic, historic)
    expect(result.results[0]?.stage).toBe('historically_ineligible')
    expect(result.mandatoryFailures).toBe(1)
    // Withholding current state is safe; the missing historical timeline is
    // an explicit PIQ-2 limitation, NOT permission to backfill a guessed status.
  })

  it('T21: a relevant synthetic medication is dropped by a tight packet budget', () => {
    const question = 'What medications should I consider when reviewing my recovery?'
    const medications = Array.from({ length: 16 }, (_, i) => ({
      name: i === 15 ? 'Relevant Synthetic Medication' : 'Synthetic Medication ' + i,
      dose: null, frequency: null, status: 'active' as const,
    }))
    const data = base(question, { profile: {
      persistentHealthContext: null, trainingLimitations: null, dietaryContext: null,
      conditions: [], allergies: [], medications,
    } })
    const unlimited = buildAskHealthEvidencePacket(data)
    const limited = buildAskHealthEvidencePacket({ ...data, maxChars: 1700 })
    const key = 'clinical.medication.15'
    expect(unlimited.evidence.map((item) => item.id)).toContain(key)
    expect(limited.evidence.map((item) => item.id)).not.toContain(key)
    expect(limited.evidenceSelectionAudit?.removedSubstantiveCount).toBeGreaterThan(0)
    const result = assessEvidenceRelevance([req('Question-relevant medication', key)], unlimited, limited)
    expect(result.results[0]?.stage).toBe('removed_by_packet_cap')
    expect(result.mandatoryFailures).toBe(1)
    // The current priority ordering is not intent-aware; this known gap must
    // be resolved in PIQ-3 without silently dropping a key safety context.
  })

  it('T21: explicitly identifies router exclusion independently of packet truncation', () => {
    const question = 'How did I sleep?'
    const full = snapshot([
      recorded('sleep.total_minutes', 430, 'min'),
      recorded('hydration.ml', 700, 'ml'),
    ])
    const routed = routeHealthIntelligence(full, { question, lens: 'recovery' })
    expect(full.coverage.find((x) => x.key === 'hydration.ml')?.observedDays).toBe(1)
    expect(routed.selectedKeys).not.toContain('hydration.ml')
    const packet = buildAskHealthEvidencePacket(base(question, { lens: 'recovery', intelligence: routed }))
    const result = assessEvidenceRelevance([
      req('Sleep', 'intelligence.coverage.sleep.total_minutes'),
      req('Unrelated recorded water', 'intelligence.coverage.hydration.ml', {
        routed: false, mandatory: false,
      }),
    ], packet, packet)
    expect(result.results.map((r) => r.stage)).toEqual(['selected', 'excluded_by_router'])
    expect(result).toMatchObject({ mandatorySelected: 1, mandatoryTotal: 1, mandatoryFailures: 0 })
    // Router exclusion is NOT a quality failure when the signal isn't required.
  })

  it('classifies actual absence differently from dropped or unsupported evidence', () => {
    const packet = buildAskHealthEvidencePacket(base('What have I recorded?'))
    const result = assessEvidenceRelevance([
      req('No recorded daily symptom', 'intelligence.coverage.wellness.energy', { sourceRecorded: false }),
      req('Available but absent builder item', 'custom.unhandled', {}),
    ], packet, packet)
    expect(result.results.map((x) => x.stage)).toEqual(['no_source_record', 'missing_from_builder'])
    expect(result.mandatoryFailures).toBe(2)
  })
})
