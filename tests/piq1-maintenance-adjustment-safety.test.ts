import { describe, expect, it } from 'vitest'
import type { DailyContext } from '../src/domain/context.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState, type MaintenanceAdjustmentContext } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'

const TODAY = '2026-10-15'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const recent = dates.slice(-7)
const target: MaintenanceAdjustmentContext = {
  status: 'available', currentCalorieTarget: 2400, activeExperimentCount: 0,
  revisionStatus: 'consistent', decisionRevision: 'test-current-revision',
  performance: { status: 'available', asOf: TODAY, decliningExercises: [], competingGoals: [] },
  physiology: { status: 'available', asOf: TODAY, ageYears: 31, heightCm: 178, activeOrUncertainConditionCount: 0 },
}
function observation(
  key: IntelligenceObservation['key'], date: string, value: number,
  quality?: string,
): IntelligenceObservation {
  const units: Record<string, string> = {
    'nutrition.calories': 'kcal', 'body.weight_kg': 'kg',
    'wellness.hunger': '1–5', 'wellness.energy': '1–5',
    'wellness.soreness': '1–5', 'training.sessions': 'sessions',
  }
  return { key, date, value, unit: units[key] ?? 'unit',
    provenance: 'owner', quality, sourceIds: [date + ':' + key] }
}
function assess(options: {
  adjustmentContext?: MaintenanceAdjustmentContext | null
  recentCheckins?: Array<{ date: string; hunger?: number; energy?: number; soreness?: number }>
  contexts?: DailyContext[]
  goalDirection?: 'lose' | 'gain' | 'maintain'
} = {}) {
  const obs: IntelligenceObservation[] = dates.flatMap((date) => [
    observation('nutrition.calories', date, 2400, 'high_confidence'),
    observation('body.weight_kg', date, 85, 'usual'),
  ])
  for (const item of options.recentCheckins ?? recent.map((date) => ({ date, hunger: 2, energy: 4, soreness: 2 }))) {
    if (item.hunger != null) obs.push(observation('wellness.hunger', item.date, item.hunger))
    if (item.energy != null) obs.push(observation('wellness.energy', item.date, item.energy))
    if (item.soreness != null) obs.push(observation('wellness.soreness', item.date, item.soreness))
  }
  const snapshot = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: TODAY, today: TODAY,
    start: '2026-09-16', end: TODAY, timezone: 'America/Phoenix',
    observations: obs, nutritionVerifiedCompleteDates: new Set(dates),
  })
  const goal = {
    goalId: 'weight', goalVersionId: 'weight-v1', label: 'Weight',
    direction: options.goalDirection ?? 'lose',
    targetState: 'unmet',
  } as const
  return buildMaintenanceState({
    asOf: TODAY, today: TODAY, intelligence: snapshot,
    contexts: options.contexts ?? [],
    eligibleNutritionDates: new Set(dates),
    weightGoal: goal,
    adjustmentContext: options.adjustmentContext === undefined ? target : options.adjustmentContext,
  })
}
function kinds(result: ReturnType<typeof assess>) {
  return result.interventions.map((item) => item.kind)
}
function assertWithheld(result: ReturnType<typeof assess>) {
  expect(result.estimate.state).toBe('available')
  expect(result.plateau.state).toBe('plateau_likely')
  expect(result.calorieAdjustmentSafety.status).toBe('blocked')
  expect(kinds(result)).not.toContain('review_intake_adjustment')
  expect(kinds(result)).not.toContain('review_activity_adjustment')
  const review = result.interventions.find((item) => item.id === 'maintenance:review-safety')
  expect(review).toMatchObject({ kind: 'review_goal_plan', priority: 'primary', suggestedDeltaKcal: null })
  expect(review?.detail).toContain('does not authorize a new calorie target')
}
describe('PIQ-1.2 calorie reduction decision-safety gates', () => {
  it('supports descriptive plateau with no automatic target mutation when the review context is adequate', () => {
    const result = assess()
    expect(result.estimate.observedMaintenanceKcal).toBe(2400)
    expect(result.plateau.state).toBe('plateau_likely')
    expect(result.calorieAdjustmentSafety).toMatchObject({ status: 'review_possible', recentCheckinDays: 7 })
    expect(kinds(result)).toContain('review_intake_adjustment')
    expect(result.interventions.find((x) => x.kind === 'review_intake_adjustment')?.detail)
      .toContain('not an automatic target change')
  })

  it('withholds a cut when configured calories are low even if food and weight data are pristine', () => {
    const result = assess({ adjustmentContext: { ...target, currentCalorieTarget: 1600 } })
    assertWithheld(result)
    expect(result.calorieAdjustmentSafety.screeningFloorKcal).toBe(1920)
    expect(result.calorieAdjustmentSafety.proposedTargetKcal).toBeLessThan(1920)
  })

  it('does not infer a safe target from precise logged calories when the configured target is absent', () => {
    const result = assess({ adjustmentContext: { ...target, currentCalorieTarget: null } })
    assertWithheld(result)
    expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('current configured calorie target')
  })

  it('does not interpret failed target/experiment reads as no running experiments', () => {
    const result = assess({ adjustmentContext: { status: 'unavailable', currentCalorieTarget: null, activeExperimentCount: 0 } })
    assertWithheld(result)
    expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('unavailable')
  })

  it('stops the proposed cut during active or imminently scheduled personal experimentation', () => {
    const result = assess({ adjustmentContext: { ...target, activeExperimentCount: 1 } })
    assertWithheld(result)
    expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('personal experiment')
  })

  it('does not use absent wellness checkins as evidence of low hunger and good recovery', () => {
    const result = assess({ recentCheckins: [] })
    assertWithheld(result)
    expect(result.calorieAdjustmentSafety.recentCheckinDays).toBe(0)
    expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('context is sparse')
  })

  it('withholds when high hunger, low energy, or marked soreness repeatedly occurs', () => {
    const checks: Array<'hunger' | 'energy' | 'soreness'> = ['hunger', 'energy', 'soreness']
    for (const key of checks) {
      const observations = recent.map((date, index) => ({
        date, hunger: index < 2 && key === 'hunger' ? 5 : 2,
        energy: index < 2 && key === 'energy' ? 1 : 4,
        soreness: index < 2 && key === 'soreness' ? 5 : 2,
      }))
      const result = assess({ recentCheckins: observations })
      assertWithheld(result)
      expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('Repeated high hunger')
    }
  })

  it('treats recent illness/pain/poor-sleep context as a reason to review rather than cut', () => {
    for (const tag of ['sick', 'pain', 'poor_sleep_opportunity'] as const) {
      const day = recent[2]!
      const result = assess({ contexts: [{
        id: 'ctx-' + tag, contextDate: day, tags: [tag], note: null,
        createdAt: day + 'T12:00:00.000Z', updatedAt: day + 'T12:00:00.000Z',
      }] })
      assertWithheld(result)
      expect(result.calorieAdjustmentSafety.reasons.join(' ')).toContain('illness, pain')
    }
  })

  it('does not produce a calorie cut when the goal is to maintain weight', () => {
    const result = assess({ goalDirection: 'maintain' })
    expect(result.plateau.state).toBe('stable_at_maintenance')
    expect(kinds(result)).not.toContain('review_intake_adjustment')
  })

  it('keeps Coach aligned with a safety-blocked plateau instead of resurfacing a numerical cut', () => {
    const maintenance = assess({ adjustmentContext: { ...target, currentCalorieTarget: 1550 } })
    const intelligence = buildHealthIntelligenceSnapshot({
      range: '30d', asOf: TODAY, today: TODAY, start: '2026-09-16', end: TODAY,
      timezone: 'America/Phoenix', nutritionVerifiedCompleteDates: new Set(dates),
      observations: dates.map((date) => observation('nutrition.calories', date, 2400, 'high_confidence')),
    })
    const brief: WeeklyCoachBrief = {
      packetVersion: 'weekly-coach-evidence-v1', asOf: TODAY,
      period: { start: '2026-10-08', end: '2026-10-14' },
      previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
      state: 'deterministic', canGenerate: true,
      coverage: {
        activity: true, sleep: true, nutrition: true, training: false, supplements: false, body: true,
        substantiveDomains: ['activity', 'sleep', 'nutrition', 'body'],
      },
      facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
    }
    const control = buildGoalControlState({ asOf: TODAY, brief, intelligence, goals: [], maintenance })
    expect(control.primaryOpportunity?.kind).toBe('review_goal_plan')
    expect(buildCoachRecommendationDrafts(control).some((item) => item.kind === 'review_intake_adjustment')).toBe(false)
  })
})
