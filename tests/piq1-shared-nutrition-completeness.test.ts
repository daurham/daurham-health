import { describe, expect, it } from 'vitest'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import {
  buildHealthIntelligenceSnapshot, routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { verifiedNutritionDaysFromRows } from '../server/nutrition/maintenance-eligibility.js'
import type { ChangeLedgerEntry } from '../src/domain/change-ledger.js'

const start = '2026-09-29'
const end = '2026-10-15'
const today = end
const days = Array.from({ length: 14 }, (_, i) => addCalendarDays(start, i))

function observation(
  key: IntelligenceObservation['key'], date: string, value: number,
  unit: string, id = date,
): IntelligenceObservation {
  return { key, date, value, unit, provenance: 'owner', sourceIds: [id],
    ...(key.startsWith('nutrition.') ? { quality: 'high_confidence' } : {}) }
}

const records = days.flatMap((date, i) => [
  observation('nutrition.calories', date, 600 + i * 40, 'kcal'),
  observation('nutrition.fiber_g', date, 5 + i, 'g'),
  observation('bowel.count', date, i + 1, 'count'),
  observation('body.weight_kg', date, 84 + i * 0.01, 'kg'),
])
const change: ChangeLedgerEntry = {
  id: 'synthetic-change', date: '2026-10-06', kind: 'behavior_change',
  title: 'Fictional change', detail: null, sourceKind: 'owner', sourceId: null,
  metadata: {},
}

function snapshot(
  dates?: ReadonlySet<string>,
  opts: { observations?: IntelligenceObservation[], verificationStatus?: 'available' | 'unavailable' } = {},
) {
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: end, start, end, today,
    timezone: 'America/Phoenix', observations: opts.observations ?? records,
    nutritionVerifiedCompleteDates: dates,
    nutritionVerificationStatus: opts.verificationStatus,
    changes: [change],
  })
}

function coverage(s: ReturnType<typeof snapshot>, key: IntelligenceObservation['key']) {
  return s.coverage.find((item) => item.key === key)
}

function baseline(s: ReturnType<typeof snapshot>, key: IntelligenceObservation['key']) {
  return s.baselines.find((item) => item.key === key)
}

describe('PIQ-1.1 Health AI shared nutrition integrity (synthetic only)', () => {
  it('T03: 14 precisely logged one-meal days do not create a full-day calorie baseline or intervention comparison', () => {
    const s = snapshot(new Set())
    expect(coverage(s, 'nutrition.calories')).toMatchObject({
      loggedDays: 14, observedDays: 0, confidence: 'unknown', completenessCheck: 'available',
    })
    expect(baseline(s, 'nutrition.calories')).toMatchObject({
      state: 'insufficient_data', observations: 0, mean: null,
    })
    expect(s.interventions.some((item) => item.signalKey === 'nutrition.calories')).toBe(false)
    expect(s.frame.find((day) => day.date === start)?.signals['nutrition.calories'])
      .toMatchObject({ value: 600, quality: 'high_confidence', dayCompleteness: 'unverified' })
    // Independently observed weight and bowel evidence is not erased.
    expect(coverage(s, 'body.weight_kg')?.observedDays).toBe(14)
    expect(coverage(s, 'bowel.count')?.observedDays).toBe(14)
  })

  it('T12: unknown fiber days never create a personal fiber/bowel association', () => {
    const s = snapshot(new Set())
    const relationship = s.relationships.find((item) => item.id === 'shared:fiber:bowel:same_day')
    expect(relationship).toMatchObject({ state: 'insufficient_data', sampleSize: 0, rho: null })
    expect(coverage(s, 'nutrition.fiber_g')?.loggedDays).toBe(14)
    expect(coverage(s, 'nutrition.fiber_g')?.observedDays).toBe(0)
  })

  it('counts only revision-verified dates for baselines, relationships and before/after comparisons', () => {
    const s = snapshot(new Set(days))
    expect(coverage(s, 'nutrition.calories')).toMatchObject({ loggedDays: 14, observedDays: 14 })
    expect(baseline(s, 'nutrition.calories')).toMatchObject({ state: 'available', observations: 14 })
    expect(s.relationships.find((item) => item.id === 'shared:fiber:bowel:same_day'))
      .toMatchObject({ state: 'available', sampleSize: 14 })
    const comparison = s.interventions.find((item) => item.signalKey === 'nutrition.calories')
    expect(comparison).toMatchObject({ beforeN: 7, afterN: 7 })
    expect(s.frame.find((day) => day.date === start)?.signals['nutrition.calories']?.dayCompleteness)
      .toBe('verified_complete')
  })

  it('partial confirmation never rounds unverified days into sufficient evidence', () => {
    const s = snapshot(new Set(days.slice(0, 4)))
    expect(baseline(s, 'nutrition.calories')).toMatchObject({ state: 'insufficient_data', observations: 4 })
    expect(s.relationships.find((item) => item.id === 'shared:fiber:bowel:same_day'))
      .toMatchObject({ state: 'insufficient_data', sampleSize: 4 })
    expect(s.interventions.some((item) => item.signalKey === 'nutrition.calories')).toBe(false)
    expect(coverage(s, 'nutrition.calories')?.loggedDays).toBe(14)
  })

  it('provisional today remains excluded even if mistakenly supplied among verified dates', () => {
    const todayLog = observation('nutrition.calories', today, 1200, 'kcal', 'provisional')
    const s = snapshot(new Set([...days, today]), { observations: [...records, todayLog] })
    expect(coverage(s, 'nutrition.calories')).toMatchObject({ observedDays: 14, loggedDays: 14 })
    expect(baseline(s, 'nutrition.calories')?.observations).toBe(14)
    expect(s.frame.find((day) => day.date === today)?.signals['nutrition.calories']?.value).toBe(1200)
  })

  it('preserves raw facts in Ask Health but labels logs, verified days and verification failure separately', () => {
    const s = snapshot(new Set(), { verificationStatus: 'unavailable' })
    const intelligence = routeHealthIntelligence(s, { lens: 'nutrition', question: 'How has my calorie intake changed?' })
    const packet = buildAskHealthEvidencePacket({
      lens: 'nutrition', range: '30d', asOf: end, period: { start, end },
      generatedAt: '2026-10-15T15:00:00Z',
      question: 'How has my calorie intake changed?', overview: null, activity: null, sleep: null,
      goals: [], experiments: [], benchmarks: [], supplements: [], context: null, patterns: [],
      intelligence,
    })
    const nutrient = packet.evidence.find((item) => item.id === 'intelligence.coverage.nutrition.calories')
    expect(nutrient?.text).toContain('14 logged day(s)')
    expect(nutrient?.text).toContain('0 owner-confirmed')
    expect(nutrient?.text).toContain('verification is currently unavailable')
    expect(nutrient?.coverage).toMatchObject({ loggedDays: 14, observedDays: 0 })
    expect(nutrient?.substantive).toBe(true)
    expect(packet.evidence.some((item) => item.id === 'intelligence.baseline.nutrition.calories')).toBe(false)
  })

  it('does not grant day-completeness solely from an accurate source or matching calorie sum', () => {
    const provisional = snapshot()
    const candidate = [{
      date: start, calories: 600, source_ids: [start],
    }]
    // The SQL query must independently enforce confirmed report + revision +
    // provenance; this pure checker only cross-checks preloaded canonical facts.
    expect(verifiedNutritionDaysFromRows(candidate, provisional).has(start)).toBe(true)
    expect(verifiedNutritionDaysFromRows([{ ...candidate[0]!, source_ids: ['other'] }], provisional).size).toBe(0)
    expect(verifiedNutritionDaysFromRows([{ ...candidate[0]!, calories: 650 }], provisional).size).toBe(0)
    const verified = snapshot(new Set())
    expect(baseline(verified, 'nutrition.calories')?.state).toBe('insufficient_data')
  })
})
