import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { healthProfileSchema, type HealthProfile } from '../src/domain/health-profile.js'
import {
  askClinicalProfileForDate,
  buildAskHealthEvidencePacket,
} from '../src/domain/ask-health/index.js'

const profile: HealthProfile = healthProfileSchema.parse({
  dateOfBirth: null, heightCm: null, persistentHealthContext: null,
  trainingLimitations: null, dietaryContext: null, bodyMeasurementProtocol: null,
  clinicalConditions: [], clinicalAllergies: [], clinicalMedications: [],
  updatedAt: null, sexForPhysiology: null,
})

function packet(sexForPhysiology: HealthProfile['sexForPhysiology']) {
  return buildAskHealthEvidencePacket({
    lens: 'general', range: '30d', asOf: '2026-10-15',
    period: { start: '2026-09-16', end: '2026-10-15' },
    generatedAt: '2026-10-15T17:00:00.000Z',
    question: 'Which physiological reference range applies to me?',
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [],
    profile: askClinicalProfileForDate(
      { ...profile, sexForPhysiology }, '2026-10-15', '2026-10-15',
    ),
  })
}

describe('PIQ-2.1 physiological sex is explicit and portable', () => {
  it('does not seed or infer the current owner sex', () => {
    expect(profile.sexForPhysiology).toBeNull()
    expect(packet(null).evidence.some((item) => item.id === 'clinical.sex_for_physiology')).toBe(false)
    const migration = readFileSync('migrations/0055_profile_physio_sex.sql', 'utf8')
    expect(migration).toContain('sex_for_physiology TEXT NULL')
    expect(migration).not.toMatch(/DEFAULT\s+'male'/i)
    const backup = readFileSync('server/backup/inventory.ts', 'utf8')
    expect(backup).toContain("col('sex_for_physiology', 'text')")
  })

  it('cites only the saved owner-selected value to Ask Health, without asserting gender', () => {
    for (const sex of ['male', 'female', 'other'] as const) {
      const evidence = packet(sex).evidence.find((item) => item.id === 'clinical.sex_for_physiology')
      expect(evidence).toMatchObject({
        value: sex, userEntered: true, substantive: true, detailPath: '/settings#health-profile',
      })
      expect(evidence?.text).not.toMatch(/gender identity is (male|female)/i)
    }
    expect(packet('other').evidence.find((item) =>
      item.id === 'clinical.sex_for_physiology')?.text).toContain('Do not infer a binary category')
  })

  it('keeps present-day owner context out of historical Ask Health packets', () => {
    expect(askClinicalProfileForDate(
      { ...profile, sexForPhysiology: 'male' }, '2026-10-14', '2026-10-15',
    )).toBeNull()
  })

  it('Settings exposes an explicit unset option and the server preserves omission versus clearing', () => {
    const ui = readFileSync('src/features/settings/HealthProfileSection.tsx', 'utf8')
    const service = readFileSync('server/profile/service.ts', 'utf8')
    expect(ui).toContain('Not set — ask when relevant')
    expect(ui).toContain('sexForPhysiology,')
    expect(service).toContain('input.sexForPhysiology === undefined ? current.sexForPhysiology')
    expect(service).toContain('sex_for_physiology = EXCLUDED.sex_for_physiology')
  })
})
