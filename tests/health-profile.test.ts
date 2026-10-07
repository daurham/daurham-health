import { describe, expect, it } from 'vitest'
import {
  ageYearsOnDate,
  centimetersToInches,
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
})
