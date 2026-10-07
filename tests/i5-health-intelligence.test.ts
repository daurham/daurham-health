import { describe, expect, it } from 'vitest'
import {
  buildHealthIntelligenceSnapshot,
  routeHealthIntelligence,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.ts'
import type { ChangeLedgerEntry } from '../src/domain/change-ledger.ts'
import { containsCausalLanguage } from '../src/domain/intelligence/copy.ts'

function obs(
  key: IntelligenceObservation['key'],
  date: string,
  value: number,
  provenance: IntelligenceObservation['provenance'] = 'owner',
): IntelligenceObservation {
  const units: Record<IntelligenceObservation['key'], string> = {
    'activity.steps': 'steps',
    'activity.active_energy_kcal': 'kcal',
    'activity.exercise_minutes': 'min',
    'sleep.total_minutes': 'min',
    'nutrition.calories': 'kcal',
    'nutrition.protein_g': 'g',
    'nutrition.fiber_g': 'g',
    'nutrition.sodium_mg': 'mg',
    'training.sessions': 'sessions',
    'training.effort': '1–5',
    'body.weight_kg': 'kg',
    'hydration.ml': 'ml',
    'bowel.count': 'count',
    'wellness.energy': '1–5',
    'wellness.hunger': '1–5',
    'wellness.soreness': '1–5',
    'wellness.stress': '1–5',
  }
  return { key, date, value, unit: units[key], provenance, sourceIds: [] }
}

function snapshot(
  observations: IntelligenceObservation[],
  input: Partial<Parameters<typeof buildHealthIntelligenceSnapshot>[0]> = {},
) {
  return buildHealthIntelligenceSnapshot({
    range: '30d',
    asOf: '2026-10-12',
    start: '2026-10-01',
    end: '2026-10-12',
    timezone: 'America/Phoenix',
    today: '2026-10-12',
    observations,
    ...input,
  })
}

describe('I5 shared Health Intelligence frame', () => {
  it('preserves missing-vs-zero and only synthesizes completed-day Training zero', () => {
    const built = snapshot([
      obs('training.sessions', '2026-10-02', 1),
      obs('hydration.ml', '2026-10-03', 1500),
      obs('bowel.count', '2026-10-04', 0),
    ])
    const oct1 = built.frame.find((day) => day.date === '2026-10-01')!
    const oct4 = built.frame.find((day) => day.date === '2026-10-04')!
    const today = built.frame.find((day) => day.date === '2026-10-12')!

    expect(oct1.signals['training.sessions']?.value).toBe(0)
    expect(oct1.signals['hydration.ml']).toBeUndefined()
    expect(oct1.signals['bowel.count']).toBeUndefined()
    expect(oct4.signals['bowel.count']?.value).toBe(0)
    expect(today.signals['training.sessions']).toBeUndefined()
  })

  it('keeps current-day complete metrics provisional in coverage', () => {
    const built = snapshot([
      obs('hydration.ml', '2026-10-11', 1800),
      obs('hydration.ml', '2026-10-12', 900),
      obs('activity.steps', '2026-10-11', 8000, 'device'),
      obs('activity.steps', '2026-10-12', 3000, 'device'),
    ])
    expect(built.coverage.find((item) => item.key === 'hydration.ml')).toMatchObject({
      observedDays: 1,
      eligibleDays: 11,
    })
    expect(built.coverage.find((item) => item.key === 'activity.steps')).toMatchObject({
      observedDays: 1,
      eligibleDays: 11,
    })
  })

  it('calculates lagged personal relationships only from paired evidence', () => {
    const observations: IntelligenceObservation[] = []
    for (let day = 1; day <= 11; day += 1) {
      const date = `2026-10-${String(day).padStart(2, '0')}`
      observations.push(obs('hydration.ml', date, 1000 + day * 100))
      if (day > 1) {
        observations.push(obs('bowel.count', date, day))
      }
    }
    const built = snapshot(observations)
    const nextDay = built.relationships.find((item) => item.id === 'shared:hydration:bowel:next_day')!
    expect(nextDay.sampleSize).toBe(10)
    expect(nextDay.state).toBe('available')
    expect(nextDay.rho).toBeCloseTo(1)
    expect(nextDay.summary).toContain('observational, not causal')
    expect(containsCausalLanguage(nextDay.summary)).toBe(false)
  })

  it('carries exclusion counts without recreating excluded observations', () => {
    const built = snapshot(
      [obs('body.weight_kg', '2026-10-03', 85)],
      { excludedObservationCountByKey: { 'body.weight_kg': 2 } },
    )
    expect(built.coverage.find((item) => item.key === 'body.weight_kg')).toMatchObject({
      observedDays: 1,
      excludedObservations: 2,
    })
    expect(built.frame.flatMap((day) => day.signals['body.weight_kg'] ? [day.signals['body.weight_kg']] : [])).toHaveLength(1)
  })

  it('compares intervention windows without making a causal claim', () => {
    const observations: IntelligenceObservation[] = []
    for (let day = 1; day <= 11; day += 1) {
      const date = `2026-10-${String(day).padStart(2, '0')}`
      observations.push(obs('activity.steps', date, day < 6 ? 5000 : 8000, 'device'))
    }
    const change: ChangeLedgerEntry = {
      id: 'nutrition-target:1',
      date: '2026-10-06',
      kind: 'nutrition_target',
      title: 'Nutrition targets changed',
      detail: null,
      sourceKind: 'nutrition_target',
      sourceId: '1',
      metadata: {},
    }
    const built = snapshot(observations, { changes: [change] })
    const comparison = built.interventions.find((item) => item.signalKey === 'activity.steps')!
    expect(comparison.beforeMean).toBe(5000)
    expect(comparison.afterMean).toBe(8000)
    expect(comparison.summary).toContain('descriptive only')
    expect(containsCausalLanguage(comparison.summary)).toBe(false)
  })

  it('never includes observations after the historical as-of boundary', () => {
    const built = buildHealthIntelligenceSnapshot({
      range: '30d',
      asOf: '2026-10-05',
      start: '2026-10-01',
      end: '2026-10-05',
      timezone: 'America/Phoenix',
      today: null,
      observations: [
        obs('body.weight_kg', '2026-10-04', 85),
        obs('body.weight_kg', '2026-10-06', 95),
      ],
    })
    expect(built.frame.flatMap((day) => day.signals['body.weight_kg'] ? [day.signals['body.weight_kg']!.value] : [])).toEqual([85])
    expect(JSON.stringify(built)).not.toContain('95')
  })

  it('routes question-specific evidence instead of sending the entire frame', () => {
    const built = snapshot([
      obs('hydration.ml', '2026-10-01', 1500),
      obs('bowel.count', '2026-10-01', 1),
      obs('body.weight_kg', '2026-10-01', 85),
    ])
    const routed = routeHealthIntelligence(built, {
      question: 'Could my water intake be related to constipation?',
      lens: 'general',
    })
    expect(routed.selectedKeys).toEqual(expect.arrayContaining(['hydration.ml', 'bowel.count']))
    expect(routed.selectedKeys).not.toContain('body.weight_kg')
  })
})
