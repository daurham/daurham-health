import { describe, expect, it } from 'vitest'
import { nutritionDayQuality } from '../src/domain/nutrition/quality.js'
import { dayCompletenessDisplay } from '../src/features/nutrition/DayCompletenessCard.js'
import type { NutritionCompletenessStatus } from '../src/features/nutrition/api.js'

function fixture(
  assessment: Partial<NutritionCompletenessStatus['assessment']> = {},
  report: NutritionCompletenessStatus['ownerReport'] = null,
): NutritionCompletenessStatus {
  return {
    date: '2026-10-13', today: '2026-10-14', entryRevision: 'a'.repeat(64),
    version: report == null ? 0 : 1, ownerReport: report,
    quality: nutritionDayQuality([{ calories: 600, evidenceQuality: 'measured_reference' }]),
    assessment: { state: 'unknown', eligibleForMaintenance: false,
      currentDayProvisional: false, confirmationStale: false,
      isExplicitZeroIntakeFast: false, reason: 'no_confirmation',
      maintenanceExclusion: 'unconfirmed_completeness', ...assessment },
  }
}

describe('PIQ-1.1 optional Nutrition review display', () => {
  it('does not infer full day from accurate source', () => {
    expect(dayCompletenessDisplay(fixture()).label).toBe('Not reviewed')
  })
  it('calls out stale confirmation after an edit', () => {
    expect(dayCompletenessDisplay(fixture({ confirmationStale: true }, 'complete')).label)
      .toBe('Needs re-confirmation')
  })
  it('separates explicit partial reports', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'partial' }, 'partial')).label)
      .toBe('Partially logged')
  })
  it('notes today is provisional', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'confirmed_complete',
      currentDayProvisional: true }, 'complete')).label).toBe('Confirmed for now')
  })
  it('does not count fasts as observed maintenance', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'confirmed_complete',
      isExplicitZeroIntakeFast: true }, 'complete')).detail).toContain('not used')
  })
  it('identifies complete but ineligible quality', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'confirmed_complete',
      eligibleForMaintenance: false }, 'complete')).label)
      .toBe('Complete, not calibration-eligible')
  })
  it('uses owner report language without implying measured intake', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'confirmed_complete',
      eligibleForMaintenance: true, maintenanceExclusion: null }, 'complete')).detail)
      .toContain('reported')
  })
})
