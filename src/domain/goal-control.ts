import { addCalendarDays, type TrainingDayIntent } from './training-plan.js'
import type { HealthIntelligenceSnapshot, IntelligenceConfidence, IntelligenceCoverage, IntelligenceSignalKey } from './intelligence/shared.js'
import type { WeeklyCandidate, WeeklyCoachBrief, WeeklyGoalSnapshot, WeeklyTrainingPlanSnapshot } from './weekly-coach/types.js'
import type { MaintenanceState } from './maintenance.js'
import type { TrainingProgressionState } from './training-progression.js'
import { buildTrainingProgressSummary } from './training-progress-summary.js'

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
  /** Recorded programmed session rows are diagnostic, not weekly credit. */
  completedProgrammedSessions: number
  qualifiedTrainingDays: number | null
  weeklyFrequencyTarget: number | null
  remainingQualifiedDays: number | null
  /** Legacy diagnostic field: do not show as remaining weekly training days. */
  remainingSessions: number | null
  todayIntent: TrainingDayIntent | null
  futureTrainingDates: string[]
  state: 'unconfigured' | 'unavailable' | 'met' | 'training_day' | 'rest_day_on_track' | 'flexible_week' | 'schedule_review'
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

/** Derived coverage from the intelligence observation window, not proof
 * that the owner completed a day or that a physiological outcome changed.
 */
export type GoalControlEvidenceCoverage = Pick<IntelligenceCoverage,
  'key' | 'label' | 'observedDays' | 'eligibleDays' | 'excludedObservations' | 'provenance' | 'confidence'
> & { period: { start: string; end: string } }

export type GoalControlLimitation = {
  code: string
  text: string
  detailPath: string | null
  coverage?: GoalControlEvidenceCoverage
}

export type GoalControlRelationship = {
  id: string
  summary: string
  /** Existing grade from matched-pair count, NOT statistical confidence or a p-value. */
  confidence: IntelligenceConfidence
  sampleSize: number
  detailPaths: string[]
  evidence?: {
    /** Observation window can be longer than the matching pair dates. */
    sourceWindow: { start: string; end: string }
    pairedWindow: { start: string; end: string } | null
    requiredPairs: number
    lagDays: number
    /** Original Spearman rank coefficient, separate from the count-based grade. */
    rho: number | null
    /** Describes time clustering; not a statistical effective sample size. */
    dateClustering: { distinctDates: number; contiguousRuns: number; longestRunDays: number } | null
    strength: 'weak' | 'moderate' | 'strong' | null
    /** Raw signal coverage, not necessarily the subset of paired dates. */
    sources: GoalControlEvidenceCoverage[]
  }
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
  // PIQ-1: a trustworthy food ENTRY is not a complete food DAY. The server
  // snapshot marks only owner-confirmed, revision-matched, source-reliable
  // dates as verified_complete. Missing marks (including legacy fixtures) are
  // ineligible for any intake-based decision.
  const reliableDays = observations.filter((item) =>
    item.dayCompleteness === 'verified_complete' &&
    item.quality === 'high_confidence' &&
    item.provenance !== 'unknown'
  ).length
  const verificationUnavailable = snapshot.coverage.find((item) => item.key === 'nutrition.calories')
    ?.completenessCheck === 'unavailable'
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
      ? `Nutrition has ${reliableDays} owner-confirmed complete, source-reliable days in the last seven completed days.`
      : state === 'unknown'
        ? 'No completed Nutrition days are logged for intake-based decisions this week.'
        : verificationUnavailable
          ? `Nutrition was logged on ${loggedDays} days, but full-day verification is unavailable. This does not mean the owner confirmed zero days; intake changes should wait.`
          : `Nutrition was logged on ${loggedDays} days, but only ${reliableDays} are owner-confirmed complete and source-reliable. More verified full-day evidence is needed before changing intake.`
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
  const progress = buildTrainingProgressSummary(plan)
  const state: GoalControlTrainingAdherence['state'] =
    progress.status === 'unconfigured' ? 'unconfigured' :
      progress.status === 'unavailable' ? 'unavailable' :
        progress.status === 'met' ? 'met' :
          progress.status === 'preferred_today' ? 'training_day' :
            progress.status === 'open_day' ? 'rest_day_on_track' : 'flexible_week'
  return {
    configured: progress.configured,
    completedProgrammedSessions: progress.completedProgrammedSessions,
    qualifiedTrainingDays: progress.qualifiedTrainingDays,
    weeklyFrequencyTarget: progress.weeklyTargetDays,
    remainingQualifiedDays: progress.remainingQualifiedDays,
    remainingSessions: progress.weeklyTargetDays == null ? null
      : Math.max(0, progress.weeklyTargetDays - progress.completedProgrammedSessions),
    todayIntent: plan?.todayIntent ?? null,
    futureTrainingDates: plan?.futureTrainingDates ?? [],
    state,
    detail: progress.detail,
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

function maintenanceOpportunity(maintenance: MaintenanceState | null | undefined, nutrition: GoalControlNutritionQuality): GoalControlOpportunity | null {
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
  // A credible 28-day estimate alone cannot authorize fresh calorie-change
  // advice if the last week has no verified complete-day intake coverage.
  if (intervention.kind === 'review_intake_adjustment' && nutrition.state !== 'met') return null
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

/** Exact calendar-day grouping of the X-side dates for paired observations.
 * A lagged Y date belongs to its matched X day, not an extra observation.
 * Decline to report a pattern if any input date is malformed, rather than
 * silently treating invalid dates as a measured gap. No inference of
 * independence, significance or effective sample size is made here.
 */
export function relationshipDateClustering(
  dates: readonly { xDate: string; yDate: string }[],
): { distinctDates: number; contiguousRuns: number; longestRunDays: number } | null {
  if (!dates.length || dates.some((item) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(item.xDate) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(item.yDate))) return null
  const uniqueDates = [...new Set(dates.map((item) => item.xDate))].sort()
  let runs = 0
  let currentRun = 0
  let longest = 0
  let previous: string | null = null
  for (const date of uniqueDates) {
    if (previous == null || addCalendarDays(previous, 1) !== date) {
      runs += 1
      currentRun = 1
    } else {
      currentRun += 1
    }
    longest = Math.max(longest, currentRun)
    previous = date
  }
  return { distinctDates: uniqueDates.length, contiguousRuns: runs, longestRunDays: longest }
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
    .map((item) => {
      const dates = item.evidenceDates.flatMap((pair) => [pair.xDate, pair.yDate]).sort()
      const sourceWindow = { start: snapshot.period.start, end: snapshot.period.end }
      const sources: GoalControlEvidenceCoverage[] = [item.xKey, item.yKey].flatMap((key) => {
        const coverage = snapshot.coverage.find((entry) => entry.key === key)
        return coverage ? [{
          key: coverage.key, label: coverage.label,
          observedDays: coverage.observedDays, eligibleDays: coverage.eligibleDays,
          excludedObservations: coverage.excludedObservations,
          provenance: { ...coverage.provenance }, confidence: coverage.confidence,
          period: { ...sourceWindow },
        }] : []
      })
      return {
        id: item.id,
        summary: item.summary,
        confidence: item.confidence,
        sampleSize: item.sampleSize,
        detailPaths: [...item.detailPaths],
        evidence: {
          sourceWindow,
          pairedWindow: dates.length ? { start: dates[0]!, end: dates[dates.length - 1]! } : null,
          requiredPairs: item.requiredSampleSize,
          lagDays: item.lagDays,
          rho: typeof item.rho === 'number' && Number.isFinite(item.rho) && Math.abs(item.rho) <= 1 ? item.rho : null,
          dateClustering: relationshipDateClustering(item.evidenceDates),
          strength: item.strength,
          sources,
        },
      }
    })
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
    const match = snapshot.coverage.find((entry) => entry.key === item.key)
    limitations.push({
      code: `missing:${item.key}`,
      text: `${item.label}: ${item.detail}`,
      detailPath: item.detailPath,
      ...(match ? { coverage: {
        key: match.key, label: match.label,
        observedDays: match.observedDays, eligibleDays: match.eligibleDays,
        excludedObservations: match.excludedObservations,
        provenance: { ...match.provenance }, confidence: match.confidence,
        period: { start: snapshot.period.start, end: snapshot.period.end },
      } } : {}),
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
  // Weekly focus is upstream of Maintenance. Never let a stale or generic
  // candidate override a verified current calorie-action safety decision.
  const weeklyFocus = opportunity(input.brief.focus)
  const safeWeeklyFocus = weeklyFocus?.kind === 'review_activity_adjustment'
    ? null // Dependent activity alternative is never a primary standalone decision.
    : weeklyFocus?.kind === 'review_intake_adjustment' &&
      (nutrition.state !== 'met' ||
        input.maintenance?.calorieAdjustmentSafety.status !== 'review_possible' ||
        !input.maintenance.interventions.some((item) =>
          item.id === weeklyFocus.id && item.kind === weeklyFocus.kind))
      ? null
      : weeklyFocus
  const primaryOpportunity = safeWeeklyFocus ??
    maintenanceOpportunity(input.maintenance, nutrition) ??
    trainingProgressionOpportunity(input.trainingProgression)
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
