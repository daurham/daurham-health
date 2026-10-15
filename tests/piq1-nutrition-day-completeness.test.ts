import { describe, expect, it } from 'vitest'
import { assessNutritionDayCompleteness, summarizeNutritionCompleteness } from '../src/domain/nutrition/day-completeness.js'
import { nutritionDayQuality, type NutritionQualityEntry } from '../src/domain/nutrition/quality.js'

function assess(input: {
  date?: string
  today?: string | null
  entries?: NutritionQualityEntry[]
  confirmation?: { state: 'complete' | 'partial' | 'unknown'; entryRevision: string; zeroIntakeFast?: boolean } | null
  revision?: string
  excluded?: boolean
} = {}) {
  return assessNutritionDayCompleteness({
    date: input.date ?? '2026-10-13',
    today: input.today === undefined ? '2026-10-14' : input.today,
    quality: nutritionDayQuality(input.entries ?? [{ calories: 600, evidenceQuality: 'measured_reference' }]),
    entryRevision: input.revision ?? 'synthetic-v1',
    confirmation: input.confirmation ?? null,
    excludedFromAnalysis: input.excluded ?? false,
  })
}
const complete = { state: 'complete' as const, entryRevision: 'synthetic-v1' }

describe('PIQ-1.1 nutrition completeness is separate from source quality', () => {
  it('T03: a precisely measured single 600-kcal meal is not evidence of a complete day', () => {
    expect(nutritionDayQuality([{ calories: 600, evidenceQuality: 'measured_reference' }]).kind).toBe('high_confidence')
    expect(assess()).toMatchObject({
      state: 'unknown', eligibleForMaintenance: false,
      maintenanceExclusion: 'unconfirmed_completeness',
    })
  })

  it('three precise logged meals do not automatically establish complete daily intake', () => {
    const day = assess({ entries: [
      { calories: 450, evidenceQuality: 'owner_entered' },
      { calories: 550, evidenceQuality: 'measured_reference' },
      { calories: 600, evidenceQuality: 'measured_reference' },
    ] })
    expect(day.state).toBe('unknown')
    expect(day.eligibleForMaintenance).toBe(false)
  })

  it('a past day with matched owner confirmation and quality entries can qualify', () => {
    expect(assess({ confirmation: complete })).toMatchObject({
      state: 'confirmed_complete', reason: 'confirmed',
      eligibleForMaintenance: true, maintenanceExclusion: null,
    })
  })

  it('reported partial or uncertainty stays distinct and both are excluded', () => {
    expect(assess({ confirmation: { state: 'partial', entryRevision: 'synthetic-v1' } })).toMatchObject({
      state: 'partial', eligibleForMaintenance: false,
    })
    expect(assess({ confirmation: { state: 'unknown', entryRevision: 'synthetic-v1' } })).toMatchObject({
      state: 'unknown', eligibleForMaintenance: false,
    })
  })

  it('a corrected or deleted food makes a previously completed day unconfirmed', () => {
    expect(assess({ confirmation: complete, revision: 'synthetic-v2' })).toMatchObject({
      state: 'unknown', confirmationStale: true,
      eligibleForMaintenance: false, maintenanceExclusion: 'stale_confirmation',
    })
  })

  it('today is provisional even if owner is done eating and marks it complete', () => {
    expect(assess({ date: '2026-10-14', confirmation: complete })).toMatchObject({
      state: 'confirmed_complete', currentDayProvisional: true,
      eligibleForMaintenance: false, maintenanceExclusion: 'current_day',
    })
  })

  it('future dates and missing instance-local day never qualify', () => {
    expect(assess({ date: '2026-10-15', confirmation: complete }).eligibleForMaintenance).toBe(false)
    expect(assess({ today: null, confirmation: complete })).toMatchObject({
      eligibleForMaintenance: false, maintenanceExclusion: 'unknown_local_date',
    })
  })

  it('a blank day cannot be completed without an explicit zero-intake fast report', () => {
    expect(assess({ entries: [], confirmation: complete })).toMatchObject({
      state: 'unknown', reason: 'empty_day_requires_fast_confirmation',
      eligibleForMaintenance: false,
    })
  })

  it('an explicit full-day fast is not erased but does not imply a maintenance intake baseline', () => {
    expect(assess({ entries: [], confirmation: { ...complete, zeroIntakeFast: true } })).toMatchObject({
      state: 'confirmed_complete', isExplicitZeroIntakeFast: true,
      eligibleForMaintenance: false, maintenanceExclusion: 'zero_or_unusual_intake',
    })
  })

  it('AI-heavy and unknown-source days remain logged but cannot be reliable calorie-inference days', () => {
    for (const entries of [
      [{ calories: 1400, evidenceQuality: 'ai_estimate' as const }],
      [{ calories: 1400, evidenceQuality: 'legacy_unknown' as const }],
    ]) {
      const result = assess({ confirmation: complete, entries })
      expect(result.state).toBe('confirmed_complete')
      expect(result.eligibleForMaintenance).toBe(false)
      expect(result.maintenanceExclusion).toBe('source_quality')
    }
  })

  it('an analysis-excluded day stays excluded despite matching complete confirmation', () => {
    expect(assess({ confirmation: complete, excluded: true })).toMatchObject({
      state: 'confirmed_complete', eligibleForMaintenance: false,
      maintenanceExclusion: 'excluded_from_analysis',
    })
  })

  it('even 2400 kcal accurately logged never sets probably_complete automatically', () => {
    const day = assess({ entries: [{ calories: 2400, evidenceQuality: 'measured_reference' }] })
    expect(day.state).toBe('unknown')
    expect(day.state).not.toBe('probably_complete')
  })

  it('confirmation bound to a missing revision cannot quietly match', () => {
    expect(assess({ revision: '', confirmation: { ...complete, entryRevision: '' } })).toMatchObject({
      state: 'unknown', confirmationStale: true, eligibleForMaintenance: false,
    })
  })

  it('counts unknown and partial calendar days rather than just food-entry days', () => {
    const result = summarizeNutritionCompleteness([
      assess({ confirmation: complete }),
      assess({ confirmation: { state: 'partial', entryRevision: 'synthetic-v1' } }),
      assess({ entries: [] }),
      assess({ entries: [], confirmation: { ...complete, zeroIntakeFast: true } }),
      assess({ date: '2026-10-14', confirmation: complete }),
    ])
    expect(result).toEqual({
      calendarDays: 5, confirmedDays: 3, completeAndReliableDays: 1,
      partialDays: 1, unknownDays: 1, probablyCompleteDays: 0,
    })
  })

  it('source accuracy remains high following an edit, but owner completeness must be renewed', () => {
    const revised = assess({
      entries: [{ calories: 750, evidenceQuality: 'measured_reference' }],
      revision: 'synthetic-v2', confirmation: complete,
    })
    expect(revised.state).toBe('unknown')
    expect(revised.eligibleForMaintenance).toBe(false)
    expect(nutritionDayQuality([{ calories: 750, evidenceQuality: 'measured_reference' }]).kind).toBe('high_confidence')
  })
})
