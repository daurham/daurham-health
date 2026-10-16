import { describe, expect, it } from 'vitest'
import {
  askClinicalProfileForDate,
  askStableProfileForDate,
  buildAskHealthEvidencePacket,
} from '../src/domain/ask-health/index.js'
import { healthProfileSchema, type HealthProfile } from '../src/domain/health-profile.js'

const original: HealthProfile = healthProfileSchema.parse({
  dateOfBirth: '1995-06-10', heightCm: 178,
  sexForPhysiology: 'male', persistentHealthContext: 'Current context only',
  trainingLimitations: null, dietaryContext: null, bodyMeasurementProtocol: null,
  clinicalConditions: [], clinicalAllergies: [], clinicalMedications: [],
  updatedAt: '2026-10-15T12:00:00.000Z',
})

function evidence(input: {
  asOf: string
  question: string
  profile?: HealthProfile
}) {
  const profile = input.profile ?? original
  return buildAskHealthEvidencePacket({
    lens: 'general', range: '30d', asOf: input.asOf,
    period: { start: '2026-09-16', end: input.asOf },
    generatedAt: '2026-10-15T18:00:00.000Z',
    question: input.question,
    overview: null, activity: null, sleep: null,
    goals: [], experiments: [], benchmarks: [], supplements: [],
    context: null, patterns: [],
    stableProfile: askStableProfileForDate(profile, input.asOf, '2026-10-15'),
    profile: askClinicalProfileForDate(profile, input.asOf, '2026-10-15'),
  }).evidence
}

describe('PIQ-2.2 Ask Health age, birth date, and time-scoped height', () => {
  it('supplies the owner-entered birth date, calculated current age and current height when relevant', () => {
    const rows = evidence({ asOf: '2026-10-15', question: 'What is my age and height?' })
    expect(rows.find((r) => r.id === 'profile.date_of_birth')).toMatchObject({
      value: '1995-06-10', userEntered: true, provenance: 'owner_profile_current',
    })
    expect(rows.find((r) => r.id === 'profile.age_years_as_of')).toMatchObject({
      value: 31, unit: 'years', userEntered: false, provenance: 'derived_from_current_owner_profile',
    })
    expect(rows.find((r) => r.id === 'profile.height_cm')).toMatchObject({
      value: 178, unit: 'cm', userEntered: true,
    })
  })

  it('calculates age for the selected past day without claiming current height or clinical status was historical', () => {
    const rows = evidence({ asOf: '2020-06-09', question: 'How old was I and how tall?' })
    expect(rows.find((r) => r.id === 'profile.age_years_as_of')?.value).toBe(24)
    expect(rows.find((r) => r.id === 'profile.date_of_birth')?.text).toContain('not proof the profile was saved')
    expect(rows.find((r) => r.id === 'profile.height_cm')).toBeUndefined()
    expect(rows.find((r) => r.id === 'clinical.sex_for_physiology')).toBeUndefined()
    expect(rows.find((r) => r.id === 'clinical.persistent_context')).toBeUndefined()
  })

  it('does not project a present owner profile into a day before birth or in the future', () => {
    const before = evidence({ asOf: '1995-06-09', question: 'What was my age?' })
    expect(before.some((r) => r.id.startsWith('profile.'))).toBe(false)
    const future = evidence({ asOf: '2026-10-16', question: 'How old am I?' })
    expect(future.some((r) => r.id.startsWith('profile.'))).toBe(false)
  })

  it('keeps stable profile facts out of unrelated general-education queries', () => {
    const rows = evidence({ asOf: '2026-10-15', question: 'What causes headaches in general?' })
    expect(rows.some((r) => r.id.startsWith('profile.'))).toBe(false)
  })

  it('never fabricates a birth date, an age, or a height when settings are unset', () => {
    const unset = { ...original, dateOfBirth: null, heightCm: null }
    const rows = evidence({ asOf: '2026-10-15', question: 'What is my height and age?', profile: unset })
    expect(rows.some((r) => r.id.startsWith('profile.'))).toBe(false)
  })

  it('uses calendar birthdays rather than current-age snapshots, including prior to a birthday', () => {
    const prior = evidence({ asOf: '2026-06-09', question: 'What was my age?' })
    const after = evidence({ asOf: '2026-06-10', question: 'What was my age?' })
    expect(prior.find((r) => r.id === 'profile.age_years_as_of')?.value).toBe(30)
    expect(after.find((r) => r.id === 'profile.age_years_as_of')?.value).toBe(31)
  })
})
