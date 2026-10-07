import { addCalendarDays, type TrainingDayIntent } from './training-plan.js'
import type { HealthIntelligenceSnapshot, IntelligenceConfidence, IntelligenceRelationship, IntelligenceSignalKey } from './intelligence/shared.js'
import type { WeeklyCandidate, WeeklyCoachBrief, WeeklyGoalSnapshot, WeeklyTrainingPlanSnapshot } from './weekly-coach/types.js'
import type { MaintenanceState } from './maintenance.js'
import type { TrainingProgressionState } from './training-progression.js'

export const GOAL_CONTROL_VERSION = 'goal-control-v1' as const

export type GoalControlStateKind = 'act' | 'maintain' | 'insufficient_evidence'
export type GoalControlGoalState = 'meeting' | 'on_track' | 'needs_attention' | 'unknown'

export type GoalControlOpportunity = {
  id: string
  kind: string
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  sourceCandidateId: string | null
  evidenceRefs: string[]
}

export type GoalControlNutritionQuality = {
  state: 'met' | 'limited' | 'unknown'
  period: { start: string; end: string }
  loggedDays: number
  reliableDays: number
  estimateHeavyDays: number
  unknownQualityDays: number
  requiredLoggedDays: number
  requiredReliableDays: number
  detail: string
}

export type GoalControlTrainingAdherence = {
  configured: boolean
  completedProgrammedSessions: number
  weeklyFrequencyTarget: number | null
  remainingSessions: number | null
  todayIntent: TrainingDayIntent | null
  futureTrainingDates: string[]
  state: 'unconfigured' | 'met' | 'training_day' | 'rest_day_on_track' | 'schedule_review'
  detail: string
}

export type GoalControlGoal = {
  id: string
  label: string
  kind: string
  lifecycle: string
  state: GoalControlGoalState
  targetState: string
  deadlineState: string
  detailPath: string
}

export type GoalControlLimitation = {
  code: string
  text: string
  detailPath: string | null
}

export type GoalControlRelationship = {
  id: string
  summary: string
  confidence: IntelligenceConfidence
  sampleSize: number
  detailPaths: string[]
}

export type GoalControlState = {
  version: typeof GOAL_CONTROL_VERSION
  asOf: string
  period: { start: string; end: string }
  state: GoalControlStateKind
  headline: string
  summary: string
  noChangeRecommended: boolean
  confidence: IntelligenceConfidence
  primaryOpportunity: GoalControlOpportunity | null
  goals: GoalControlGoal[]
  nutritionQuality: GoalControlNutritionQuality
  trainingAdherence: GoalControlTrainingAdherence
  relationships: GoalControlRelationship[]
  limitations: GoalControlLimitation[]
  maintenance: MaintenanceState | null
  trainingProgression: TrainingProgressionState | null
}

export type BuildGoalControlInput = {
  asOf: string
  brief: WeeklyCoachBrief
  intelligence: HealthIntelligenceSnapshot
  goals: readonly WeeklyGoalSnapshot[]
  trainingPlan?: WeeklyTrainingPlanSnapshot | null
  maintenance?: MaintenanceState | null
  trainingProgression?: TrainingProgressionState | null
}

export function goalNeedsWeeklyAttention(deadlineState: string): boolean {
  return deadlineState === 'due_today' ||
    deadlineState === 'passed_unmet' ||
    deadlineState === 'projected_after_deadline'
}

export function dailyTrainingQuestAllowed(plan: {
  configured: boolean
  todayIntent: string | null
} | null | undefined): boolean {
  if (!plan?.configured) return true
  return plan.todayIntent === 'training_preferred' || plan.todayIntent === 'training_moved_here'
}

const GOAL_SIGNALS: Record<string, IntelligenceSignalKey[]> = {
  body_metric: ['body.weight_kg', 'nutrition.calories', 'activity.steps'],
  strength_e1rm: ['training.sessions', 'training.effort', 'sleep.total_minutes', 'nutrition.protein_g'],
  benchmark_result: ['training.sessions', 'sleep.total_minutes', 'wellness.energy'],
  training_frequency: ['training.sessions', 'sleep.total_minutes', 'wellness.soreness'],
  activity_steps: ['activity.steps', 'sleep.total_minutes', 'wellness.energy'],
  nutrition_protein: ['nutrition.protein_g', 'wellness.soreness', 'training.sessions'],
  sleep_duration: ['sleep.total_minutes', 'wellness.energy', 'wellness.hunger'],
  supplement_adherence: [],
  training_reps: ['training.sessions', 'training.effort'],
  training_duration: ['training.sessions', 'training.effort'],
  training_distance: ['training.sessions', 'training.effort'],
  training_pace: ['training.sessions', 'training.effort'],
  training_skill: ['training.sessions', 'training.effort'],
}

function goalState(goal: WeeklyGoalSnapshot): GoalControlGoalState {
  if (goal.lifecycle !== 'active') return 'unknown'
  if (goal.targetState === 'satisfied') return 'meeting'
  if (goal.deadlineState === 'projected_before_deadline') return 'on_track'
  if (
    goal.deadlineState === 'projected_after_deadline' ||
    goal.deadlineState === 'passed_unmet' ||
    goal.deadlineState === 'due_today'
  ) return 'needs_attention'
  return 'unknown'
}

function nutritionQuality(snapshot: HealthIntelligenceSnapshot, asOf: string): GoalControlNutritionQuality {
  const start = addCalendarDays(asOf, -7)
  const end = addCalendarDays(asOf, -1)
  const observations = snapshot.frame
    .filter((day) => day.date >= start && day.date <= end)
    .flatMap((day) => day.signals['nutrition.calories'] ? [day.signals['nutrition.calories']!] : [])
  const loggedDays = observations.length
  const estimateHeavyDays = observations.filter((item) => item.quality === 'estimate_heavy').length
  const unknownQualityDays = observations.filter((item) => item.provenance === 'unknown' || item.quality == null).length
  const reliableDays = observations.filter((item) =>
    item.quality !== 'estimate_heavy' &&
    item.provenance !== 'unknown' &&
    item.quality != null
  ).length
  const requiredLoggedDays = 4
  const requiredReliableDays = 4
  const state: GoalControlNutritionQuality['state'] =
    loggedDays === 0
      ? 'unknown'
      : loggedDays >= requiredLoggedDays && reliableDays >= requiredReliableDays
        ? 'met'
        : 'limited'
  const detail =
    state === 'met'
      ? `Nutrition has ${reliableDays} sufficiently reliable logged days in the last seven completed days.`
      : state === 'unknown'
        ? 'No completed Nutrition days are available for intake-based decisions this week.'
        : `Nutrition has ${loggedDays} logged days but only ${reliableDays} sufficiently reliable days; intake-based changes should wait for better coverage.`
  return {
    state,
    period: { start, end },
    loggedDays,
    reliableDays,
    estimateHeavyDays,
    unknownQualityDays,
    requiredLoggedDays,
    requiredReliableDays,
    detail,
  }
}

function trainingAdherence(plan?: WeeklyTrainingPlanSnapshot | null): GoalControlTrainingAdherence {
  if (!plan?.configured || plan.weeklyFrequencyTarget == null) {
    return {
      configured: false,
      completedProgrammedSessions: plan?.completedProgrammedSessions ?? 0,
      weeklyFrequencyTarget: plan?.weeklyFrequencyTarget ?? null,
      remainingSessions: null,
      todayIntent: plan?.todayIntent ?? null,
      futureTrainingDates: plan?.futureTrainingDates ?? [],
      state: 'unconfigured',
      detail: 'No flexible Training Plan is configured.',
    }
  }
  const remaining = Math.max(0, plan.weeklyFrequencyTarget - plan.completedProgrammedSessions)
  const todayIntent = plan.todayIntent
  if (remaining === 0) {
    return {
      configured: true,
      completedProgrammedSessions: plan.completedProgrammedSessions,
      weeklyFrequencyTarget: plan.weeklyFrequencyTarget,
      remainingSessions: 0,
      todayIntent,
      futureTrainingDates: plan.futureTrainingDates,
      state: 'met',
      detail: `Training Plan target met: ${plan.completedProgrammedSessions}/${plan.weeklyFrequencyTarget} programmed sessions this week.`,
    }
  }
  if (todayIntent === 'training_preferred' || todayIntent === 'training_moved_here') {
    return {
      configured: true,
      completedProgrammedSessions: plan.completedProgrammedSessions,
      weeklyFrequencyTarget: plan.weeklyFrequencyTarget,
      remainingSessions: remaining,
      todayIntent,
      futureTrainingDates: plan.futureTrainingDates,
      state: 'training_day',
      detail: `${remaining} programmed session${remaining === 1 ? '' : 's'} remain and today is a planned Training day.`,
    }
  }
  if (plan.futureTrainingDates.length >= remaining) {
    return {
      configured: true,
      completedProgrammedSessions: plan.completedProgrammedSessions,
      weeklyFrequencyTarget: plan.weeklyFrequencyTarget,
      remainingSessions: remaining,
      todayIntent,
      futureTrainingDates: plan.futureTrainingDates,
      state: 'rest_day_on_track',
      detail: `Today is not a planned Training day. ${plan.futureTrainingDates.length} planned Training day${plan.futureTrainingDates.length === 1 ? '' : 's'} remain for ${remaining} session${remaining === 1 ? '' : 's'}.`,
    }
  }
  return {
    configured: true,
    completedProgrammedSessions: plan.completedProgrammedSessions,
    weeklyFrequencyTarget: plan.weeklyFrequencyTarget,
    remainingSessions: remaining,
    todayIntent,
    futureTrainingDates: plan.futureTrainingDates,
    state: 'schedule_review',
    detail: `${remaining} programmed session${remaining === 1 ? '' : 's'} remain but only ${plan.futureTrainingDates.length} planned Training day${plan.futureTrainingDates.length === 1 ? '' : 's'} remain. Review the plan instead of treating today as an automatic miss.`,
  }
}

function opportunity(candidate: WeeklyCandidate | null): GoalControlOpportunity | null {
  if (!candidate) return null
  return {
    id: candidate.id,
    kind: candidate.kind,
    domain: candidate.kind.startsWith('nutrition_') ? 'nutrition' :
      candidate.kind.startsWith('training_') ? 'training' :
      candidate.kind.startsWith('goal_') ? 'goals' :
      candidate.kind.startsWith('body_') ? 'body' :
      candidate.kind.startsWith('benchmark_') || candidate.kind.startsWith('experiment_') ? 'lab' :
      candidate.kind.startsWith('review_') ? 'review' : 'health',
    title: candidate.fact,
    detail: candidate.actionText ?? candidate.fact,
    actionText: candidate.actionText ?? 'Open',
    detailPath: candidate.detailPath,
    sourceCandidateId: candidate.id,
    evidenceRefs: [...candidate.evidenceRefs],
  }
}

function trainingProgressionOpportunity(training: TrainingProgressionState | null | undefined): GoalControlOpportunity | null {
  const item = training?.primaryOpportunity
  if (!item) return null
  return {
    id: item.id,
    kind: 'training_progression',
    domain: 'training',
    title: item.title,
    detail: item.detail,
    actionText: item.actionText,
    detailPath: item.detailPath,
    sourceCandidateId: null,
    evidenceRefs: [...item.evidenceRefs],
  }
}

function maintenanceOpportunity(maintenance: MaintenanceState | null | undefined): GoalControlOpportunity | null {
  if (
    !maintenance ||
    !maintenance.plateau.goalUnmet ||
    (maintenance.plateau.goalDirection !== 'lose' && maintenance.plateau.goalDirection !== 'gain')
  ) return null
  const intervention = maintenance.interventions.find((item) =>
    item.priority === 'primary' &&
    item.kind !== 'hold_course' &&
    item.kind !== 'review_activity_adjustment'
  )
  if (!intervention) return null
  return {
    id: intervention.id,
    kind: intervention.kind,
    domain:
      intervention.kind === 'review_intake_adjustment' || intervention.kind === 'improve_nutrition_evidence'
        ? 'nutrition'
        : intervention.kind === 'improve_weigh_in_consistency'
          ? 'body'
          : 'goals',
    title: intervention.title,
    detail: intervention.detail,
    actionText: 'Review',
    detailPath: intervention.detailPath,
    sourceCandidateId: null,
    evidenceRefs: ['maintenance:estimate', 'maintenance:plateau-state'],
  }
}

function activeGoalSignalKeys(goals: readonly WeeklyGoalSnapshot[]): Set<IntelligenceSignalKey> {
  const keys = new Set<IntelligenceSignalKey>()
  for (const goal of goals) {
    if (goal.lifecycle !== 'active') continue
    for (const key of GOAL_SIGNALS[goal.kind] ?? []) keys.add(key)
  }
  return keys
}

function relationshipsFor(
  snapshot: HealthIntelligenceSnapshot,
  goals: readonly WeeklyGoalSnapshot[],
): GoalControlRelationship[] {
  const keys = activeGoalSignalKeys(goals)
  if (keys.size === 0) return []
  return snapshot.relationships
    .filter((item) =>
      item.state === 'available' &&
      (item.confidence === 'high' || item.confidence === 'moderate') &&
      (keys.has(item.xKey) || keys.has(item.yKey))
    )
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || b.sampleSize - a.sampleSize)
    .slice(0, 3)
    .map((item) => ({
      id: item.id,
      summary: item.summary,
      confidence: item.confidence,
      sampleSize: item.sampleSize,
      detailPaths: [...item.detailPaths],
    }))
}

function confidenceRank(value: IntelligenceConfidence): number {
  if (value === 'high') return 3
  if (value === 'moderate') return 2
  if (value === 'limited') return 1
  return 0
}

function overallConfidence(
  brief: WeeklyCoachBrief,
  snapshot: HealthIntelligenceSnapshot,
  goals: readonly WeeklyGoalSnapshot[],
): IntelligenceConfidence {
  if (!brief.canGenerate) return 'limited'
  const keys = activeGoalSignalKeys(goals)
  const relevant = snapshot.coverage.filter((item) => keys.has(item.key))
  if (relevant.length === 0) {
    return brief.coverage.substantiveDomains.length >= 3 ? 'moderate' : 'limited'
  }
  const high = relevant.filter((item) => item.confidence === 'high').length
  const mature = relevant.filter((item) => item.confidence === 'high' || item.confidence === 'moderate').length
  if (high >= Math.min(2, relevant.length) && brief.coverage.substantiveDomains.length >= 3) return 'high'
  if (mature > 0) return 'moderate'
  return 'limited'
}

function limitationsFor(
  snapshot: HealthIntelligenceSnapshot,
  goals: readonly WeeklyGoalSnapshot[],
  nutrition: GoalControlNutritionQuality,
  confidence: IntelligenceConfidence,
): GoalControlLimitation[] {
  const limitations: GoalControlLimitation[] = []
  const keys = activeGoalSignalKeys(goals)
  for (const item of snapshot.context.missing) {
    if (!keys.has(item.key as IntelligenceSignalKey)) continue
    limitations.push({
      code: `missing:${item.key}`,
      text: `${item.label}: ${item.detail}`,
      detailPath: item.detailPath,
    })
  }
  if (nutrition.state !== 'met') {
    limitations.push({
      code: 'nutrition_quality_floor',
      text: nutrition.detail,
      detailPath: '/nutrition',
    })
  }
  for (const goal of goals) {
    if (goal.lifecycle === 'active' && goalState(goal) === 'unknown') {
      limitations.push({
        code: `goal_unknown:${goal.id}`,
        text: `${goal.label} does not have enough current evidence to support a weekly change/no-change judgment.`,
        detailPath: `/goals/${goal.id}`,
      })
    }
  }
  if (confidence === 'limited' && limitations.length === 0) {
    limitations.push({
      code: 'limited_cross_domain_evidence',
      text: 'Cross-domain evidence is still limited, so Health should avoid changing course from weak signals.',
      detailPath: '/progress',
    })
  }
  return limitations.slice(0, 8)
}

export function buildGoalControlState(input: BuildGoalControlInput): GoalControlState {
  const nutrition = nutritionQuality(input.intelligence, input.asOf)
  const training = trainingAdherence(input.trainingPlan)
  const goals = input.goals.map((goal) => ({
    id: goal.id,
    label: goal.label,
    kind: goal.kind,
    lifecycle: goal.lifecycle,
    state: goalState(goal),
    targetState: goal.targetState,
    deadlineState: goal.deadlineState,
    detailPath: `/goals/${goal.id}`,
  }))
  const confidence = overallConfidence(input.brief, input.intelligence, input.goals)
  const primaryOpportunity = opportunity(input.brief.focus) ?? maintenanceOpportunity(input.maintenance) ?? trainingProgressionOpportunity(input.trainingProgression)
  const limitations = limitationsFor(input.intelligence, input.goals, nutrition, confidence)
  const activeControlGoals = goals.filter((goal) => goal.lifecycle === 'active')
  const allActiveGoalsUnknown = activeControlGoals.length > 0 && activeControlGoals.every((goal) => goal.state === 'unknown')
  const insufficient =
    !input.brief.canGenerate ||
    (primaryOpportunity == null && (confidence === 'limited' || allActiveGoalsUnknown))
  const state: GoalControlStateKind = primaryOpportunity
    ? 'act'
    : insufficient
      ? 'insufficient_evidence'
      : 'maintain'
  const noChangeRecommended = state === 'maintain'
  const headline =
    state === 'act'
      ? 'One thing is worth your attention'
      : state === 'maintain'
        ? 'Stay the course'
        : 'More evidence before changing course'
  const summary =
    primaryOpportunity?.detail ??
    (noChangeRecommended
      ? 'No change recommended this week. Current evidence does not justify changing your targets or plan.'
      : 'Health does not yet have enough completed evidence to justify changing your targets or plan.')
  return {
    version: GOAL_CONTROL_VERSION,
    asOf: input.asOf,
    period: { ...input.brief.period },
    state,
    headline,
    summary,
    noChangeRecommended,
    confidence,
    primaryOpportunity,
    goals,
    nutritionQuality: nutrition,
    trainingAdherence: training,
    relationships: relationshipsFor(input.intelligence, input.goals),
    limitations,
    maintenance: input.maintenance ?? null,
    trainingProgression: input.trainingProgression ?? null,
  }
}
