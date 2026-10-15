import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'

const AS_OF = '2026-10-15'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const performance = { status: 'available' as const, asOf: AS_OF, decliningExercises: [], competingGoals: [] }
function build(input: {
  verified?: Set<string> | null
  target?: number
  weightDelta?: number
  recentEnergy?: number
  ownerGoal?: 'lose' | 'maintain'
} = {}) {
  const observations: IntelligenceObservation[] = dates.flatMap((date, index) => [
    { key: 'nutrition.calories', date, value: 2200, unit: 'kcal', provenance: 'owner', quality: 'high_confidence', sourceIds: ['meal-' + date] },
    { key: 'body.weight_kg', date, value: 85 + index * (input.weightDelta ?? 0), unit: 'kg', provenance: 'owner', quality: 'usual', sourceIds: ['scale-' + date] },
    { key: 'wellness.energy', date, value: input.recentEnergy ?? 4, unit: '1–5', provenance: 'owner', sourceIds: ['check-' + date] },
  ])
  const verified = input.verified === undefined ? new Set(dates) : input.verified
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, today: AS_OF, start: '2026-09-16', end: AS_OF,
    timezone: 'America/Phoenix', observations,
    ...(verified ? { nutritionVerifiedCompleteDates: verified } : {}),
  })
  const maintenance = buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence, contexts: [],
    ...(verified ? { eligibleNutritionDates: verified } : {}),
    weightGoal: { goalId: 'weight', goalVersionId: 'v1', label: 'Weight', targetState: 'unmet', direction: input.ownerGoal ?? 'lose' },
    adjustmentContext: {
      status: 'available', currentCalorieTarget: input.target ?? 2300, activeExperimentCount: 0,
      revisionStatus: 'consistent', decisionRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      performance,
      physiology: { status: 'available', asOf: AS_OF, ageYears: 31, heightCm: 178, activeOrUncertainConditionCount: 0 },
    },
  })
  return { intelligence, maintenance }
}
function brief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: AS_OF,
    period: { start: '2026-10-08', end: '2026-10-14' },
    previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
    state: 'deterministic', canGenerate: true,
    coverage: {
      nutrition: true, body: true, activity: true, sleep: false,
      training: false, supplements: false, substantiveDomains: ['nutrition', 'body', 'activity'],
    },
    facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
  }
}
describe('PIQ-1.2 independent maintenance evidence vs calorie review explanations', () => {
  it('separates four evidence dimensions for a confirmed well-sampled, stable-weight window', () => {
    const { maintenance } = build()
    const details = maintenance.evidenceExplanation
    expect(maintenance.estimate.state).toBe('available')
    expect(maintenance.plateau.state).toBe('plateau_likely')
    expect(details.nutrition.status).toBe('well_sampled')
    expect(details.nutrition.detail).toContain('28 of 28 completed days')
    expect(details.nutrition.detail).toContain('does not prove every meal')
    expect(details.weightTrend.status).toBe('well_sampled')
    expect(details.weightTrend.detail).toContain('28 comparable weight measurements')
    expect(details.plateau.status).toBe('likely')
    expect(details.plateau.detail).toContain('2026-09-17 through 2026-10-14')
    expect(details.calorieDecision.status).toBe('review_only')
    expect(details.calorieDecision.detail).toContain('not an individualized medical minimum')
  })

  it('does not collapse a reliable estimate and unsafe existing intake into one confident action', () => {
    const { maintenance } = build({ target: 1600 })
    expect(maintenance.estimate.confidence).toBe('high')
    expect(maintenance.evidenceExplanation.nutrition.status).toBe('well_sampled')
    expect(maintenance.evidenceExplanation.plateau.status).toBe('likely')
    expect(maintenance.evidenceExplanation.calorieDecision.status).toBe('withheld')
    expect(maintenance.evidenceExplanation.calorieDecision.detail).toContain('conservative intake-screening floor')
    expect(maintenance.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('shows recovery gates separately from confidence in a numeric maintenance estimate', () => {
    const { maintenance } = build({ recentEnergy: 1 })
    expect(maintenance.estimate.state).toBe('available')
    expect(maintenance.evidenceExplanation.calorieDecision.status).toBe('withheld')
    expect(maintenance.evidenceExplanation.calorieDecision.detail).toContain('low energy')
    expect(maintenance.evidenceExplanation.weightTrend.status).toBe('well_sampled')
  })

  it('shows missing verification as nutrition insufficiency without zeroing out recorded meals', () => {
    const { maintenance } = build({ verified: new Set(dates.slice(0, 3)) })
    expect(maintenance.estimate.state).toBe('insufficient_evidence')
    expect(maintenance.evidenceExplanation.nutrition.status).toBe('insufficient')
    expect(maintenance.evidenceExplanation.nutrition.detail).toContain('3 of 28')
    expect(maintenance.evidenceExplanation.weightTrend.status).toBe('well_sampled')
    expect(maintenance.evidenceExplanation.plateau.status).toBe('insufficient')
    expect(maintenance.evidenceExplanation.calorieDecision.status).toBe('not_applicable')
    expect(maintenance.estimate.observedMaintenanceKcal).toBeNull()
  })

  it('does not label legacy source-only samples as confirmed whole-day coverage', () => {
    const { maintenance } = build({ verified: null })
    expect(maintenance.estimate.state).toBe('available')
    expect(maintenance.evidenceExplanation.nutrition.status).toBe('limited')
    expect(maintenance.evidenceExplanation.nutrition.detail).toContain('source quality alone cannot prove a complete day')
  })

  it('keeps action not applicable when a weight trend is moving toward the target', () => {
    const { maintenance } = build({ weightDelta: -0.05 })
    expect(maintenance.plateau.state).toBe('trend_in_goal_direction')
    expect(maintenance.evidenceExplanation.plateau.status).toBe('not_applicable')
    expect(maintenance.evidenceExplanation.calorieDecision.status).toBe('not_applicable')
    expect(maintenance.evidenceExplanation.plateau.detail).toContain('weight trend')
  })

  it('carries the four-part explanation only to relevant Maintenance-derived Coach cards', () => {
    const { intelligence, maintenance } = build({ target: 1600 })
    const control = buildGoalControlState({
      asOf: AS_OF, brief: brief(), intelligence, maintenance, goals: [],
    })
    const drafts = buildCoachRecommendationDrafts(control)
    const review = drafts.find((x) => x.kind === 'review_goal_plan')
    expect(review?.evidenceExplanation).toEqual(maintenance.evidenceExplanation)
    expect(review?.evidenceExplanation?.calorieDecision.status).toBe('withheld')
    expect(review?.detail).toContain('does not authorize a new calorie target')
  })

  it('does not represent broad cross-domain Coach confidence as clearance to lower calories', () => {
    const { intelligence, maintenance } = build({ target: 2300 })
    const control = buildGoalControlState({ asOf: AS_OF, brief: brief(), intelligence, maintenance, goals: [] })
    const drafts = buildCoachRecommendationDrafts(control)
    const review = drafts.find((x) => x.kind === 'review_intake_adjustment')
    expect(review?.evidenceExplanation).toBeDefined()
    expect(review?.evidenceExplanation?.calorieDecision.status).toBe('review_only')
    expect(review?.evidenceExplanation?.calorieDecision.detail).toContain('no target is changed')
  })
})
