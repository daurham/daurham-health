import { describe, expect, it } from 'vitest'
import { buildGoalControlState } from '../src/domain/goal-control.ts'
import { buildHealthIntelligenceSnapshot, routeHealthIntelligence } from '../src/domain/intelligence/shared.ts'
import type { MaintenanceState } from '../src/domain/maintenance.ts'
import type { WeeklyCoachBrief, WeeklyGoalSnapshot } from '../src/domain/weekly-coach/types.ts'

function intelligence() {
  return buildHealthIntelligenceSnapshot({
    range: '30d',
    asOf: '2026-10-08',
    start: '2026-09-09',
    end: '2026-10-08',
    timezone: 'America/Phoenix',
    today: '2026-10-08',
    observations: [],
  })
}

function brief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1',
    asOf: '2026-10-08',
    period: { start: '2026-10-01', end: '2026-10-07' },
    previousPeriod: { start: '2026-09-24', end: '2026-09-30' },
    state: 'deterministic',
    canGenerate: true,
    coverage: {
      activity: true,
      sleep: true,
      nutrition: true,
      training: true,
      supplements: false,
      body: true,
      substantiveDomains: ['activity', 'sleep', 'nutrition', 'training'],
    },
    facts: [],
    wentWell: [],
    worthWatching: [],
    focus: null,
    candidates: [],
  }
}

function maintenance(goalUnmet: boolean): MaintenanceState {
  return {
    version: 'maintenance-engine-v1',
    asOf: '2026-10-08',
    completeThrough: '2026-10-07',
    estimate: {
      state: 'insufficient_evidence',
      period: null,
      averageIntakeKcal: null,
      observedMaintenanceKcal: null,
      rangeLowKcal: null,
      rangeHighKcal: null,
      weightSlopeKgPerWeek: null,
      weightSlopePctPerWeek: null,
      latestWeightKg: null,
      confidence: 'limited',
      quality: {
        nutrition: {
          state: 'insufficient',
          reliableDays: 5,
          highConfidenceDays: 5,
          estimateHeavyDays: 0,
          unknownDays: 0,
          calendarDays: 28,
          coveragePct: 18,
        },
        body: {
          state: 'limited',
          usedMeasurements: 4,
          usualMeasurements: 4,
          unknownMeasurements: 0,
          differentConditionMeasurements: 0,
          spanDays: 10,
        },
      },
      explanation: 'More evidence is needed.',
    },
    plateau: {
      state: 'insufficient_evidence',
      headline: 'Not enough evidence to classify a plateau',
      detail: 'More evidence is needed.',
      goalDirection: goalUnmet ? 'lose' : 'unknown',
      goalUnmet,
    },
    noiseFactors: [],
    interventions: [{
      id: 'maintenance:improve-nutrition',
      kind: 'improve_nutrition_evidence',
      priority: 'primary',
      title: 'Improve calorie-log coverage before changing intake',
      detail: 'Collect more evidence first.',
      detailPath: '/nutrition',
      suggestedDeltaKcal: null,
    }],
    calibration: {
      eligible: goalUnmet,
      title: 'Weight-response calibration',
      why: 'More evidence could reduce uncertainty.',
      durationDays: 14,
      requiredNutritionDays: 10,
      requiredWeightMeasurements: 5,
      linkedGoalId: goalUnmet ? 'goal-weight' : null,
      linkedGoalVersionId: goalUnmet ? 'goal-version' : null,
      evidenceRefs: [],
    },
  }
}

const weightGoal: WeeklyGoalSnapshot = {
  id: 'goal-weight',
  label: 'Bodyweight',
  kind: 'body_metric',
  lifecycle: 'active',
  targetState: 'above_target',
  deadlineState: 'projected_before_deadline',
}

describe('I7 Goal Control integration', () => {
  it('does not turn maintenance evidence gaps into a weekly action without an unmet directional weight goal', () => {
    const state = buildGoalControlState({
      asOf: '2026-10-08',
      brief: brief(),
      intelligence: intelligence(),
      goals: [],
      maintenance: maintenance(false),
    })
    expect(state.primaryOpportunity).toBeNull()
    expect(state.state).toBe('maintain')
    expect(state.maintenance?.estimate.state).toBe('insufficient_evidence')
  })

  it('can promote a maintenance evidence gap when it directly serves an unmet directional weight goal', () => {
    const state = buildGoalControlState({
      asOf: '2026-10-08',
      brief: brief(),
      intelligence: intelligence(),
      goals: [weightGoal],
      maintenance: maintenance(true),
    })
    expect(state.state).toBe('act')
    expect(state.primaryOpportunity).toMatchObject({
      id: 'maintenance:improve-nutrition',
      domain: 'nutrition',
      sourceCandidateId: null,
    })
  })

  it('does not promote maintenance action when the weight Goal target state itself is unknown', () => {
    const uncertain = maintenance(true)
    uncertain.plateau.goalUnmet = false
    uncertain.plateau.goalDirection = 'lose'
    const state = buildGoalControlState({
      asOf: '2026-10-08',
      brief: brief(),
      intelligence: intelligence(),
      goals: [{ ...weightGoal, targetState: 'unknown', deadlineState: 'future_no_projection' }],
      maintenance: uncertain,
    })
    expect(state.primaryOpportunity).toBeNull()
    expect(state.state).toBe('insufficient_evidence')
  })

  it('routes scale and carbohydrate questions to the new shared evidence instead of hiding it from Ask Health', () => {
    const snapshot = intelligence()
    const scale = routeHealthIntelligence(snapshot, { question: 'Could carbs or sodium be affecting the scale?', lens: 'general' })
    expect(scale.selectedKeys).toEqual(expect.arrayContaining([
      'body.weight_kg',
      'nutrition.carbs_g',
      'nutrition.sodium_mg',
      'hydration.ml',
    ]))
  })
})
