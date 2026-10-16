import { addCalendarDays, type TrainingDayIntent } from './training-plan.js'
import type { HealthIntelligenceSnapshot, IntelligenceConfidence, IntelligenceCoverage, IntelligenceSignalKey } from './intelligence/shared.js'
import type { WeeklyCandidate, WeeklyCoachBrief, WeeklyGoalSnapshot, WeeklyTrainingPlanSnapshot } from './weekly-coach/types.js'
import type { MaintenanceState } from './maintenance.js'
import type { TrainingProgressionState } from './training-progression.js'
import { buildTrainingProgressSummary } from './training-progress-summary.js'
import { associationStrength, spearmanRho } from './intelligence/spearman.js'

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
    /** Pairing opportunity is calendar alignment only, not logging completeness. */
    pairCoverage: { matchedPairs: number; calendarSlots: number; unmatchedSlots: number } | null
    requiredPairs: number
    lagDays: number
    /** A reported association must reproduce from its exact cited readings before interpretation. */
    coefficientVerified: boolean
    /** Exact as-of snapshot contract, independent of coefficient arithmetic. */
    snapshotCurrent: boolean
    /** Original Spearman rank coefficient, separate from the count-based grade. */
    rho: number | null
    /** Describes time clustering; not a statistical effective sample size. */
    dateClustering: { distinctDates: number; contiguousRuns: number; longestRunDays: number } | null
    /** Descriptive first-difference Spearman on consecutive, verified matched dates only. */
    changeSensitivity: { adjacentTransitions: number; rho: number | null } | null
    /** Descriptive leave-one-pair-out sensitivity, not a confidence interval or p-value. */
    singlePairSensitivity: {
      testedRemovals: number
      minRho: number | null
      maxRho: number | null
      /** Null when removal makes any coefficient undefined. */
      directionSensitive: boolean | null
    } | null
    /** Selection accounting, not a family-wise error rate or statistical correction. */
    screening: {
      evaluatedPairs: number
      evidenceQualifiedPairs: number
      goalRelevantPairs: number
      shownPairs: number
    }
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
/** A real source date, not just a yyyy-mm-dd-shaped value. */
function isCalendarDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && addCalendarDays(date, 0) === date
}

/** Compare only descriptive signed coefficients; zero and insufficient
 * adjacent-day evidence have no defensible direction. No significance claim.
 */
export function relationshipDirectionContrast(
  overallRho: number | null,
  sensitivity: { adjacentTransitions: number; rho: number | null } | null,
): 'opposite_signs' | 'same_signs' | 'unavailable' {
  const adjacentRho = sensitivity?.rho
  if (overallRho == null || adjacentRho == null ||
      !Number.isFinite(overallRho) || !Number.isFinite(adjacentRho) ||
      Math.abs(overallRho) > 1 || Math.abs(adjacentRho) > 1 ||
      overallRho === 0 || adjacentRho === 0 || (sensitivity?.adjacentTransitions ?? 0) < 6) {
    return 'unavailable'
  }
  return Math.sign(overallRho) === Math.sign(adjacentRho) ? 'same_signs' : 'opposite_signs'
}

/** Transparency only: of all calendar X anchors with a Y lag still inside
 * the source window, how many actually yielded a verified recorded pair?
 * "Unmatched" does NOT assert skipped logs, zero physiology or completeness.
 * Fail closed on inconsistent dates/counts rather than inventing a denominator.
 */
export function relationshipPairDateCoverage(
  dates: readonly { xDate: string; yDate: string }[],
  reportedSampleSize: number,
  lagDays: number,
  window: { start: string; end: string },
): {
  matchedPairs: number
  calendarSlots: number
  unmatchedSlots: number
  pairedWindow: { start: string; end: string }
} | null {
  if (!isCalendarDate(window.start) || !isCalendarDate(window.end) || window.start > window.end ||
      !Number.isSafeInteger(lagDays) || !Number.isSafeInteger(reportedSampleSize) ||
      reportedSampleSize < 1 || reportedSampleSize !== dates.length) return null

  let calendarSlots = 0
  let cursor = window.start
  for (let days = 0; cursor <= window.end; days += 1) {
    // The current Health snapshot is a bounded window; reject unbounded or
    // corrupted metadata rather than enumerating an arbitrary interval.
    if (days >= 3660) return null
    const alignedY = addCalendarDays(cursor, lagDays)
    if (alignedY >= window.start && alignedY <= window.end) calendarSlots += 1
    cursor = addCalendarDays(cursor, 1)
  }
  if (calendarSlots === 0 || reportedSampleSize > calendarSlots) return null
  const anchors = new Set<string>()
  const endpoints: string[] = []
  for (const pair of dates) {
    if (!isCalendarDate(pair.xDate) || !isCalendarDate(pair.yDate) ||
        pair.xDate < window.start || pair.xDate > window.end ||
        pair.yDate < window.start || pair.yDate > window.end ||
        addCalendarDays(pair.xDate, lagDays) !== pair.yDate ||
        anchors.has(pair.xDate)) return null
    anchors.add(pair.xDate)
    endpoints.push(pair.xDate, pair.yDate)
  }
  endpoints.sort()
  return {
    matchedPairs: reportedSampleSize,
    calendarSlots,
    unmatchedSlots: calendarSlots - reportedSampleSize,
    pairedWindow: { start: endpoints[0]!, end: endpoints[endpoints.length - 1]! },
  }
}

/** A relationship cannot be presented as current when its original source
 * snapshot belongs to another date or an impossible/reversed source window.
 * Reproducing an old coefficient is not sufficient to prove freshness.
 * This only checks loaded-snapshot context and calendar continuity, NOT DB-level event revisions.
 */
export function relationshipSnapshotContextIsCurrent(
  snapshot: Pick<HealthIntelligenceSnapshot, 'asOf' | 'period' | 'range' | 'frame'>,
  requestedAsOf: string,
): boolean {
  if (!isCalendarDate(requestedAsOf) || snapshot.asOf !== requestedAsOf ||
      snapshot.range !== '30d' || !isCalendarDate(snapshot.period.start) ||
      !isCalendarDate(snapshot.period.end) || snapshot.period.start > snapshot.period.end ||
      snapshot.period.end > requestedAsOf ||
      !Number.isSafeInteger(snapshot.period.dayCount) ||
      snapshot.period.dayCount <= 0 || snapshot.frame.length !== snapshot.period.dayCount) return false

  // Frame rows are the loaded calendar window's source of matched dates. A
  // missing, duplicated, reordered or out-of-window day invalidates even a
  // reproducible coefficient because opportunity and coverage are not sound.
  let expectedDate = snapshot.period.start
  for (const day of snapshot.frame) {
    if (day.date !== expectedDate) return false
    expectedDate = addCalendarDays(expectedDate, 1)
  }
  return expectedDate === addCalendarDays(snapshot.period.end, 1)
}

/** Recompute a verified matched-pair rank coefficient after omitting each
 * one recorded pair. This is a descriptive influence check, not an inferential
 * confidence interval: serial dependence, selection and confounding remain.
 * Use the same 0.05 descriptive "neutral" boundary as the source labels.
 */
export function relationshipSinglePairDeletionSensitivity(
  frame: readonly HealthIntelligenceSnapshot['frame'][number][],
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number],
    'xKey' | 'yKey' | 'evidenceDates' | 'rho'>,
): {
  testedRemovals: number
  minRho: number | null
  maxRho: number | null
  directionSensitive: boolean | null
} | null {
  const count = relation.evidenceDates.length
  if (count < 10 || count > 31 || relation.rho == null ||
      !Number.isFinite(relation.rho) || Math.abs(relation.rho) > 1 ||
      !relationshipPairsBackedByFrame(frame, relation)) return null

  const byDate = new Map(frame.map((day) => [day.date, day]))
  const xs = relation.evidenceDates.map(({ xDate }) => byDate.get(xDate)!.signals[relation.xKey]!.value)
  const ys = relation.evidenceDates.map(({ yDate }) => byDate.get(yDate)!.signals[relation.yKey]!.value)
  const direction = (rho: number) => Math.abs(rho) < 0.05 ? 'neutral' : rho > 0 ? 'positive' : 'negative'
  const originalDirection = direction(relation.rho)
  const results: number[] = []
  for (let omitted = 0; omitted < count; omitted += 1) {
    const xRemaining = xs.filter((_, index) => index !== omitted)
    const yRemaining = ys.filter((_, index) => index !== omitted)
    const rho = spearmanRho(xRemaining, yRemaining)
    // A constant series following deletion makes even descriptive stability
    // unassessable. Never represent such a case as "no direction change".
    if (rho == null || !Number.isFinite(rho) || Math.abs(rho) > 1) {
      return { testedRemovals: count, minRho: null, maxRho: null, directionSensitive: null }
    }
    results.push(rho)
  }
  return {
    testedRemovals: count,
    minRho: Math.min(...results),
    maxRho: Math.max(...results),
    directionSensitive: results.some((rho) => direction(rho) !== originalDirection),
  }
}

/** A plausible pair date is not proof of a measured X/Y pair. Only expose
 * exact matched-date diagnostics when both source observations really exist
 * in the already-loaded frame. Never substitute a missing reading with zero.
 */
export function relationshipPairsBackedByFrame(
  frame: readonly HealthIntelligenceSnapshot['frame'][number][],
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number],
    'xKey' | 'yKey' | 'evidenceDates'>,
): boolean {
  if (relation.evidenceDates.length === 0) return false
  const byDate = new Map<string, HealthIntelligenceSnapshot['frame'][number]>()
  for (const day of frame) {
    if (!isCalendarDate(day.date) || byDate.has(day.date)) return false
    byDate.set(day.date, day)
  }
  return relation.evidenceDates.every(({ xDate, yDate }) => {
    const x = byDate.get(xDate)?.signals[relation.xKey]
    const y = byDate.get(yDate)?.signals[relation.yKey]
    return x?.key === relation.xKey && x.date === xDate && Number.isFinite(x.value) &&
      y?.key === relation.yKey && y.date === yDate && Number.isFinite(y.value)
  })
}

/** Verify the original aggregate rank association against the exact cited X/Y
 * readings. A modified but still-finite source value can invalidate a stale
 * coefficient even when all matched dates still exist. This never rescales,
 * replaces, or re-ranks the upstream snapshot's original relationship.
 */
/** Nutrition relationship evidence needs both confirmed full-day coverage
 * AND source-reliable entries. A completed day can still be mostly AI estimates
 * or legacy unknowns. Retain old associations as history but do not describe
 * such observations as verified current effects.
 */
export function relationshipNutritionPairsRemainEligible(
  frame: readonly HealthIntelligenceSnapshot['frame'][number][],
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number], 'xKey' | 'yKey' | 'evidenceDates'>,
): boolean {
  if (relation.evidenceDates.length === 0) return false
  const byDate = new Map(frame.map((day) => [day.date, day]))
  const reliable = (key: IntelligenceSignalKey, date: string): boolean => {
    if (!key.startsWith('nutrition.')) return true
    const observation = byDate.get(date)?.signals[key]
    return observation?.dayCompleteness === 'verified_complete' &&
      observation.quality === 'high_confidence' &&
      (observation.provenance === 'owner' ||
        observation.provenance === 'reference' ||
        observation.provenance === 'mixed')
  }
  return relation.evidenceDates.every(({ xDate, yDate }) =>
    reliable(relation.xKey, xDate) && reliable(relation.yKey, yDate)
  )
}

export function relationshipCoefficientMatchesFrame(
  frame: readonly HealthIntelligenceSnapshot['frame'][number][],
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number],
    'xKey' | 'yKey' | 'evidenceDates' | 'rho'>,
): boolean {
  if (relation.rho == null || !Number.isFinite(relation.rho) ||
      Math.abs(relation.rho) > 1 ||
      !relationshipPairsBackedByFrame(frame, relation)) return false
  const byDate = new Map(frame.map((day) => [day.date, day]))
  const xs: number[] = []
  const ys: number[] = []
  for (const pair of relation.evidenceDates) {
    xs.push(byDate.get(pair.xDate)!.signals[relation.xKey]!.value)
    ys.push(byDate.get(pair.yDate)!.signals[relation.yKey]!.value)
  }
  const reproduced = spearmanRho(xs, ys)
  return reproduced !== null && Number.isFinite(reproduced) &&
    Math.abs(reproduced - relation.rho) <= 1e-10
}

/** An observed coefficient can be reproducible while its descriptive strength
 * or direction label is stale. Check both against the *original* rho without
 * changing upstream ranking, thresholds or the owner's source observations.
 */
export function relationshipReportedLabelsMatchCoefficient(
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number], 'rho' | 'strength' | 'direction'>,
): boolean {
  const rho = relation.rho
  if (rho == null || !Number.isFinite(rho) || Math.abs(rho) > 1) return false
  const direction = Math.abs(rho) < 0.05 ? 'neutral' : rho > 0 ? 'positive' : 'negative'
  return relation.strength === associationStrength(rho) && relation.direction === direction
}

export function relationshipDateClustering(
  dates: readonly { xDate: string; yDate: string }[],
): { distinctDates: number; contiguousRuns: number; longestRunDays: number } | null {
  if (!dates.length || dates.some((item) =>
    !isCalendarDate(item.xDate) || !isCalendarDate(item.yDate))) return null
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

/** Descriptive time-trend sensitivity check for an existing observed pair.
 * Difference only genuinely adjacent X-side anchor dates, retaining each
 * original lagged Y matching. Missing, duplicated or malformed evidence
 * invalidates this disclosure rather than manufacturing pair continuity.
 * Six comparisons is a UI reporting floor, NOT an inferential sample size.
 * First differences cannot prove detrending, independence or causation.
 */
export function relationshipDayToDaySensitivity(
  frame: readonly HealthIntelligenceSnapshot['frame'][number][],
  relation: Pick<HealthIntelligenceSnapshot['relationships'][number],
    'xKey' | 'yKey' | 'lagDays' | 'evidenceDates'>,
): { adjacentTransitions: number; rho: number | null } | null {
  const pairs = [...relation.evidenceDates].sort((a, b) => a.xDate.localeCompare(b.xDate))
  if (pairs.length < 2 || new Set(pairs.map((pair) => pair.xDate)).size !== pairs.length) return null
  const byDate = new Map(frame.map((day) => [day.date, day]))
  const values: Array<{ date: string; x: number; y: number }> = []
  for (const pair of pairs) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pair.xDate) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(pair.yDate) ||
        addCalendarDays(pair.xDate, 0) !== pair.xDate ||
        addCalendarDays(pair.xDate, relation.lagDays) !== pair.yDate) return null
    const x = byDate.get(pair.xDate)?.signals[relation.xKey]?.value
    const y = byDate.get(pair.yDate)?.signals[relation.yKey]?.value
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y)) return null
    values.push({ date: pair.xDate, x, y })
  }
  const dx: number[] = []
  const dy: number[] = []
  for (let i = 1; i < values.length; i++) {
    const before = values[i - 1]!
    const after = values[i]!
    if (addCalendarDays(before.date, 1) !== after.date) continue
    dx.push(after.x - before.x)
    dy.push(after.y - before.y)
  }
  const measured = dx.length >= 6 ? spearmanRho(dx, dy) : null
  return { adjacentTransitions: dx.length, rho: measured != null && Number.isFinite(measured) ? measured : null }
}

function relationshipsFor(
  snapshot: HealthIntelligenceSnapshot,
  goals: readonly WeeklyGoalSnapshot[],
  asOf: string,
): GoalControlRelationship[] {
  const keys = activeGoalSignalKeys(goals)
  if (keys.size === 0) return []
  const snapshotCurrent = relationshipSnapshotContextIsCurrent(snapshot, asOf)
  // Count candidates before goal relevance and the three-card cap. Displaying
  // only selected associations can conceal how many pairs were screened.
  // Qualification is the existing display rule, never a significance test.
  const evidenceQualified = snapshot.relationships.filter((item) =>
    item.state === 'available' &&
    (item.confidence === 'high' || item.confidence === 'moderate')
  )
  const goalRelevant = evidenceQualified.filter((item) =>
    keys.has(item.xKey) || keys.has(item.yKey)
  )
  const selected = goalRelevant
    .sort((a, b) => confidenceRank(b.confidence) - confidenceRank(a.confidence) || b.sampleSize - a.sampleSize)
    .slice(0, 3)
  const screening = {
    evaluatedPairs: snapshot.relationships.length,
    evidenceQualifiedPairs: evidenceQualified.length,
    goalRelevantPairs: goalRelevant.length,
    shownPairs: selected.length,
  }
  return selected.map((item) => {
      const sourceWindow = { start: snapshot.period.start, end: snapshot.period.end }
      const calendarCoverage = relationshipPairDateCoverage(
        item.evidenceDates, item.sampleSize, item.lagDays, sourceWindow,
      )
      const coefficientVerified = snapshotCurrent && !!calendarCoverage &&
        relationshipCoefficientMatchesFrame(snapshot.frame, item) &&
        relationshipNutritionPairsRemainEligible(snapshot.frame, item) &&
        relationshipReportedLabelsMatchCoefficient(item)
      const pairCoverage = coefficientVerified ? calendarCoverage : null
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
        summary: coefficientVerified ? item.summary
          : !snapshotCurrent
            ? 'Previously reported observational relationship; its source snapshot does not match the requested Health date or has an invalid observation window.'
            : 'Previously reported observational relationship; its coefficient or interpretation labels could not be verified against the current paired readings, or cited nutrition days no longer qualify.',
        confidence: coefficientVerified ? item.confidence : 'unknown',
        sampleSize: item.sampleSize,
        detailPaths: [...item.detailPaths],
        evidence: {
          sourceWindow,
          pairedWindow: pairCoverage?.pairedWindow ?? null,
          pairCoverage: pairCoverage ? {
            matchedPairs: pairCoverage.matchedPairs,
            calendarSlots: pairCoverage.calendarSlots,
            unmatchedSlots: pairCoverage.unmatchedSlots,
          } : null,
          requiredPairs: item.requiredSampleSize,
          lagDays: item.lagDays,
          coefficientVerified,
          snapshotCurrent,
          rho: coefficientVerified ? item.rho : null,
          dateClustering: pairCoverage ? relationshipDateClustering(item.evidenceDates) : null,
          changeSensitivity: pairCoverage ? relationshipDayToDaySensitivity(snapshot.frame, item) : null,
          singlePairSensitivity: pairCoverage ? relationshipSinglePairDeletionSensitivity(snapshot.frame, item) : null,
          screening,
          strength: coefficientVerified ? item.strength : null,
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
    relationships: relationshipsFor(input.intelligence, input.goals, input.asOf),
    limitations,
    maintenance: input.maintenance ?? null,
    trainingProgression: input.trainingProgression ?? null,
  }
}
