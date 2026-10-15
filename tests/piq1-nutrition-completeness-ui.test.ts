import { describe, expect, it } from 'vitest'
import { nutritionDayQuality } from '../src/domain/nutrition/quality.js'
import { dayCompletenessDisplay, isCurrentCompletenessView, localEntriesKey } from '../src/features/nutrition/DayCompletenessCard.js'
import type { NutritionEntry } from '../src/domain/nutrition/index.js'
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
  it('invalidates an earlier review synchronously when a food edit changes source data', () => {
    const first = [{ id: 'food-1', calories: 600, protein: 22, fiber: 2,
      updatedAt: '2026-10-14T12:00:00.000Z' }] as NutritionEntry[]
    const firstKey = localEntriesKey(first)
    expect(isCurrentCompletenessView(firstKey, firstKey)).toBe(true)
    const edited = [{ ...first[0], protein: 35, fiber: 9 }]
    const newKey = localEntriesKey(edited)
    expect(newKey).not.toBe(firstKey)
    expect(isCurrentCompletenessView(firstKey, newKey)).toBe(false)
    // The old confirmed label/submit control cannot render before the fetch effect runs.
  })

  it('invalidates for food identity, notes, source quality, excluded-day reordering, and edits without timestamp change', () => {
    const source = [{ id: 'item', calories: 500, protein: 40, notes: 'before',
      evidenceQuality: 'measured_reference', updatedAt: '2026-10-14T12:00:00Z' }] as NutritionEntry[]
    const baseline = localEntriesKey(source)
    expect(localEntriesKey([{ ...source[0], notes: 'after' }])).not.toBe(baseline)
    expect(localEntriesKey([{ ...source[0], evidenceQuality: 'ai_estimate' }])).not.toBe(baseline)
    expect(localEntriesKey([{ ...source[0], calories: 501 }])).not.toBe(baseline)
    expect(localEntriesKey([{ ...source[0], foodName: 'Other' }])).not.toBe(baseline)
    expect(localEntriesKey([])).not.toBe(baseline)
  })

  it('is stable across the same entries sorted in a different order', () => {
    const a = { id: 'a', calories: 100 } as NutritionEntry
    const b = { id: 'b', calories: 200 } as NutritionEntry
    expect(localEntriesKey([a, b])).toBe(localEntriesKey([b, a]))
  })

  it('uses owner report language without implying measured intake', () => {
    expect(dayCompletenessDisplay(fixture({ state: 'confirmed_complete',
      eligibleForMaintenance: true, maintenanceExclusion: null }, 'complete')).detail)
      .toContain('reported')
  })
})
