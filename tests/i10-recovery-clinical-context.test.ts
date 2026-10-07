import { describe, expect, it } from 'vitest'
import { askClinicalProfileForDate } from '../src/domain/ask-health/clinical-profile.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { healthProfileInputSchema } from '../src/domain/health-profile.js'
import {
  buildHealthIntelligenceSnapshot,
  routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { enabledSleepVitals } from '../src/domain/sleep/vitals.js'

function rhr(date: string, value: number): IntelligenceObservation {
  return {
    key: 'activity.resting_heart_rate_bpm',
    date,
    value,
    unit: 'bpm',
    provenance: 'device',
    sourceIds: [],
  }
}

describe('I10 passive recovery and clinical context', () => {
  it('keeps resting heart rate as completed-day evidence with a personal baseline', () => {
    const snapshot = buildHealthIntelligenceSnapshot({
      range: '30d',
      asOf: '2026-10-07',
      start: '2026-10-01',
      end: '2026-10-07',
      timezone: 'America/Phoenix',
      today: '2026-10-07',
      observations: [
        rhr('2026-10-01', 59),
        rhr('2026-10-02', 60),
        rhr('2026-10-03', 58),
        rhr('2026-10-04', 61),
        rhr('2026-10-05', 60),
        rhr('2026-10-06', 59),
        rhr('2026-10-07', 90),
      ],
    })
    const coverage = snapshot.coverage.find((item) => item.key === 'activity.resting_heart_rate_bpm')
    const baseline = snapshot.baselines.find((item) => item.key === 'activity.resting_heart_rate_bpm')
    expect(coverage).toMatchObject({ observedDays: 6, eligibleDays: 6 })
    expect(baseline).toMatchObject({ state: 'available', observations: 6, latest: 59 })
    expect(snapshot.frame.find((day) => day.date === '2026-10-07')?.signals['activity.resting_heart_rate_bpm']?.value).toBe(90)

    const routed = routeHealthIntelligence(snapshot, { question: 'How is my resting heart rate and recovery?', lens: 'recovery' })
    expect(routed.selectedKeys).toContain('activity.resting_heart_rate_bpm')
    expect(routed.baselines.some((item) => item.key === 'activity.resting_heart_rate_bpm')).toBe(true)
  })

  it('stores conditions, allergies, and medications as structured owner-entered profile context', () => {
    const profile = healthProfileInputSchema.parse({
      clinicalConditions: [{ name: 'Seasonal asthma', status: 'active' }],
      clinicalAllergies: [{ substance: 'Penicillin', reaction: 'Hives', severity: 'moderate' }],
      clinicalMedications: [{ name: 'Example medicine', dose: '10 mg', frequency: 'daily', status: 'active' }],
    })
    expect(profile.clinicalConditions?.[0]).toEqual({ name: 'Seasonal asthma', status: 'active' })
    expect(profile.clinicalAllergies?.[0]).toMatchObject({ substance: 'Penicillin', severity: 'moderate' })
    expect(profile.clinicalMedications?.[0]).toMatchObject({ name: 'Example medicine', dose: '10 mg', frequency: 'daily', status: 'active' })
  })

  it('exposes structured clinical context to Ask Health as owner-entered evidence', () => {
    const packet = buildAskHealthEvidencePacket({
      lens: 'general',
      range: '30d',
      asOf: '2026-10-07',
      period: { start: '2026-09-08', end: '2026-10-07' },
      generatedAt: '2026-10-07T18:00:00.000Z',
      question: 'Could my known context matter here?',
      overview: null,
      activity: null,
      sleep: null,
      goals: [],
      experiments: [],
      benchmarks: [],
      supplements: [],
      context: null,
      patterns: [],
      profile: {
        persistentHealthContext: 'Owner-entered durable context.',
        trainingLimitations: null,
        dietaryContext: null,
        conditions: [{ name: 'Seasonal asthma', status: 'active' }],
        allergies: [{ substance: 'Penicillin', reaction: 'Hives', severity: 'moderate' }],
        medications: [{ name: 'Example medicine', dose: '10 mg', frequency: 'daily', status: 'active' }],
      },
    })
    const clinical = packet.evidence.filter((item) => item.domain === 'clinical_context')
    expect(clinical.length).toBeGreaterThanOrEqual(4)
    expect(clinical.every((item) => item.userEntered)).toBe(true)
    expect(clinical.some((item) => item.id.startsWith('clinical.medication.'))).toBe(true)
    expect(clinical.some((item) => item.id.startsWith('clinical.allergy.'))).toBe(true)
  })

  it('keeps current clinical profile context out of historical Ask Health packets', () => {
    const profile = {
      dateOfBirth: null,
      heightCm: null,
      persistentHealthContext: 'Current context',
      trainingLimitations: null,
      dietaryContext: null,
      bodyMeasurementProtocol: null,
      clinicalConditions: [{ name: 'Seasonal asthma', status: 'active' as const }],
      clinicalAllergies: [],
      clinicalMedications: [{ name: 'Example medicine', dose: null, frequency: null, status: 'active' as const }],
      updatedAt: '2026-10-07T18:00:00.000Z',
    }
    expect(askClinicalProfileForDate(profile, '2026-10-07', '2026-10-07')?.conditions).toHaveLength(1)
    expect(askClinicalProfileForDate(profile, '2026-09-01', '2026-10-07')).toBeNull()
  })

  it('does not silently enable unverified overnight vitals', () => {
    expect(enabledSleepVitals()).toEqual([])
  })
})
