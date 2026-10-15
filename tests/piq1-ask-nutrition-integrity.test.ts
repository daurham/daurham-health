import { describe, expect, it } from 'vitest'
import { buildAskHealthEvidencePacket } from '../src/domain/ask-health/packet.js'
import { ASK_HEALTH_SYSTEM_PROMPT } from '../src/domain/ask-health/prompt.js'
import {
  askNutritionIntegrityFromSnapshot, MIN_VERIFIED_NUTRITION_TARGET_DAYS,
} from '../src/domain/ask-health/nutrition-integrity.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { nutritionPeriodSummary } from '../src/domain/progress/nutrition.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import type { NutritionEntry, NutritionTarget } from '../src/domain/nutrition/types.js'

const first = '2026-10-01'
const today = '2026-10-15'
const days = Array.from({ length: 14 }, (_, i) => addCalendarDays(first, i))

function entry(date: string, calories: number, id = date): NutritionEntry {
  return {
    id, logDate: date, consumedAt: null, timezone: 'America/Phoenix',
    meal: null, foodId: null, foodName: 'Synthetic meal', brand: null,
    servingQuantity: 1, servingUnit: 'serving', grams: null,
    calories, protein: 40, carbs: 80, fat: 20, fiber: null,
    sourceKind: 'manual', notes: null, mealGroupId: null,
    createdAt: date + 'T12:00:00.000Z', updatedAt: date + 'T12:00:00.000Z',
  }
}

const target: NutritionTarget = {
  id: 'test-target', effectiveFrom: '2026-09-01', caloriesTarget: 2000,
  proteinTarget: 150, carbsTarget: null, fatTarget: null,
  fiberTarget: null, sodiumTarget: null,
  createdAt: '2026-09-01T12:00:00.000Z', updatedAt: '2026-09-01T12:00:00.000Z',
}

const canonical = days.map((date, index) => entry(date, 600 + index * 10))

function summary(entries = canonical) {
  return nutritionPeriodSummary({ entries, targets: [target], start: first, end: today })
}
function snapshot(verified?: ReadonlySet<string>, opts: { entries?: NutritionEntry[]; today?: string } = {}) {
  const observations: IntelligenceObservation[] = (opts.entries ?? canonical).map((e) => ({
    key: 'nutrition.calories', date: e.logDate, value: e.calories, unit: 'kcal',
    provenance: 'owner', quality: 'high_confidence', sourceIds: [e.id],
  }))
  return buildHealthIntelligenceSnapshot({
    range: '30d', asOf: today, start: first, end: today,
    today: opts.today ?? today, timezone: 'America/Phoenix',
    observations, nutritionVerifiedCompleteDates: verified,
  })
}

function packet(input: {
  entries?: NutritionEntry[]
  verified?: ReadonlySet<string>
  snapshotEntries?: NutritionEntry[]
  skipVerification?: boolean
}) {
  const nutrition = summary(input.entries ?? canonical)
  const intelligence = snapshot(input.skipVerification ? undefined : (input.verified ?? new Set()), {
    entries: input.snapshotEntries,
  })
  const nutritionIntegrity = askNutritionIntegrityFromSnapshot({ nutrition, intelligence, today })
  const data = buildAskHealthEvidencePacket({
    lens: 'nutrition', range: '30d', asOf: today,
    period: { start: first, end: today }, generatedAt: today + 'T20:00:00Z',
    question: 'Am I eating below my target?',
    overview: {
      period: { start: first, end: today, dayCount: 15 },
      nutrition,
    } as never,
    activity: null, sleep: null, goals: [], experiments: [],
    benchmarks: [], supplements: [], context: null, patterns: [],
    nutritionIntegrity,
  })
  return { data, nutritionIntegrity }
}

describe('PIQ-1.1 Ask Health calories-vs-target whole-day integrity', () => {
  it('T03: precise but incomplete one-meal logs cannot generate a numerical calorie deficit', () => {
    const { data, nutritionIntegrity } = packet({})
    expect(nutritionIntegrity).toMatchObject({ status: 'available', verifiedCompleteDays: 0, verifiedTargetDays: 0 })
    expect(data.evidence.some((e) => e.id === 'nutrition.calories_vs_target')).toBe(false)
    const withheld = data.evidence.find((e) => e.id === 'nutrition.calories_target_ineligible')
    expect(withheld).toMatchObject({ value: null, substantive: false })
    expect(withheld?.text).toContain('Do not calculate an energy deficit')
    expect(data.limitations.map((l) => l.code)).toContain('nutrition_target_unverified')
    const logged = data.evidence.find((e) => e.id === 'nutrition.calories')
    expect(logged?.value).toBeCloseTo(665)
    expect(logged?.text).toContain('not proven full-day consumption')
    expect(data.evidence.find((e) => e.id === 'nutrition.coverage')?.coverage)
      .toMatchObject({ loggedDays: 14, verifiedCompleteDays: 0 })
  })

  it('allows a descriptive target comparison from four source-matched confirmed days only', () => {
    const { data, nutritionIntegrity } = packet({ verified: new Set(days.slice(0, MIN_VERIFIED_NUTRITION_TARGET_DAYS)) })
    expect(nutritionIntegrity).toMatchObject({
      verifiedCompleteDays: 4, verifiedTargetDays: 4,
      verifiedAverageTargetDifference: -1385,
    })
    const evidence = data.evidence.find((e) => e.id === 'nutrition.calories_vs_target')
    expect(evidence).toMatchObject({ value: -1385, substantive: true })
    expect(evidence?.text).toContain('4 owner-confirmed complete')
    expect(evidence?.text).toContain('does not prove a physiological energy deficit')
    expect(data.evidence.find((e) => e.id === 'nutrition.calories_target_ineligible')).toBeUndefined()
  })

  it('does not silently include a third unverified food day even if the diary has configured targets', () => {
    const { data, nutritionIntegrity } = packet({ verified: new Set(days.slice(0, 3)) })
    expect(nutritionIntegrity.verifiedTargetDays).toBe(3)
    expect(data.evidence.find((e) => e.id === 'nutrition.calories_vs_target')).toBeUndefined()
  })

  it('stale food quantity or entry-ID edits invalidate the matched confirmation', () => {
    const updated = canonical.map((e, i) => i === 0 ? { ...e, calories: e.calories + 100 } : e)
    const changedId = canonical.map((e, i) => i === 1 ? { ...e, id: e.id + '-changed' } : e)
    const verified = new Set(days.slice(0, 4))
    expect(packet({ entries: updated, verified }).nutritionIntegrity.verifiedCompleteDays).toBe(3)
    expect(packet({ entries: changedId, verified }).nutritionIntegrity.verifiedCompleteDays).toBe(3)
    expect(packet({ entries: updated, verified }).data.evidence.some((e) => e.id === 'nutrition.calories_vs_target')).toBe(false)
  })

  it('mismatched snapshot sources never promote unverified or stale days from progress rows', () => {
    const divergent = canonical.map((e, i) => i === 2 ? { ...e, calories: e.calories + 7 } : e)
    const result = packet({ snapshotEntries: divergent, verified: new Set(days.slice(0, 4)) })
    expect(result.nutritionIntegrity.verifiedCompleteDays).toBe(3)
    expect(result.data.evidence.find((e) => e.id === 'nutrition.calories_vs_target')).toBeUndefined()
  })

  it('treats confirmation read failure as unavailable rather than zero owner confirmations', () => {
    const { data, nutritionIntegrity } = packet({ skipVerification: true })
    expect(nutritionIntegrity).toMatchObject({ status: 'unavailable', verifiedCompleteDays: null })
    const coverage = data.evidence.find((e) => e.id === 'nutrition.coverage')
    expect(coverage?.text).toContain('verification is unavailable')
    expect(coverage?.coverage).toMatchObject({ completenessCheck: 'unavailable' })
    expect(coverage?.coverage).not.toHaveProperty('verifiedCompleteDays')
    expect(data.evidence.find((e) => e.id === 'nutrition.calories_vs_target')).toBeUndefined()
  })

  it('never includes a current-day log in verified target inference', () => {
    const current = entry(today, 250, 'today-log')
    const data = packet({
      entries: [...canonical, current],
      snapshotEntries: [...canonical, current],
      verified: new Set([...days.slice(0, 3), today]),
    })
    expect(data.nutritionIntegrity).toMatchObject({ verifiedCompleteDays: 3, verifiedTargetDays: 3 })
    expect(data.data.evidence.find((e) => e.id === 'nutrition.calories_vs_target')).toBeUndefined()
  })

  it('system prompt forbids reconstructing a withheld calorie gap from raw logs', () => {
    expect(ASK_HEALTH_SYSTEM_PROMPT).toContain('never reconstruct it')
    expect(ASK_HEALTH_SYSTEM_PROMPT).toContain('Food logs are quantities recorded')
  })
})
