import type { GoalControlEvidenceCoverage, GoalControlLimitation, GoalControlNutritionQuality, GoalControlState } from './goal-control.js'
import { isOperationalCoachOpportunity } from './coach-opportunity-eligibility.js'
import type { MaintenanceEvidenceExplanation } from './maintenance.js'
import { progressionSeriesForOpportunity, type TrainingProgressionSeries } from './training-progression.js'
import type { IntelligenceConfidence } from './intelligence/shared.js'

export const COACH_INTELLIGENCE_VERSION = 'coach-intelligence-v1' as const
export const COACH_QUESTION_BUDGET_DAYS = 3 as const

export const COACH_RECOMMENDATION_RESPONSES = [
  'do_this',
  'not_now',
  'not_relevant',
  'turn_into_experiment',
] as const
export type CoachRecommendationResponse = (typeof COACH_RECOMMENDATION_RESPONSES)[number]

/** A voluntary reason to stop repeating this suggestion, not a health fact. */
export const COACH_RECOMMENDATION_FEEDBACK_REASONS = [
  'not_relevant', 'already_knew', 'wrong_context', 'not_practical',
] as const
export type CoachRecommendationFeedbackReason = (typeof COACH_RECOMMENDATION_FEEDBACK_REASONS)[number]

export const COACH_RECOMMENDATION_OUTCOMES = [
  'helped',
  'no_change',
  'made_worse',
  'unclear',
] as const
export type CoachRecommendationOutcome = (typeof COACH_RECOMMENDATION_OUTCOMES)[number]

export type CoachTrainingEvidence = Pick<
  TrainingProgressionSeries,
  'exerciseName' | 'state' | 'metric' | 'exposureCount' | 'latestDate' | 'changePct' | 'limitationKinds' | 'explanation'
> & { window: { start: string; end: string } }

/** An exact-exercise signal, not a cross-domain confidence score. */
function trainingEvidenceForOpportunity(control: GoalControlState, opportunityId: string): CoachTrainingEvidence | null {
  const series = progressionSeriesForOpportunity(control.trainingProgression, opportunityId)
  const window = control.trainingProgression?.window
  if (!series || !window) return null
  return {
    exerciseName: series.exerciseName,
    state: series.state,
    metric: series.metric,
    exposureCount: series.exposureCount,
    latestDate: series.latestDate,
    changePct: series.changePct,
    limitationKinds: [...series.limitationKinds],
    explanation: series.explanation,
    window: { ...window },
  }
}

/** A last-seven-completed-day coverage snapshot from Goal Control;
 * entered items never silently count as verified whole-day intake.
 */
export type CoachNutritionEvidence = GoalControlNutritionQuality

/** Data absence is a limitation, not confidence in a health decline. */
export type CoachEvidenceGap = {
  kind: 'missing_signal' | 'unresolved_goal' | 'limited_cross_domain'
  limitationCode: string
  period: { start: string; end: string }
  explanation: string
  /** Actual eligible/observed days from the source window, if present. */
  coverage?: GoalControlEvidenceCoverage
}

function evidenceGapForLimitation(limitation: GoalControlLimitation, control: GoalControlState): CoachEvidenceGap {
  const kind = limitation.code.startsWith('missing:') ? 'missing_signal'
    : limitation.code.startsWith('goal_unknown:') ? 'unresolved_goal'
      : 'limited_cross_domain'
  return {
    kind, limitationCode: limitation.code, period: { ...control.period },
    ...(kind === 'missing_signal' && limitation.coverage
      ? { coverage: { ...limitation.coverage,
        period: { ...limitation.coverage.period },
        provenance: { ...limitation.coverage.provenance },
      } } : {}),
    explanation: kind === 'missing_signal'
      ? 'The relevant signal is unavailable or incomplete. This does not prove worse sleep, recovery, or a negative change.'
      : kind === 'unresolved_goal'
        ? 'This goal cannot yet be evaluated from current evidence. Unknown does not mean failed or abandoned.'
        : 'Available cross-domain evidence is too limited for a reliable change/no-change conclusion.',
  }
}

function recentNutritionEvidence(control: GoalControlState): CoachNutritionEvidence {
  return { ...control.nutritionQuality, period: { ...control.nutritionQuality.period } }
}

export type CoachRecommendationRationale = {
  observation: string
  relevance: string
  uncertainty: string
  alternatives: string
  nextStep: string
  timing: string
  successCheck: string
}

export type CoachRecommendationDraft = {
  fingerprint: string
  sourceId: string
  kind: string
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: IntelligenceConfidence
  evidenceExplanation?: MaintenanceEvidenceExplanation
  trainingEvidence?: CoachTrainingEvidence
  nutritionEvidence?: CoachNutritionEvidence
  evidenceGap?: CoachEvidenceGap
  rationale?: CoachRecommendationRationale
  evidenceRefs: string[]
  priority: number
  experimentEligible: boolean
}

export type CoachRecommendationMemory = {
  id: string
  fingerprint: string
  recommendationKind: string
  responseState: CoachRecommendationResponse | null
  /** True only for a newly acknowledged owner start, never inferred from legacy Review. */
  ownerStarted?: boolean
  suppressUntil: string | null
  followUpOn: string | null
  outcomeState: CoachRecommendationOutcome | null
  lastSurfacedOn: string
}

export type CoachRecommendationView = {
  id: string
  fingerprint: string
  kind: string
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: IntelligenceConfidence
  evidenceExplanation?: MaintenanceEvidenceExplanation
  trainingEvidence?: CoachTrainingEvidence
  nutritionEvidence?: CoachNutritionEvidence
  evidenceGap?: CoachEvidenceGap
  rationale?: CoachRecommendationRationale
  evidenceRefs: string[]
  responseState: CoachRecommendationResponse | null
  /** Opaque exact DB response timestamp; null means never responded. */
  responseAt: string | null
  /** Opaque version of the non-calorie advice and relevant evidence. */
  contextRevision?: string
  experimentEligible: boolean
}

export type CoachRecommendationFollowUp = {
  id: string
  /** Opaque saved owner-start revision, unlike human-readable acceptedOn. */
  responseAt: string
  title: string
  detail: string
  detailPath: string
  acceptedOn: string | null
  followUpOn: string
  /** A genuine past start whose original recommendation is not advised now. */
  historical?: boolean
}

export type CoachFollowUpQuestionDraft = {
  fingerprint: string
  kind: 'follow_up_question'
  domain: string
  title: string
  detail: string
  actionText: string
  detailPath: string
  confidence: 'limited'
  evidenceRefs: string[]
}

export type CoachFollowUpQuestion = CoachFollowUpQuestionDraft & {
  id: string
}

export type CoachIntelligenceState = {
  version: typeof COACH_INTELLIGENCE_VERSION
  asOf: string
  state: 'act' | 'maintain' | 'insufficient_evidence'
  headline: string
  summary: string
  noChangeRecommended: boolean
  nextBestActions: CoachRecommendationView[]
  followUps: CoachRecommendationFollowUp[]
  question: CoachFollowUpQuestion | null
  questionBudgetDays: typeof COACH_QUESTION_BUDGET_DAYS
}

function fingerprint(sourceId: string): string {
  return `coach:i9:${sourceId}`
}

function restAware(
  draft: CoachRecommendationDraft,
  control: GoalControlState,
): CoachRecommendationDraft {
  if (draft.domain !== 'training') return draft
  const adherence = control.trainingAdherence
  // A preferred day already qualified is not a request to train again.
  if (adherence.state === 'rest_day_on_track' &&
      (adherence.todayIntent === 'training_preferred' || adherence.todayIntent === 'training_moved_here')) {
    return {
      ...draft,
      detail: `Today's qualified training already counts toward your target; there is no need to add another session to satisfy Coach. ${draft.detail}`,
      actionText: 'Review next session',
    }
  }
  if (adherence.state !== 'rest_day_on_track' && adherence.state !== 'flexible_week') return draft
  return {
    ...draft,
    detail: `Today is an optional Training day; resting or moving a workout is not a missed-session penalty. ${draft.detail}`,
    actionText: 'Review next session',
  }
}

function opportunityDraft(
  control: GoalControlState,
): CoachRecommendationDraft | null {
  const opportunity = control.primaryOpportunity
  if (!opportunity || isOperationalCoachOpportunity(opportunity.kind)) return null
  // Both a stale weekly focus and a manually reconstructed Goal Control
  // object must fail closed: only the matching current Maintenance decision
  // may create a numerical calorie review. Never promote its alternative
  // to a standalone primary card.
  if (isCalorieDecisionKind(opportunity.kind)) {
    if (opportunity.kind !== 'review_intake_adjustment' ||
        control.nutritionQuality.state !== 'met' ||
        control.maintenance?.calorieAdjustmentSafety?.status !== 'review_possible' ||
        !control.maintenance.interventions.some((item) =>
          item.id === opportunity.id && item.kind === opportunity.kind)) return null
  }
  const maintenanceExplanation = control.maintenance?.interventions.some((item) => item.id === opportunity.id)
    ? control.maintenance.evidenceExplanation : null
  const trainingSeries = opportunity.kind === 'training_progression'
    ? progressionSeriesForOpportunity(control.trainingProgression, opportunity.id) : null
  const trainingEvidence = trainingSeries ? trainingEvidenceForOpportunity(control, opportunity.id) : null
  return restAware({
    fingerprint: fingerprint(opportunity.id),
    sourceId: opportunity.id,
    kind: opportunity.kind,
    domain: opportunity.domain,
    title: opportunity.title,
    detail: opportunity.detail,
    actionText: opportunity.actionText,
    detailPath: opportunity.detailPath,
    // A Maintenance-specific action must use the estimate's own confidence,
    // not the cross-domain Goal Control summary confidence.
    confidence: maintenanceExplanation ? control.maintenance!.estimate.confidence
      : opportunity.kind === 'training_progression' ? trainingSeries?.confidence ?? 'unknown'
      : control.confidence,
    ...(maintenanceExplanation ? { evidenceExplanation: maintenanceExplanation } : {}),
    ...(trainingEvidence ? { trainingEvidence } : {}),
    ...(isCalorieDecisionKind(opportunity.kind) ? { nutritionEvidence: recentNutritionEvidence(control) } : {}),
    evidenceRefs: [...opportunity.evidenceRefs],
    priority: 100,
    experimentEligible: opportunity.domain !== 'review',
  }, control)
}

function trainingDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  const progression = control.trainingProgression
  if (!progression?.primaryOpportunity) return []
  const item = progression.primaryOpportunity
  if (control.primaryOpportunity?.id === item.id) return []
  const series = progressionSeriesForOpportunity(progression, item.id)
  const trainingEvidence = series ? trainingEvidenceForOpportunity(control, item.id) : null
  return [restAware({
    fingerprint: fingerprint(item.id),
    sourceId: item.id,
    kind: 'training_progression',
    domain: 'training',
    title: item.title,
    detail: item.detail,
    actionText: item.actionText,
    detailPath: item.detailPath,
    confidence: series?.confidence ?? 'unknown',
    ...(trainingEvidence ? { trainingEvidence } : {}),
    evidenceRefs: [...item.evidenceRefs],
    priority: 80,
    experimentEligible: true,
  }, control)]
}

function maintenanceDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  if (!control.maintenance) return []
  return control.maintenance.interventions.flatMap((item) => {
    if (item.priority !== 'secondary' || item.kind === 'hold_course') return []
    if (item.kind === 'review_intake_adjustment' && control.nutritionQuality.state !== 'met') return []
    // The activity option is explicitly an alternative to the primary
    // calorie lever; never surface a standalone dangling alternative card.
    if (item.kind === 'review_activity_adjustment' &&
        (control.primaryOpportunity?.kind !== 'review_intake_adjustment' ||
         control.maintenance?.calorieAdjustmentSafety?.status !== 'review_possible' ||
         control.nutritionQuality.state !== 'met')) return []
    const id = `maintenance:${item.id}`
    if (control.primaryOpportunity?.id === item.id) return []
    return [{
      fingerprint: fingerprint(id),
      sourceId: id,
      kind: item.kind,
      domain: item.kind.includes('intake') || item.kind.includes('nutrition') ? 'nutrition' : 'goals',
      title: item.title,
      detail: item.detail,
      actionText: 'Review',
      detailPath: item.detailPath,
      confidence: control.maintenance!.estimate.confidence,
      evidenceExplanation: control.maintenance!.evidenceExplanation,
      ...(isCalorieDecisionKind(item.kind) ? { nutritionEvidence: recentNutritionEvidence(control) } : {}),
      evidenceRefs: ['maintenance:estimate', 'maintenance:plateau-state'],
      priority: 70,
      experimentEligible: true,
    }]
  })
}

function limitationDraft(limitation: GoalControlLimitation, control: GoalControlState): CoachRecommendationDraft | null {
  if (!limitation.detailPath) return null
  const nutrition = limitation.code === 'nutrition_quality_floor'
  const goal = limitation.code.startsWith('goal_unknown:')
  const title = nutrition
    ? 'Improve nutrition evidence before changing intake'
    : goal
      ? 'Clarify this goal before changing course'
      : 'Fill the evidence gap before changing course'
  return {
    fingerprint: fingerprint(`evidence:${limitation.code}`),
    sourceId: `evidence:${limitation.code}`,
    kind: 'improve_evidence',
    domain: nutrition ? 'nutrition' : goal ? 'goals' : 'health',
    title,
    detail: limitation.text,
    actionText: 'Add context',
    detailPath: limitation.detailPath,
    confidence: nutrition ? (control.nutritionQuality.state === 'unknown' ? 'unknown' : 'limited')
      : limitation.code.startsWith('missing:') || goal ? 'unknown' : 'limited',
    ...(nutrition ? { nutritionEvidence: recentNutritionEvidence(control) }
      : { evidenceGap: evidenceGapForLimitation(limitation, control) }),
    evidenceRefs: [`limitation:${limitation.code}`],
    priority: 60,
    experimentEligible: false,
  }
}


/**
 * Narrative derived from the matched exact evidence only. Missing source data
 * means no explanation: don't infer measurements, diagnoses, causes or starts.
 * This never grants permission to change goals, targets or training plans.
 */
export function buildCoachRecommendationRationale(
  draft: CoachRecommendationDraft, control: GoalControlState,
): CoachRecommendationRationale | null {
  const series = draft.kind === 'training_progression' ? draft.trainingEvidence : null
  if (series) {
    const goalRelation = control.trainingProgression?.goalRelationships.find((relation) =>
      draft.sourceId === 'training-progression:' + relation.exerciseId &&
      control.goals.some((goal) => goal.id === relation.goalId && goal.lifecycle === 'active'))
    const goal = goalRelation
      ? control.goals.find((item) => item.id === goalRelation.goalId && item.lifecycle === 'active')
      : null
    const delta = series.changePct != null && Number.isFinite(series.changePct)
      ? ' Recorded change versus prior exposures: ' + (series.changePct > 0 ? '+' : '') +
        series.changePct.toFixed(1) + '%.' : ''
    return {
      observation: series.exerciseName + ': ' + series.exposureCount +
        ' comparable recorded exposures between ' + series.window.start + ' and ' +
        series.window.end + '; latest exposure ' + (series.latestDate ?? 'unknown') +
        '. Trend: ' + series.state.replace(/_/g, ' ') + '.' + delta,
      relevance: goal ? 'This exercise matches the active ' + goal.label +
        ' goal, but the trend alone does not establish its cause.'
        : 'An exact-exercise Training trend was recorded; a current matching goal was not verified.',
      uncertainty: draft.confidence + ' confidence for this exact exercise only. ' +
        'Recorded sets cannot establish technique, recovery or causality.' +
        (series.limitationKinds.length ? ' Logged limitations: ' +
          series.limitationKinds.join(', ') + '.' : ''),
      alternatives: 'Changes in effort, technique, equipment or recovery may affect performance; the trend does not establish which explanation applies.',
      nextStep: 'Review the matched Training sets and recent context before making any plan change. No extra workout is required today.',
      timing: 'Consider this when reviewing upcoming Training; the logged trend is not an urgent instruction.',
      successCheck: 'Reassess this exact exercise after new comparable logged sessions. No outcome is assumed before additional evidence.',
    }
  }
  const nutrition = draft.kind === 'improve_evidence' && draft.domain === 'nutrition'
    ? draft.nutritionEvidence : null
  if (nutrition) {
    return {
      observation: 'From ' + nutrition.period.start + ' to ' + nutrition.period.end +
        ', calories were logged on ' + nutrition.loggedDays + ' days; only ' +
        nutrition.reliableDays + ' were verified complete and source-reliable. ' +
        'The complete-day requirement is ' + nutrition.requiredReliableDays + '.',
      relevance: 'A nutrition-target review needs trustworthy complete-day intake evidence, not merely food-entry counts.',
      uncertainty: 'Missing or unverified days are unknown, not zero intake. ' +
        nutrition.estimateHeavyDays + ' logged days are estimate-heavy; ' +
        nutrition.unknownQualityDays + ' have unknown quality or provenance.',
      alternatives: 'Partial food logging could explain the evidence gap without any change in actual intake.',
      nextStep: 'Review one recent Nutrition day for missed items. Confirm completeness only if all intake that day is truly recorded.',
      timing: 'Check coverage before considering a calorie change; this finding does not justify adjusting targets.',
      successCheck: 'Recheck the rolling seven completed days after at least ' +
        nutrition.requiredReliableDays + ' reliable complete days are confirmed. Meeting that threshold is not proof of a health outcome.',
    }
  }
  // Goal reviews must resolve to the exact active goal and its canonical
  // source reference. A fuzzy title match or merely having a goal somewhere
  // in the account does not support a personalized explanation.
  if (draft.kind === 'goal_review' || draft.kind === 'goal_off_track') {
    const goal = control.goals.find((candidate) =>
      candidate.lifecycle === 'active' &&
      candidate.targetState !== 'satisfied' &&
      draft.detailPath === candidate.detailPath &&
      draft.evidenceRefs.includes('goal:' + candidate.id))
    if (goal) {
      const timing = goal.deadlineState === 'due_today'
        ? 'The stored target date is today.'
        : goal.deadlineState === 'passed_unmet'
          ? 'The stored target date has passed and the goal is not marked satisfied.'
          : goal.deadlineState === 'projected_after_deadline'
            ? 'The current projection falls after the stored goal deadline.'
            : 'The recorded goal status calls for review; its exact deadline urgency was not established.'
      return {
        observation: 'At ' + control.asOf + ', the active ' + goal.label +
          ' goal has status "' + goal.targetState.replace(/_/g, ' ') +
          '" and deadline assessment "' + goal.deadlineState.replace(/_/g, ' ') +
          '". This is the goal record, not a newly measured outcome.',
        relevance: goal.ownerPrimary
          ? 'You selected this as your primary goal; its plan deserves review before changing other goals.'
          : 'This goal is active, but it was not verified as your chosen primary goal.',
        uncertainty: 'The weekly assessment does not, by itself, verify an exact measurement, why progress changed, or that the goal has failed.',
        alternatives: 'The deadline, measurement coverage, or pace of progress may need review; this status does not identify which explanation applies.',
        nextStep: 'Open this goal and check its latest recorded evidence and target date before deciding whether anything needs adjusting.',
        timing,
        successCheck: 'Review this same goal at the next weekly assessment, comparing the current target and supported progress. Reading a card is not starting a change.',
      }
    }
  }
  // Matching finalized experiments signal a review opportunity, NOT
  // evidence that an intervention worked or was started by the owner.
  if (draft.kind === 'experiment_review') {
    const id = draft.sourceId.startsWith('focus:experiment:')
      ? draft.sourceId.slice('focus:experiment:'.length) : null
    if (id && draft.detailPath === '/lab/experiments/' + id &&
        draft.evidenceRefs.includes('experiment:' + id)) {
      return {
        observation: 'As of ' + control.asOf + ', the weekly review marked a saved experiment result ready to inspect. No outcome size or interpretation was supplied to this Coach card.',
        relevance: 'Reviewing an already recorded experiment can inform a later goal decision, but it is not proof that a change helped.',
        uncertainty: 'This status does not establish adherence, comparable measurements, a valid protocol or a causal effect.',
        alternatives: 'Normal variation, incomplete observations or changed conditions may explain apparent differences; inspect the actual result first.',
        nextStep: 'Open the existing experiment result and review its protocol, data quality and recorded interpretation. Do not repeat or adopt the intervention from this reminder.',
        timing: 'The result is ready for review; there is no urgent or automatic action.',
        successCheck: 'Record an interpretation only if its protocol and measurements support it. A review click is not an intervention start or health outcome.',
      }
    }
  }
  // Maintenance decisions need the exact matching current intervention.
  // Never interpret a blocked calorie review as permission to change intake.
  if (draft.evidenceExplanation && control.maintenance) {
    const intervention = control.maintenance.interventions.find((item) =>
      item.kind === draft.kind && item.detailPath === draft.detailPath &&
      (draft.sourceId === item.id || draft.sourceId === 'maintenance:' + item.id))
    if (intervention &&
        (draft.kind !== 'review_intake_adjustment' ||
          (control.maintenance.calorieAdjustmentSafety.status === 'review_possible' &&
           control.nutritionQuality.state === 'met'))) {
      const explanation = draft.evidenceExplanation
      const days = draft.nutritionEvidence
      return {
        observation: 'Assessment through ' + control.maintenance.completeThrough +
          ': ' + explanation.weightTrend.detail + ' ' + explanation.plateau.detail +
          (days ? ' Recent food-log coverage: ' + days.reliableDays +
            ' verified complete days out of ' + days.loggedDays +
            ' logged days in ' + days.period.start + ' to ' + days.period.end + '.' : ''),
        relevance: 'This is a review of the existing goal or intake plan, not a mandate to change your targets.',
        uncertainty: draft.confidence + ' confidence belongs to the Maintenance estimate only. ' +
          explanation.nutrition.detail + ' ' + explanation.calorieDecision.detail,
        alternatives: 'Changes in water balance, observation timing, incomplete food logs or recovery context can affect interpretation without proving a particular cause.',
        nextStep: 'Open the current assessment and compare verified intake coverage, weight observations and recovery context. Do not make an automatic calorie adjustment.',
        timing: 'Review before making any plan change; this evidence does not require immediate action.',
        successCheck: 'Re-evaluate the same verified food-day coverage and weight trend over the next comparable completed window, after any owner-approved change is actually started.',
      }
    }
  }
  const gap = draft.kind === 'improve_evidence' ? draft.evidenceGap : null
  if (gap && draft.evidenceRefs.includes('limitation:' + gap.limitationCode)) {
    const coverage = gap.coverage
    return {
      observation: coverage
        ? coverage.label + ' had ' + coverage.observedDays + ' recorded dates out of ' +
          coverage.eligibleDays + ' eligible dates during ' + coverage.period.start +
          ' to ' + coverage.period.end + '.'
        : 'The assessment for ' + gap.period.start + ' to ' + gap.period.end +
          ' identified "' + gap.limitationCode.replace(/_/g, ' ') +
          '" without a verified observation count.',
      relevance: 'Clarifying this specific evidence gap may help a later goal decision; it is not proof that health worsened.',
      uncertainty: gap.explanation + ' Recorded dates do not establish complete tracking.',
      alternatives: 'Missing imports, incomplete entries or a genuinely untracked period could explain the gap.',
      nextStep: 'Open the linked source and check whether the missing information is available. Do not invent or backfill measurements.',
      timing: 'Review when convenient, before interpreting a trend that depends on this signal.',
      successCheck: 'After new records are available, check whether the same missing-evidence limitation still applies; no health outcome is presumed.',
    }
  }
  return null
}

export function buildCoachRecommendationDrafts(control: GoalControlState): CoachRecommendationDraft[] {
  if (control.state === 'maintain') return []
  const drafts: CoachRecommendationDraft[] = []
  const primary = opportunityDraft(control)
  if (primary) drafts.push(primary)
  drafts.push(...trainingDrafts(control))
  drafts.push(...maintenanceDrafts(control))
  if (control.state === 'insufficient_evidence') {
    const evidence = control.limitations.map((item) => limitationDraft(item, control)).find((item): item is CoachRecommendationDraft => item != null)
    if (evidence) drafts.push(evidence)
  }
  const seen = new Set<string>()
  return rankCoachRecommendationDrafts(drafts.filter((item) => {
    if (seen.has(item.fingerprint)) return false
    seen.add(item.fingerprint)
    return true
  })).map((item) => {
    const rationale = buildCoachRecommendationRationale(item, control)
    return rationale ? { ...item, rationale } : item
  })
}


/**
 * PIQ-5.2: transparent ordering for already-eligible recommendations.
 * Eligibility (source/current state, decision safety and owner suppression)
 * must run first; these are editorial categories, NOT clinical risk scores
 * or probabilistic utilities. A credible exact-exercise trend outranks a
 * routine result-review card; an unverified training trend does not.
 */
export function rankCoachRecommendationDrafts(
  drafts: readonly CoachRecommendationDraft[],
): CoachRecommendationDraft[] {
  const category = (draft: CoachRecommendationDraft): number => {
    switch (draft.kind) {
      case 'goal_review':
      case 'review_goal_plan':
        return 7 // explicit time-sensitive goal or safety-aware plan review
      case 'review_intake_adjustment':
      case 'goal_off_track':
        return 6 // separately verified eligible adjustment / overdue trajectory
      case 'training_progression':
        return draft.trainingEvidence &&
          ['moderate', 'high'].includes(draft.confidence) &&
          draft.trainingEvidence.exposureCount >= 4
          ? 5 : 3
      case 'experiment_review':
      case 'improve_nutrition_evidence':
      case 'improve_weigh_in_consistency':
        return 4 // genuine review/quality decision, not scheduled homework
      case 'review_activity_adjustment':
        return 2 // alternative dependent on active intake parent
      case 'improve_evidence':
        return 1 // useful clarification, but not a demonstrated insight
      default:
        return 3 // unknown future kinds: do not claim automatic high impact
    }
  }
  const confidenceRank: Record<IntelligenceConfidence, number> = {
    high: 3, moderate: 2, limited: 1, unknown: 0,
  }
  return [...drafts].sort((left, right) =>
    category(right) - category(left) ||
    confidenceRank[right.confidence] - confidenceRank[left.confidence] ||
    right.priority - left.priority ||
    left.fingerprint.localeCompare(right.fingerprint))
}

/**
 * Restrict after owner memory, dependency, source-revision and competing
 * intervention gates, never before. A dismissed high-ranked suggestion must
 * not hide a later eligible one. Preserve full candidate identity separately
 * for saved-ID integrity and historical follow-ups.
 */
export function selectCoachRecommendationSlots<T>(
  drafts: readonly T[],
  limit = 3,
): T[] {
  return drafts.slice(0, Math.max(0, Math.floor(limit)))
}

/** Apply after owner suppression, not merely when drafting: the secondary
 * activity alternative must never survive without its visible calorie parent.
 * This is presentation dependency handling, not an automatic plan mutation. */
export function keepVisibleCoachDependencies(
  drafts: readonly CoachRecommendationDraft[],
): CoachRecommendationDraft[] {
  const intakeParentVisible = drafts.some((item) => item.kind === 'review_intake_adjustment')
  return drafts.filter((item) => item.kind !== 'review_activity_adjustment' || intakeParentVisible)
}

/** A stale settings revision never promotes a numerical calorie-change card.
 * Keep unrelated coaching cards intact; strip the dependent activity alternative.
 */
export function keepCurrentCalorieDecisionDrafts<T extends { kind: string }>(
  drafts: readonly T[],
  revisionCurrent: boolean,
): T[] {
  if (revisionCurrent) return [...drafts]
  return drafts.filter((item) =>
    item.kind !== 'review_intake_adjustment' && item.kind !== 'review_activity_adjustment')
}

/** A historical calorie-review row is actionable only while its original
 * settings revision AND its complete contemporary evidence still qualify.
 * Legacy rows lack this metadata and are therefore never silently upgraded.
 */
export const POSSIBLE_PLATEAU_RESPONSE_GROUP = 'possible_plateau_response' as const

export function isCalorieDecisionKind(kind: string): boolean {
  return kind === 'review_intake_adjustment' || kind === 'review_activity_adjustment'
}

/** A started calorie lever and an activity lever belong to one decision,
 * not two simultaneous prescriptions. Historical owner memory is untouched.
 */
export function keepNonCompetingCalorieDrafts<T extends { kind: string }>(
  drafts: readonly T[],
  activeGroup: boolean,
): T[] {
  return activeGroup ? drafts.filter((draft) => !isCalorieDecisionKind(draft.kind)) : [...drafts]
}

export function storedCoachRecommendationIsCurrent(
  row: { recommendation_kind: string; fingerprint: string; metadata: Record<string, unknown> | null },
  currentDraftFingerprints: ReadonlySet<string>,
  currentDecisionRevision: string | null | undefined,
): boolean {
  if (!isCalorieDecisionKind(row.recommendation_kind)) return true
  const originalRevision = row.metadata?.decisionRevision
  return typeof originalRevision === 'string' && /^[a-f0-9]{32}$/.test(originalRevision) &&
    currentDecisionRevision === originalRevision &&
    currentDraftFingerprints.has(row.fingerprint)
}

/** Filter before applying the UI's 3-item limit, so retired historical
 * calorie rows cannot crowd out a still-current, unrelated owner follow-up.
 */
export function keepCurrentCoachFollowUps<
  T extends { recommendation_kind: string; fingerprint: string; metadata: Record<string, unknown> | null }
>(
  rows: readonly T[],
  currentDraftFingerprints: ReadonlySet<string>,
  currentDecisionRevision: string | null | undefined,
  revisionRechecked: boolean,
  limit = 3,
): T[] {
  return rows.filter((row) =>
    !isCalorieDecisionKind(row.recommendation_kind) ||
      (revisionRechecked && storedCoachRecommendationIsCurrent(
        row, currentDraftFingerprints, currentDecisionRevision))
  ).slice(0, limit)
}

/**
 * Only ask a question when its answer could change a current decision.
 * Check-in existence must be known; a failed source read is NOT evidence that
 * the owner has neglected to complete today's check-in.
 */
export type CoachQuestionContext = { todayWellnessCompleted?: boolean | null }

function questionForLimitation(
  limitation: GoalControlLimitation, control: GoalControlState,
  context: CoachQuestionContext,
): Omit<CoachFollowUpQuestionDraft, 'fingerprint' | 'kind' | 'confidence' | 'evidenceRefs'> | null {
  if (!limitation.detailPath) return null
  if (limitation.code === 'nutrition_quality_floor') {
    // Zero entries need ordinary Nutrition logging, not a nagging question.
    // Already adequate verified coverage cannot justify this prompt either.
    if (control.nutritionQuality.loggedDays === 0 ||
        control.nutritionQuality.state === 'met') return null
    return {
      domain: 'nutrition',
      title: 'Was recent food logging unusually rough or incomplete?',
      detail: 'A short answer or a few corrected entries can be more useful than changing targets from uncertain intake data.',
      actionText: 'Review nutrition',
      detailPath: limitation.detailPath,
    }
  }
  if (limitation.code.startsWith('missing:sleep')) {
    return {
      domain: 'recovery',
      title: 'Are sleep records missing or incomplete for this comparison?',
      detail: 'Review the recorded nights and source coverage before interpreting a sleep or recovery trend.',
      actionText: 'Review sleep records',
      detailPath: '/progress/sleep',
    }
  }
  if (limitation.code.startsWith('missing:wellness')) {
    // Never ask the owner to repeat today's check-in. Fail closed when the
    // check-in state could not be read (unknown is not "not done").
    if (context.todayWellnessCompleted !== false) return null
    return {
      domain: 'recovery',
      title: 'How have energy, soreness, and hunger felt recently?',
      detail: 'A brief check-in can help distinguish a real training signal from a recovery-context gap.',
      actionText: 'Add check-in',
      detailPath: '/check-in',
    }
  }
  if (limitation.code.startsWith('goal_unknown:')) {
    const goalId = limitation.code.slice('goal_unknown:'.length)
    if (!control.goals.some((goal) => goal.id === goalId &&
        goal.lifecycle === 'active' && goal.state === 'unknown' &&
        goal.detailPath === limitation.detailPath)) return null
    return {
      domain: 'goals',
      title: 'Is this still a goal you want Coach to optimize right now?',
      detail: 'Clarifying the goal can be more useful than generating another recommendation from weak evidence.',
      actionText: 'Review goal',
      detailPath: limitation.detailPath,
    }
  }
  // No generic "tell us more" filler when a limitation does not suggest a
  // specific question with decision value.
  return null
}

export function buildCoachFollowUpQuestion(
  control: GoalControlState,
  context: CoachQuestionContext = {},
): CoachFollowUpQuestionDraft | null {
  if (control.state !== 'insufficient_evidence') return null
  // The first limitation may already be addressed or may be only a generic
  // uncertainty notice. Prefer one verified, actionable question or silence.
  for (const limitation of control.limitations) {
    const question = questionForLimitation(limitation, control, context)
    if (!question) continue
    return {
      fingerprint: fingerprint(`question:${limitation.code}`),
      kind: 'follow_up_question',
      confidence: 'limited',
      evidenceRefs: [`limitation:${limitation.code}`],
      ...question,
    }
  }
  return null
}

/**
 * Read the newest question in the existing three-owner-day budget window
 * before offering another one. A historical question that is now resolved
 * must not be displayed, and it must not be replaced by a different prompt
 * until the existing budget expires.
 */
export function coachQuestionPresentation(
  current: CoachFollowUpQuestionDraft | null,
  recent: { fingerprint: string } | null,
): 'reuse' | 'create' | null {
  if (!current) return null
  if (!recent) return 'create'
  return recent.fingerprint === current.fingerprint ? 'reuse' : null
}

export function recommendationIsSuppressed(memory: CoachRecommendationMemory | undefined, asOf: string): boolean {
  if (!memory?.responseState) return false
  if (memory.responseState === 'not_relevant') return true
  // Historical Review and Experiment-preview clicks were incorrectly persisted
  // as decisions. Only an explicitly acknowledged start may suppress on do_this.
  if (memory.responseState === 'do_this') return memory.ownerStarted === true
  if (memory.responseState === 'turn_into_experiment') return false
  return memory.suppressUntil != null && asOf < memory.suppressUntil
}
