import { describe, expect, it } from 'vitest'
import type { DailyContext } from '../src/domain/context.ts'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.ts'
import {
  buildMaintenanceState,
  KCAL_PER_KG_BODY_MASS_CHANGE,
  type MaintenanceWeightGoal,
} from '../src/domain/maintenance.ts'
import { addCalendarDays } from '../src/domain/training-plan.ts'

const AS_OF = '2026-10-08'
const START = '2026-09-09'

const UNITS: Record<IntelligenceObservation['key'], string> = {
  'activity.steps': 'steps',
  'activity.active_energy_kcal': 'kcal',
  'activity.exercise_minutes': 'min',
  'sleep.total_minutes': 'min',
  'nutrition.calories': 'kcal',
  'nutrition.protein_g': 'g',
  'nutrition.carbs_g': 'g',
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

function obs(
  key: IntelligenceObservation['key'],
  date: string,
  value: number,
  options: Partial<IntelligenceObservation> = {},
): IntelligenceObservation {
  return {
    key,
    date,
    value,
    unit: UNITS[key],
    provenance: key === 'body.weight_kg' ? 'owner' : 'reference',
    sourceIds: [],
    ...options,
  }
}

function snapshot(observations: IntelligenceObservation[]) {
  return buildHealthIntelligenceSnapshot({
    range: '30d',
    asOf: AS_OF,
    start: START,
    end: AS_OF,
    timezone: 'America/Phoenix',
    today: AS_OF,
    observations,
  })
}

function loseGoal(): MaintenanceWeightGoal {
  return {
    goalId: 'goal-weight',
    goalVersionId: 'goal-version-weight',
    label: 'Bodyweight',
    targetState: 'unmet',
    direction: 'lose',
  }
}

function context(date: string, tags: DailyContext['tags']): DailyContext {
  return {
    id: 'context-' + date,
    contextDate: date,
    tags,
    note: null,
    createdAt: date + 'T12:00:00.000Z',
    updatedAt: date + 'T12:00:00.000Z',
  }
}

function completeSeries(input: {
  intake?: number
  weightStart?: number
  weightDeltaPerDay?: number
  calorieQuality?: IntelligenceObservation['quality']
  bodyQuality?: IntelligenceObservation['quality']
} = {}): IntelligenceObservation[] {
  const intake = input.intake ?? 2000
  const weightStart = input.weightStart ?? 85
  const weightDelta = input.weightDeltaPerDay ?? 0
  const observations: IntelligenceObservation[] = []
  for (let offset = 0; offset < 28; offset += 1) {
    const date = addCalendarDays('2026-09-10', offset)
    observations.push(obs('nutrition.calories', date, intake, {
      quality: input.calorieQuality ?? 'high_confidence',
      provenance: 'reference',
    }))
    observations.push(obs('body.weight_kg', date, weightStart + weightDelta * offset, {
      quality: input.bodyQuality ?? 'usual',
      provenance: 'owner',
    }))
  }
  return observations
}

describe('I7 observed maintenance estimator', () => {
  it('combines robust intake with Theil-Sen weight change to estimate observed maintenance', () => {
    const weightDeltaPerDay = -0.05
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(completeSeries({ intake: 2000, weightDeltaPerDay })),
      contexts: [],
      weightGoal: loseGoal(),
    })
    const expected = 2000 - weightDeltaPerDay * KCAL_PER_KG_BODY_MASS_CHANGE
    expect(state.estimate.state).toBe('available')
    expect(state.estimate.period?.days).toBe(28)
    expect(state.estimate.averageIntakeKcal).toBe(2000)
    expect(Math.abs((state.estimate.observedMaintenanceKcal ?? 0) - expected)).toBeLessThan(2)
    expect(state.estimate.confidence).toBe('high')
    expect(state.plateau.state).toBe('trend_in_goal_direction')
    expect(state.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('withholds the estimate when calorie quality and weigh-in comparability are inadequate', () => {
    const observations = completeSeries({
      calorieQuality: 'estimate_heavy',
      bodyQuality: 'different_conditions',
    })
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(observations),
      contexts: [],
      weightGoal: loseGoal(),
    })
    expect(state.estimate.state).toBe('insufficient_evidence')
    expect(state.estimate.observedMaintenanceKcal).toBeNull()
    expect(state.estimate.quality.nutrition.state).toBe('insufficient')
    expect(state.estimate.quality.body.state).toBe('insufficient')
    expect(state.plateau.state).toBe('insufficient_evidence')
    expect(state.interventions.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['improve_nutrition_evidence', 'improve_weigh_in_consistency']),
    )
  })

  it('calls a multi-week flat trend a likely plateau only with an unmet directional weight goal', () => {
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(completeSeries({ intake: 2100, weightDeltaPerDay: 0 })),
      contexts: [],
      weightGoal: loseGoal(),
    })
    expect(state.estimate.state).toBe('available')
    expect(state.estimate.observedMaintenanceKcal).toBe(2100)
    expect(state.plateau.state).toBe('plateau_likely')
    const intake = state.interventions.find((item) => item.kind === 'review_intake_adjustment')
    expect(intake?.priority).toBe('primary')
    expect(intake?.suggestedDeltaKcal).toBeLessThan(0)
    expect(Math.abs(intake?.suggestedDeltaKcal ?? 0)).toBeGreaterThanOrEqual(100)
    expect(Math.abs(intake?.suggestedDeltaKcal ?? 0)).toBeLessThanOrEqual(250)
    expect(intake?.detail).toContain('not an automatic target change')
  })

  it('treats the same flat evidence as stability when there is no unmet directional weight goal', () => {
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(completeSeries({ intake: 2100, weightDeltaPerDay: 0 })),
      contexts: [],
      weightGoal: null,
    })
    expect(state.plateau.state).toBe('stable_at_maintenance')
    expect(state.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })
})

  it('excludes the current incomplete day from observed-maintenance math', () => {
    const observations = completeSeries({ intake: 2000, weightDeltaPerDay: 0 })
    observations.push(obs('nutrition.calories', AS_OF, 9000, { quality: 'high_confidence', provenance: 'reference' }))
    observations.push(obs('body.weight_kg', AS_OF, 95, { quality: 'usual', provenance: 'owner' }))
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(observations),
      contexts: [],
      weightGoal: loseGoal(),
    })
    expect(state.completeThrough).toBe('2026-10-07')
    expect(state.estimate.averageIntakeKcal).toBe(2000)
    expect(state.estimate.latestWeightKg).toBeCloseTo(85)
  })

describe('I7 short-term scale-noise context', () => {
  it('uses sodium, carbs, logged water, bowel and Daily Context as non-causal reasons to defer a plateau call', () => {
    const observations: IntelligenceObservation[] = []
    const start = '2026-09-24'
    for (let offset = 0; offset < 14; offset += 1) {
      const date = addCalendarDays(start, offset)
      if (offset >= 4) {
        observations.push(obs('nutrition.calories', date, 2000, { quality: 'high_confidence' }))
      }
      if ([0, 3, 6, 9, 12].includes(offset)) {
        observations.push(obs('body.weight_kg', date, 85, { quality: 'usual' }))
      }
      if (offset < 11) {
        observations.push(obs('nutrition.sodium_mg', date, 1800, { quality: 'high_confidence' }))
        observations.push(obs('nutrition.carbs_g', date, 150, { quality: 'high_confidence' }))
        observations.push(obs('hydration.ml', date, 1800))
        observations.push(obs('bowel.count', date, 1))
      } else {
        observations.push(obs('nutrition.sodium_mg', date, 2800, { quality: 'high_confidence' }))
        observations.push(obs('nutrition.carbs_g', date, 230, { quality: 'high_confidence' }))
        observations.push(obs('hydration.ml', date, 2600))
        observations.push(obs('bowel.count', date, 0))
      }
    }
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(observations),
      contexts: [context('2026-10-06', ['late_meal']), context('2026-10-07', ['unusual_stress'])],
      weightGoal: loseGoal(),
    })
    expect(state.estimate.state).toBe('available')
    expect(state.estimate.period?.days).toBe(14)
    expect(state.noiseFactors.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['sodium', 'carbohydrate', 'hydration', 'bowel', 'context']),
    )
    expect(state.noiseFactors.every((item) => /not proof|not fat-mass|not total hydration|does not infer|without assigning causality/i.test(item.detail))).toBe(true)
    expect(state.plateau.state).toBe('noise_obscured')
    expect(state.interventions.find((item) => item.kind === 'hold_course')?.title).toContain('Hold')
    expect(state.calibration.eligible).toBe(true)
  })

  it('suggests a calibration observation for uncertain plateau evidence without changing targets', () => {
    const observations = completeSeries({ intake: 2050, weightDeltaPerDay: 0 }).filter((item) => {
      if (item.key === 'nutrition.calories') {
        const day = Number(item.date.slice(-2))
        return day % 2 === 0 || day % 3 === 0
      }
      return true
    })
    const state = buildMaintenanceState({
      asOf: AS_OF,
      today: AS_OF,
      intelligence: snapshot(observations),
      contexts: [],
      weightGoal: loseGoal(),
    })
    expect(state.calibration.title).toBe('Weight-response calibration')
    expect(state.calibration.durationDays).toBe(14)
    expect(state.calibration.requiredNutritionDays).toBe(10)
    expect(state.calibration.requiredWeightMeasurements).toBe(5)
    expect(state.calibration.evidenceRefs).toContain('maintenance:plateau-state')
  })
})
