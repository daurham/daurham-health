import { describe, expect, it } from 'vitest'
import {
  ageYearsOnDate,
  centimetersToInches,
  healthProfileInputSchema,
  inchesToCentimeters,
} from '../src/domain/health-profile.ts'

describe('Health Profile domain', () => {
  it('derives age on either side of the birthday boundary', () => {
    expect(ageYearsOnDate('1995-10-07', '2026-10-06')).toBe(30)
    expect(ageYearsOnDate('1995-10-07', '2026-10-07')).toBe(31)
  })

  it('rejects an as-of date before birth', () => {
    expect(() => ageYearsOnDate('2026-10-07', '2026-10-06')).toThrow()
  })

  it('round-trips owner-facing height units', () => {
    const cm = inchesToCentimeters(70)
    expect(cm).toBeCloseTo(177.8, 5)
    expect(centimetersToInches(cm)).toBeCloseTo(70, 5)
  })

  it('distinguishes omitted clinical arrays from an explicit clear', () => {
    const omitted = healthProfileInputSchema.parse({})
    const cleared = healthProfileInputSchema.parse({
      clinicalConditions: [],
      clinicalAllergies: [],
      clinicalMedications: [],
    })
    expect(omitted.clinicalConditions).toBeUndefined()
    expect(omitted.clinicalAllergies).toBeUndefined()
    expect(omitted.clinicalMedications).toBeUndefined()
    expect(cleared.clinicalConditions).toEqual([])
    expect(cleared.clinicalAllergies).toEqual([])
    expect(cleared.clinicalMedications).toEqual([])
  })
})
