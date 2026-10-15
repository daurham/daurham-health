import { describe, expect, it } from 'vitest'
import {
  buildHealthIntelligenceSnapshot,
  type IntelligenceObservation,
} from '../src/domain/intelligence/shared.js'
import {
  buildMaintenanceState,
  type MaintenancePhysiologyScreen,
} from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'

const AS_OF = '2026-10-15'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const checked: MaintenancePhysiologyScreen = {
  status: 'available', asOf: AS_OF, ageYears: 31, heightCm: 178,
  activeOrUncertainConditionCount: 0,
}
function scenario(input: {
  physiology?: MaintenancePhysiologyScreen | null
  target?: number
  intake?: number
  weightKg?: number
  source?: 'owner' | 'ai'
} = {}) {
  const intake = input.intake ?? 2400
  const observations: IntelligenceObservation[] = dates.flatMap((date) => [
    {
      key: 'nutrition.calories', date, value: intake, unit: 'kcal',
      quality: 'high_confidence', provenance: input.source ?? 'owner',
      sourceIds: ['meal-' + date],
    },
    {
      key: 'body.weight_kg', date, value: input.weightKg ?? 85, unit: 'kg',
      quality: 'usual', provenance: 'owner', sourceIds: ['scale-' + date],
    },
    {
      key: 'wellness.energy', date, value: 4, unit: '1–5',
      provenance: 'owner', sourceIds: ['wellness-' + date],
    },
  ])
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, today: AS_OF,
    start: '2026-09-16', end: AS_OF, timezone: 'America/Phoenix',
    observations, nutritionVerifiedCompleteDates: new Set(dates),
  })
  const maintenance = buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence, contexts: [],
    eligibleNutritionDates: new Set(dates),
    weightGoal: {
      goalId: 'weight', goalVersionId: 'weight-v1', label: 'Weight',
      targetState: 'unmet', direction: 'lose',
    },
    adjustmentContext: {
      status: 'available', currentCalorieTarget: input.target ?? 2400,
      activeExperimentCount: 0, decisionRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      revisionStatus: 'consistent',
      performance: { status: 'available', asOf: AS_OF, decliningExercises: [], competingGoals: [] },
      physiology: input.physiology === undefined ? checked : input.physiology,
    },
  })
  return { intelligence, maintenance }
}
function blocked(result: ReturnType<typeof scenario>) {
  expect(result.maintenance.estimate.state).toBe('available')
  expect(result.maintenance.plateau.state).toBe('plateau_likely')
  expect(result.maintenance.calorieAdjustmentSafety.status).toBe('blocked')
  expect(result.maintenance.interventions.some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  expect(result.maintenance.interventions.some((item) => item.kind === 'review_activity_adjustment')).toBe(false)
  expect(result.maintenance.evidenceExplanation.calorieDecision.status).toBe('withheld')
}
function brief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: AS_OF,
    period: { start: '2026-10-08', end: '2026-10-14' },
    previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
    state: 'deterministic', canGenerate: true,
    coverage: { activity: false, sleep: false, nutrition: true, training: true, supplements: false, body: true,
      substantiveDomains: ['nutrition', 'training', 'body'] },
    facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
  }
}
describe('PIQ-1.2 conservative physiologic and logged-target screens', () => {
  it('only proposes optional owner review when multiple independent screens pass', () => {
    const { maintenance } = scenario()
    expect(maintenance.estimate.confidence).toBe('high')
    expect(maintenance.calorieAdjustmentSafety.status).toBe('review_possible')
    expect(maintenance.interventions.find((item) => item.kind === 'review_intake_adjustment')?.suggestedDeltaKcal).toBeLessThan(0)
    expect(maintenance.calorieAdjustmentSafety.proposedTargetKcal).toBeGreaterThanOrEqual(maintenance.estimate.rangeLowKcal!)
    expect(maintenance.evidenceExplanation.calorieDecision.detail).toContain('not an individualized medical minimum')
  })

  it('a credible maintenance estimate does not license a cut without age and height', () => {
    for (const physiology of [
      null,
      { ...checked, status: 'unavailable' as const },
      { ...checked, ageYears: null },
      { ...checked, heightCm: null },
      { ...checked, asOf: '2026-10-14' },
    ]) {
      const result = scenario({ physiology })
      blocked(result)
      expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('Current age and height context')
    }
  })

  it('does not give automatic numeric reduction advice to minors or older adults', () => {
    for (const ageYears of [16, 17, 65, 75]) {
      const result = scenario({ physiology: { ...checked, ageYears } })
      blocked(result)
      expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('18–64')
    }
  })

  it('low body mass relative to height is not cleared by a normal-looking maintenance value', () => {
    const result = scenario({ physiology: { ...checked, heightCm: 180 }, weightKg: 48 })
    blocked(result)
    expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('Low or unknown weight relative to height')
  })

  it('reported active or uncertain clinical conditions call for individualized review', () => {
    const result = scenario({ physiology: { ...checked, activeOrUncertainConditionCount: 1 } })
    blocked(result)
    expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('clinical conditions')
  })

  it('a configured target above actual logged intake cannot masquerade as a new calorie reduction', () => {
    const result = scenario({ target: 2600 })
    blocked(result)
    expect(result.maintenance.calorieAdjustmentSafety.proposedTargetKcal).toBeGreaterThanOrEqual(2400)
    expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('already at or below the proposed target')
  })

  it('uncertainty lower-bound screens out another reduction even though the generic floor passes', () => {
    const result = scenario({ target: 2300 })
    blocked(result)
    expect(result.maintenance.calorieAdjustmentSafety.proposedTargetKcal).toBeGreaterThan(result.maintenance.calorieAdjustmentSafety.screeningFloorKcal!)
    expect(result.maintenance.calorieAdjustmentSafety.proposedTargetKcal).toBeLessThan(result.maintenance.estimate.rangeLowKcal!)
    expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('lower edge of the uncertain maintenance estimate')
  })

  it('intake exceeding target by more than 5% suggests adherence review, not a bigger calorie cut', () => {
    const result = scenario({ target: 2200 })
    blocked(result)
    expect(result.maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain('exceeds the current target by more than five percent')
  })

  it('observations with uncertain source provenance do not bypass full-day nutrition gate', () => {
    const result = scenario({ source: 'ai' })
    // This flag alone cannot magically turn an estimate into measured intake.
    expect(result.maintenance.calorieAdjustmentSafety.status).toBe('review_possible')
    expect(result.maintenance.evidenceExplanation.nutrition.detail).toContain('owner full-day confirmation')
  })

  it('a blocked physiological decision propagates to Coach, not a numeric or alternate calorie lever', () => {
    const { maintenance, intelligence } = scenario({ physiology: null })
    blocked({ maintenance, intelligence })
    const control = buildGoalControlState({ asOf: AS_OF, intelligence, maintenance, brief: brief(), goals: [] })
    const drafts = buildCoachRecommendationDrafts(control)
    expect(drafts.some((draft) => draft.kind === 'review_intake_adjustment')).toBe(false)
    expect(drafts.some((draft) => draft.kind === 'review_activity_adjustment')).toBe(false)
    expect(drafts.find((draft) => draft.kind === 'review_goal_plan')?.evidenceExplanation?.calorieDecision.status).toBe('withheld')
  })
})
