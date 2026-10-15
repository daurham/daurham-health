import { describe, expect, it } from 'vitest'
import { assessMaintenancePerformanceSafety, type MaintenancePerformanceGoal } from '../src/domain/maintenance-performance.js'
import { buildTrainingProgressionState, type TrainingProgressionExercise, type TrainingProgressionSet } from '../src/domain/training-progression.js'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState } from '../src/domain/maintenance.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts } from '../src/domain/coach-intelligence.js'
import type { WeeklyCoachBrief } from '../src/domain/weekly-coach/types.js'

const AS_OF = '2026-10-15'
const dates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const exercise: TrainingProgressionExercise = {
  id: 'bench', name: 'Bench Press', performanceType: 'loaded_reps', loadType: 'barbell',
  movementPattern: 'horizontal_push', primaryMuscleGroup: 'chest', secondaryMuscleGroups: ['triceps'],
}
function set(date: string, i: number, kg: number, rir = 2, limitationKind: string | null = null): TrainingProgressionSet {
  return {
    setId: 'set-' + i, sessionId: 'session-' + i, date,
    exerciseId: exercise.id, exerciseName: exercise.name,
    performanceType: exercise.performanceType, loadType: exercise.loadType,
    movementPattern: exercise.movementPattern, primaryMuscleGroup: exercise.primaryMuscleGroup,
    secondaryMuscleGroups: exercise.secondaryMuscleGroups,
    setType: 'working', completed: true, weightKg: kg, reps: 8,
    leftReps: null, rightReps: null, durationSec: null,
    leftDurationSec: null, rightDurationSec: null, distanceM: null,
    bodyweightKg: 85, rir, rpe: null, failureKind: null,
    leftFailureKind: null, rightFailureKind: null,
    sessionEffort: 3, limitationKind,
  }
}
function training(
  weights = [75, 75, 67, 66],
  sessionDates = ['2026-09-15', '2026-09-22', '2026-10-06', '2026-10-13'],
  rirRecent = 2,
  asOf = AS_OF,
) {
  return buildTrainingProgressionState({
    asOf, exercises: [exercise], goals: [],
    sets: sessionDates.map((date, i) => set(date, i, weights[i]!, i >= 2 ? rirRecent : 2,
      i >= 2 && rirRecent <= 1 ? 'fatigue' : null)),
  })
}
const noGoals: MaintenancePerformanceGoal[] = []
const urgentGoal: MaintenancePerformanceGoal = {
  label: 'Improve Bench Press', kind: 'strength_e1rm', lifecycle: 'active',
  targetState: 'below_target', deadlineState: 'projected_after_deadline',
}
function evidence(input: {
  weights?: number[]
  dates?: string[]
  rir?: number
  asOf?: string
  goals?: MaintenancePerformanceGoal[] | null
  missingTraining?: boolean
} = {}) {
  return assessMaintenancePerformanceSafety({
    asOf: AS_OF,
    training: input.missingTraining ? null : training(input.weights, input.dates, input.rir, input.asOf),
    goals: input.goals === undefined ? noGoals : input.goals,
  })
}
function maintenance(performance: ReturnType<typeof evidence>) {
  const observations: IntelligenceObservation[] = dates.flatMap((date) => [
    { key: 'nutrition.calories', date, value: 2400, unit: 'kcal', quality: 'high_confidence', provenance: 'owner', sourceIds: ['meal-' + date] },
    { key: 'body.weight_kg', date, value: 85, unit: 'kg', quality: 'usual', provenance: 'owner', sourceIds: ['scale-' + date] },
    { key: 'wellness.energy', date, value: 4, unit: '1–5', provenance: 'owner', sourceIds: ['energy-' + date] },
  ])
  const intelligence = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, today: AS_OF,
    start: '2026-09-16', end: AS_OF, timezone: 'America/Phoenix',
    observations, nutritionVerifiedCompleteDates: new Set(dates),
  })
  const state = buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence, contexts: [], eligibleNutritionDates: new Set(dates),
    weightGoal: { goalId: 'weight', goalVersionId: 'weight-v1', label: 'Weight', targetState: 'unmet', direction: 'lose' },
    adjustmentContext: { status: 'available', currentCalorieTarget: 2400, activeExperimentCount: 0, performance },
  })
  return { intelligence, state }
}
function brief(): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: AS_OF,
    period: { start: '2026-10-08', end: '2026-10-14' },
    previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
    state: 'deterministic', canGenerate: true,
    coverage: { activity: false, sleep: false, nutrition: true,
      training: true, supplements: false, body: true,
      substantiveDomains: ['nutrition', 'training', 'body'] },
    facts: [], wentWell: [], worthWatching: [], focus: null, candidates: [],
  }
}
describe('PIQ-1.2 calorie-cut safety honors canonical training and active goals', () => {
  it('uses fresh comparable exact-exercise decline to block a cut while preserving plateau evidence', () => {
    const performance = evidence()
    expect(performance).toMatchObject({ status: 'available', decliningExercises: ['Bench Press'], competingGoals: [] })
    const { state } = maintenance(performance)
    expect(state.estimate.state).toBe('available')
    expect(state.plateau.state).toBe('plateau_likely')
    expect(state.calorieAdjustmentSafety.status).toBe('blocked')
    expect(state.calorieAdjustmentSafety.reasons.join(' ')).toContain('Bench Press')
    expect(state.interventions.map((x) => x.kind)).not.toContain('review_intake_adjustment')
    expect(state.interventions.map((x) => x.kind)).not.toContain('review_activity_adjustment')
  })

  it('does not use a historical decline as proof of a current recovery problem', () => {
    const performance = evidence({ dates: ['2026-08-10', '2026-08-17', '2026-09-01', '2026-09-07'] })
    expect(performance).toMatchObject({ status: 'available', decliningExercises: [] })
    expect(maintenance(performance).state.calorieAdjustmentSafety.status).toBe('review_possible')
  })

  it('flags recently lower performance with increased effort as a confounded recovery signal', () => {
    const performance = evidence({ rir: 1 })
    expect(performance.decliningExercises).toEqual(['Bench Press'])
    expect(maintenance(performance).state.calorieAdjustmentSafety.status).toBe('blocked')
  })

  it('does not block an otherwise eligible review for improving or stable strength evidence', () => {
    for (const weights of [[70, 71, 74, 76], [72, 72, 72, 72]]) {
      const performance = evidence({ weights })
      expect(performance.decliningExercises).toEqual([])
      expect(maintenance(performance).state.calorieAdjustmentSafety.status).toBe('review_possible')
    }
  })

  it('blocks urgent unmet active strength goals even when recent training looks stable', () => {
    const performance = evidence({ weights: [70, 70, 70, 70], goals: [urgentGoal] })
    expect(performance.competingGoals).toEqual(['Improve Bench Press'])
    const { state } = maintenance(performance)
    expect(state.calorieAdjustmentSafety.status).toBe('blocked')
    expect(state.calorieAdjustmentSafety.reasons.join(' ')).toContain('performance goals')
  })

  it('does not treat on-track or met strength goals as categorical conflicts', () => {
    for (const goal of [
      { ...urgentGoal, deadlineState: 'projected_before_deadline' },
      { ...urgentGoal, targetState: 'satisfied' },
      { ...urgentGoal, lifecycle: 'paused' },
      { ...urgentGoal, kind: 'activity_steps' },
    ]) {
      const performance = evidence({ weights: [70, 70, 70, 70], goals: [goal] })
      expect(performance.competingGoals).toEqual([])
      expect(maintenance(performance).state.calorieAdjustmentSafety.status).toBe('review_possible')
    }
  })

  it('missing, stale or mismatched training/goal evidence fails closed without inventing a decline', () => {
    const cases = [
      evidence({ missingTraining: true }),
      evidence({ goals: null }),
      evidence({ asOf: '2026-10-14' }),
    ]
    for (const performance of cases) {
      expect(performance.status).toBe('unavailable')
      const { state } = maintenance(performance)
      expect(state.calorieAdjustmentSafety.status).toBe('blocked')
      expect(state.calorieAdjustmentSafety.reasons.join(' ')).toContain('unavailable')
      expect(state.interventions.some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
    }
  })

  it('only classifies a decline after four comparable exposures; missing observations are not setbacks', () => {
    const partial = evidence({ dates: ['2026-09-20', '2026-10-06', '2026-10-13'], weights: [75, 65, 64] })
    expect(partial.decliningExercises).toEqual([])
    expect(maintenance(partial).state.calorieAdjustmentSafety.status).toBe('review_possible')
  })

  it('Coach receives only a plan review when performance contradicts an otherwise credible plateau', () => {
    const { intelligence, state } = maintenance(evidence())
    const control = buildGoalControlState({
      asOf: AS_OF, brief: brief(), intelligence, goals: [], maintenance: state,
    })
    expect(control.nutritionQuality.state).toBe('met')
    expect(control.primaryOpportunity?.kind).toBe('review_goal_plan')
    expect(buildCoachRecommendationDrafts(control).some((x) => x.kind === 'review_intake_adjustment')).toBe(false)
  })

  it('preserves an eligible optional review if canonical strength improves without conflicting goals', () => {
    const { intelligence, state } = maintenance(evidence({ weights: [68, 70, 74, 76] }))
    expect(state.calorieAdjustmentSafety.status).toBe('review_possible')
    const control = buildGoalControlState({
      asOf: AS_OF, brief: brief(), intelligence, goals: [], maintenance: state,
    })
    expect(control.primaryOpportunity?.kind).toBe('review_intake_adjustment')
    expect(buildCoachRecommendationDrafts(control).some((x) => x.kind === 'review_intake_adjustment')).toBe(true)
  })

  it('provisional dates cannot revive an otherwise stale training decline', () => {
    const performance = evidence({ dates: ['2026-09-01', '2026-09-08', '2026-09-15', AS_OF] })
    expect(performance.decliningExercises).toEqual(['Bench Press'])
    // The latest actual completed-day training record must be non-provisional;
    // detection of a same-day event is not permission to use it in a prior-day decision.
  })
})
