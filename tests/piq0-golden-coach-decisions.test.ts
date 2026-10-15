import { describe, expect, it } from 'vitest'
import { buildHealthIntelligenceSnapshot, type IntelligenceObservation } from '../src/domain/intelligence/shared.js'
import { buildMaintenanceState, type MaintenanceAdjustmentContext, type WeightGoalDirection } from '../src/domain/maintenance.js'
import { buildGoalControlState } from '../src/domain/goal-control.js'
import { buildCoachRecommendationDrafts, keepVisibleCoachDependencies } from '../src/domain/coach-intelligence.js'
import { addCalendarDays } from '../src/domain/progress/dates.js'
import type { DailyContext, DailyContextTagKey } from '../src/domain/context.js'
import type { WeeklyCoachBrief, WeeklyCandidate } from '../src/domain/weekly-coach/types.js'

/**
 * PIQ-0/1 decision goldens: synthetic histories with explicit expected
 * evidence and action-level outcomes, NOT snapshots of generated prose.
 * None of the values below describe the app owner.
 */
const AS_OF = '2026-10-15'
const completeDates = Array.from({ length: 28 }, (_, i) => addCalendarDays('2026-09-17', i))
const latest7 = completeDates.slice(-7)
const cutFocus: WeeklyCandidate = {
  id: 'maintenance:review-intake',
  section: 'focus', kind: 'review_intake_adjustment',
  fact: 'Cut calories from a stale weekly packet',
  evidenceRefs: ['old:estimate'], detailPath: '/nutrition',
  actionText: 'Review', rank: 200,
}
const activityFocus: WeeklyCandidate = {
  ...cutFocus, id: 'maintenance:review-activity', kind: 'review_activity_adjustment',
  fact: 'Or increase activity from old packet',
}
const defaultPhysiology: NonNullable<MaintenanceAdjustmentContext['physiology']> = {
  status: 'available', asOf: AS_OF, ageYears: 31,
  heightCm: 178, activeOrUncertainConditionCount: 0,
}
const defaultContext: MaintenanceAdjustmentContext = {
  status: 'available', decisionRevision: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  revisionStatus: 'consistent', activeExperimentCount: 0, currentCalorieTarget: 2400,
  performance: { status: 'available', asOf: AS_OF, decliningExercises: [], competingGoals: [] },
  physiology: defaultPhysiology,
}
type Case = {
  id: string
  premise: string
  intake?: number
  target?: number | null
  verified?: 'all' | 'none' | 'three_recent'
  verificationStatus?: 'available' | 'unavailable'
  weightDeltaKgPerDay?: number
  todayOutlier?: boolean
  goal?: WeightGoalDirection
  checkins?: 'normal' | 'none' | 'low_energy' | 'high_hunger' | 'high_soreness'
  contextTag?: DailyContextTagKey
  experimentCount?: number
  trainingDeclines?: string[]
  competingGoals?: string[]
  profile?: 'missing' | 'conditions' | 'underweight'
  revision?: 'consistent' | 'changed'
  focus?: 'stale_cut' | 'stale_activity'
  expected: {
    estimate: 'available' | 'insufficient_evidence'
    plateau?: string
    safety: 'review_possible' | 'blocked'
    nutrition: 'met' | 'limited'
    primary?: string | null
    coachMustContain?: string[]
    coachMustNotContain?: string[]
    reason?: string
  }
}
const cases: Case[] = [
  { id: 'G01', premise: 'Fully confirmed flat weight with no recovery warnings allows manual review only',
    expected: { estimate: 'available', plateau: 'plateau_likely', safety: 'review_possible',
      nutrition: 'met', primary: 'review_intake_adjustment',
      coachMustContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G02', premise: 'Precise entry provenance is not full-day confirmation',
    verified: 'none', expected: { estimate: 'insufficient_evidence', safety: 'blocked',
      nutrition: 'limited', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G03', premise: 'Historical complete days do not compensate for an incomplete recent week',
    verified: 'three_recent', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'review_possible', nutrition: 'limited',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G04', premise: 'Falling weight contradicts a claim of no progress',
    weightDeltaKgPerDay: -0.05, expected: { estimate: 'available', plateau: 'trend_in_goal_direction',
      // There is no loss plateau to justify a new action, and its computed
      // candidate also fails the separate maintenance-range safety screen.
      safety: 'blocked', nutrition: 'met', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G05', premise: 'Intentional weight maintenance is not a loss plateau',
    goal: 'maintain', expected: { estimate: 'available', plateau: 'stable_at_maintenance',
      safety: 'review_possible', nutrition: 'met', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G06', premise: 'Repeated low energy contradicts otherwise plausible plateau advice',
    checkins: 'low_energy', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan', reason: 'Repeated high hunger',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G07', premise: 'Repeated high hunger contradicts further restriction',
    checkins: 'high_hunger', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan', reason: 'Repeated high hunger',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G08', premise: 'Poor sleep opportunity is context, not a causal diagnosis',
    contextTag: 'poor_sleep_opportunity', expected: { estimate: 'available',
      safety: 'blocked', nutrition: 'met', reason: 'illness, pain, or sleep-disruption',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G09', premise: 'Declining comparable strength overrides a flat scale',
    trainingDeclines: ['Bench Press'], expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan', reason: 'Bench Press',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G10', premise: 'Active experiment cannot be confounded with a new calorie cut',
    experimentCount: 1, expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan', reason: 'personal experiment',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G11', premise: 'Proposed target remains above actual consumed calories',
    target: 2600, expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'already at or below the proposed target',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G12', premise: 'Proposed target is under uncertainty range despite a generic floor',
    target: 2300, expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'lower edge of the uncertain maintenance estimate',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G13', premise: 'Missing physiological context fails closed',
    profile: 'missing', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'Current age and height context', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G14', premise: 'Reported unresolved condition requires individualized review',
    profile: 'conditions', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'clinical conditions', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G15', premise: 'Current profile and weight cannot clear a low BMI scenario',
    profile: 'underweight', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'Low or unknown weight relative to height',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G16', premise: 'Concurrent target/goal/experiment revision change cannot grant stale advice',
    revision: 'changed', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'could not be confirmed unchanged', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G17', premise: 'Upstream stale weekly calorie focus must not bypass blocked Maintenance',
    target: 1600, focus: 'stale_cut', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G18', premise: 'Upstream stale activity alternative must never stand alone',
    focus: 'stale_activity', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'review_possible', nutrition: 'met', primary: 'review_intake_adjustment',
      coachMustContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G19', premise: 'Same-day anomalous calorie entry cannot contaminate completed 28-day estimate',
    todayOutlier: true, expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'review_possible', nutrition: 'met', primary: 'review_intake_adjustment',
      coachMustContain: ['review_intake_adjustment'] } },
  { id: 'G20', premise: 'No recovery check-ins is unknown, not evidence that the owner feels well',
    checkins: 'none', expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'context is sparse', coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G21', premise: 'Urgent unmet performance goal competes with calorie cutting',
    competingGoals: ['Strength PR due'], expected: { estimate: 'available', plateau: 'plateau_likely',
      safety: 'blocked', nutrition: 'met', primary: 'review_goal_plan',
      reason: 'Time-sensitive active performance goals',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
  { id: 'G22', premise: 'Failed full-day verification does not masquerade as owner refusal',
    verified: 'none', verificationStatus: 'unavailable', expected: {
      estimate: 'insufficient_evidence', safety: 'blocked', nutrition: 'limited',
      coachMustNotContain: ['review_intake_adjustment', 'review_activity_adjustment'] } },
]
function verifiedDays(item: Case): Set<string> {
  if (item.verified === 'none') return new Set()
  if (item.verified === 'three_recent') return new Set([...completeDates.slice(0, 21), ...latest7.slice(0, 3)])
  return new Set(completeDates)
}
function weeklyBrief(focus: WeeklyCandidate | null): WeeklyCoachBrief {
  return {
    packetVersion: 'weekly-coach-evidence-v1', asOf: AS_OF,
    period: { start: '2026-10-08', end: '2026-10-14' },
    previousPeriod: { start: '2026-10-01', end: '2026-10-07' },
    state: 'deterministic', canGenerate: true,
    coverage: {
      activity: true, sleep: true, nutrition: true, training: true,
      supplements: false, body: true,
      substantiveDomains: ['activity', 'sleep', 'nutrition', 'training', 'body'],
    },
    facts: [], wentWell: [], worthWatching: [], focus, candidates: focus ? [focus] : [],
  }
}
function evaluate(item: Case) {
  const intake = item.intake ?? 2400
  const observations: IntelligenceObservation[] = completeDates.flatMap((date, index) => {
    const result: IntelligenceObservation[] = [{
      key: 'nutrition.calories', date, value: intake,
      unit: 'kcal', quality: 'high_confidence', provenance: 'owner', sourceIds: [date + ':food'],
    }, {
      key: 'body.weight_kg', date,
      value: (item.profile === 'underweight' ? 48 : 85) + index * (item.weightDeltaKgPerDay ?? 0),
      unit: 'kg', quality: 'usual', provenance: 'owner', sourceIds: [date + ':scale'],
    }]
    const checkins = item.checkins ?? 'normal'
    if (checkins !== 'none' && latest7.includes(date)) {
      const high = latest7.indexOf(date) < 2
      for (const [key, value] of [
        ['wellness.energy', checkins === 'low_energy' && high ? 1 : 4],
        ['wellness.hunger', checkins === 'high_hunger' && high ? 5 : 2],
        ['wellness.soreness', checkins === 'high_soreness' && high ? 5 : 2],
      ] as const) result.push({ key, date, value, unit: '1–5', provenance: 'owner', sourceIds: [date + ':' + key] })
    }
    return result
  })
  if (item.todayOutlier) {
    observations.push({ key: 'nutrition.calories', date: AS_OF, value: 9000,
      unit: 'kcal', quality: 'high_confidence', provenance: 'owner', sourceIds: ['provisional-today'] })
  }
  const whitelist = verifiedDays(item)
  const snapshot = buildHealthIntelligenceSnapshot({
    range: '30d', asOf: AS_OF, today: AS_OF,
    start: '2026-09-16', end: AS_OF, timezone: 'America/Phoenix',
    observations, nutritionVerifiedCompleteDates: whitelist,
    nutritionVerificationStatus: item.verificationStatus ?? 'available',
  })
  const contexts: DailyContext[] = item.contextTag ? [{
    id: 'test-context', contextDate: latest7[4]!, tags: [item.contextTag], note: null,
    createdAt: AS_OF + 'T12:00:00.000Z', updatedAt: AS_OF + 'T12:00:00.000Z',
  }] : []
  const physiology = item.profile === 'missing' ? null
    : item.profile === 'conditions' ? { ...defaultPhysiology, activeOrUncertainConditionCount: 1 }
      : item.profile === 'underweight' ? { ...defaultPhysiology, heightCm: 180 }
        : defaultPhysiology
  const context: MaintenanceAdjustmentContext = {
    ...defaultContext, currentCalorieTarget: item.target === undefined ? 2400 : item.target,
    activeExperimentCount: item.experimentCount ?? 0,
    revisionStatus: item.revision ?? 'consistent',
    physiology,
    performance: {
      status: 'available', asOf: AS_OF,
      decliningExercises: item.trainingDeclines ?? [], competingGoals: item.competingGoals ?? [],
    },
  }
  const maintenance = buildMaintenanceState({
    asOf: AS_OF, today: AS_OF, intelligence: snapshot, contexts,
    eligibleNutritionDates: whitelist,
    weightGoal: {
      goalId: 'weight-goal', goalVersionId: 'weight-v1', label: 'Weight',
      targetState: 'unmet', direction: item.goal ?? 'lose',
    },
    adjustmentContext: context,
  })
  const brief = weeklyBrief(item.focus === 'stale_cut' ? cutFocus
    : item.focus === 'stale_activity' ? activityFocus : null)
  const control = buildGoalControlState({
    asOf: AS_OF, brief, intelligence: snapshot, goals: [], maintenance,
  })
  const drafts = keepVisibleCoachDependencies(buildCoachRecommendationDrafts(control))
  return { snapshot, maintenance, control, drafts }
}
describe('PIQ-0/1 multi-domain golden decision scenarios (synthetic, no API calls)', () => {
  it('registry is stable, unique and includes contradictions plus safe positive controls', () => {
    expect(cases.map((item) => item.id)).toEqual(Array.from({ length: 22 },
      (_, i) => 'G' + String(i + 1).padStart(2, '0')))
    expect(cases.some((item) => item.expected.safety === 'review_possible')).toBe(true)
    expect(cases.some((item) => item.expected.safety === 'blocked')).toBe(true)
    expect(cases.some((item) => item.focus === 'stale_cut')).toBe(true)
  })
  for (const item of cases) {
    it(`${item.id}: ${item.premise}`, () => {
      const { maintenance, control, drafts } = evaluate(item)
      expect(maintenance.estimate.state).toBe(item.expected.estimate)
      if (item.expected.plateau) expect(maintenance.plateau.state).toBe(item.expected.plateau)
      expect(maintenance.calorieAdjustmentSafety.status).toBe(item.expected.safety)
      expect(control.nutritionQuality.state).toBe(item.expected.nutrition)
      if ('primary' in item.expected) {
        expect(control.primaryOpportunity?.kind ?? null).toBe(item.expected.primary ?? null)
      }
      const kinds = drafts.map((draft) => draft.kind)
      for (const kind of item.expected.coachMustContain ?? []) expect(kinds).toContain(kind)
      for (const kind of item.expected.coachMustNotContain ?? []) expect(kinds).not.toContain(kind)
      if (item.expected.reason) {
        expect(maintenance.calorieAdjustmentSafety.reasons.join(' ')).toContain(item.expected.reason)
      }
      if (item.expected.safety === 'blocked') {
        expect(kinds).not.toContain('review_intake_adjustment')
        expect(kinds).not.toContain('review_activity_adjustment')
      }
      if (kinds.includes('review_activity_adjustment')) {
        expect(kinds).toContain('review_intake_adjustment')
      }
      if (maintenance.estimate.state === 'available') {
        expect(maintenance.estimate.period?.end).toBe('2026-10-14')
      }
      // These are review cards, not mutations or completed owner changes.
      for (const draft of drafts) {
        expect(draft.detailPath).toMatch(/^\//)
        expect(draft.actionText).not.toMatch(/^(Apply|Saved|Completed)$/i)
      }
    })
  }
  it('a directly injected stale numerical opportunity cannot bypass the Coach defense', () => {
    const { control, maintenance } = evaluate(cases[16]!) // G17: low target and stale focus.
    expect(maintenance.calorieAdjustmentSafety.status).toBe('blocked')
    const stale = {
      ...control, state: 'act' as const,
      primaryOpportunity: {
        id: cutFocus.id, kind: cutFocus.kind, domain: 'nutrition',
        title: cutFocus.fact, detail: 'Old review recommendation',
        actionText: 'Review', detailPath: '/nutrition',
        sourceCandidateId: cutFocus.id, evidenceRefs: [...cutFocus.evidenceRefs],
      },
    }
    expect(buildCoachRecommendationDrafts(stale)
      .some((draft) => draft.kind === 'review_intake_adjustment')).toBe(false)
  })
})
